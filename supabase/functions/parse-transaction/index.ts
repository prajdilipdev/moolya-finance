// Supabase Edge Function — AI fallback for Quick Add.
//
// Why this exists at all: the app is a browser-only Vite SPA, so it cannot hold
// an AI provider key. Anything the page can read, so can anyone with devtools.
// This function is the server the app doesn't otherwise have — it holds the key
// as a secret, checks the caller is signed in, and never returns the key.
//
// Auth is handled twice over, by design: the platform verifies the JWT before
// this handler runs (verify_jwt defaults to true), and `withSupabase` with
// auth: 'user' verifies the caller's claims against the project JWKS locally —
// no round-trip to the Auth server per request. SUPABASE_URL, the keys, and
// SUPABASE_JWKS_URL are injected automatically on Edge Functions; only the
// OpenRouter key has to be set by hand.
//
// Deploy:
//   supabase functions deploy parse-transaction
//   supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
//   supabase secrets set OPENROUTER_MODEL=anthropic/claude-opus-5   # optional
//
// Request:  { text: string, categories: { name: string, subs: string[] }[] }
// Response: { transactions: ParsedTransaction[] }  |  { error: string }

import { withSupabase } from 'npm:@supabase/server'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-opus-5'
const MAX_INPUT_CHARS = 2000
const MAX_TRANSACTIONS = 25

// withSupabase owns CORS preflight and the unauthorized responses; these are
// only the headers for the bodies this handler returns itself.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface ParsedTransaction {
  amount: number
  currency: string
  type: 'income' | 'expense'
  description: string
  category: string
  subcategory: string | null
  date: string | null
  paymentMethod: string | null
  confidence: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Strict validation: the model's output is untrusted input, not a result. */
function validate(raw: unknown, allowed: Map<string, Set<string>>): ParsedTransaction | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const amount = typeof r.amount === 'number' ? r.amount : Number(r.amount)
  if (!isFinite(amount) || amount <= 0 || amount > 1e12) return null

  const type = r.type === 'income' ? 'income' : 'expense'
  const description = typeof r.description === 'string' && r.description.trim()
    ? r.description.trim().slice(0, 120)
    : 'Transaction'

  // Only categories the app actually has — never let the model invent one here.
  const category = typeof r.category === 'string' && allowed.has(r.category)
    ? r.category
    : type === 'income' ? 'Income' : 'Other'
  const subs = allowed.get(category)
  const subcategory = typeof r.subcategory === 'string' && subs?.has(r.subcategory) ? r.subcategory : null

  const date = typeof r.date === 'string' && ISO_DATE.test(r.date) ? r.date : null

  const paymentMethod = typeof r.paymentMethod === 'string' && r.paymentMethod.trim()
    ? r.paymentMethod.trim().slice(0, 40)
    : null

  const rawConfidence = typeof r.confidence === 'number' ? r.confidence : 0.7
  const confidence = Math.min(Math.max(rawConfidence, 0), 1)

  return {
    amount: Math.round(amount * 100) / 100,
    currency: 'INR',
    type,
    description: description.charAt(0).toUpperCase() + description.slice(1),
    category,
    subcategory,
    date,
    paymentMethod,
    confidence,
  }
}

function systemPrompt(categories: { name: string; subs: string[] }[], today: string): string {
  const tree = categories.map((c) => (c.subs.length ? `${c.name}: ${c.subs.join(', ')}` : c.name)).join('\n')
  return `You convert short personal-finance notes written in Indian English into structured transactions.

Today is ${today}. Amounts are Indian rupees. "2k" means 2000, "1.5 lakh" means 150000, "1 crore" means 10000000.

Available categories (use these names exactly, or omit):
${tree}

Return ONLY a JSON object, no prose and no markdown fences:
{"transactions":[{"amount":number,"type":"income"|"expense","description":string,"category":string,"subcategory":string|null,"date":"YYYY-MM-DD"|null,"paymentMethod":string|null,"confidence":number}]}

Rules:
- One entry per distinct transaction in the note.
- type is "income" only for money received (salary, refund, cashback, client payment); everything else is "expense".
- description is a short human label, not the raw sentence.
- date is null unless the note states or implies one.
- confidence is 0-1: how sure you are of amount and type.
- If you cannot find an amount, return {"transactions":[]}.`
}

export default {
  // auth: 'user' rejects anything without a valid user JWT before we get here,
  // so reaching this body means the caller is signed in.
  fetch: withSupabase({ auth: 'user' }, async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json({ error: 'AI is not configured on the server.' }, 501)

    let body: { text?: unknown; categories?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400)
    }

    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_INPUT_CHARS) : ''
    if (!text) return json({ error: 'Nothing to parse.' }, 400)

    const categories = Array.isArray(body.categories)
      ? (body.categories as unknown[])
          .filter((c): c is { name: string; subs: string[] } =>
            !!c && typeof c === 'object' && typeof (c as { name?: unknown }).name === 'string')
          .map((c) => ({ name: c.name, subs: Array.isArray(c.subs) ? c.subs.filter((s) => typeof s === 'string') : [] }))
          .slice(0, 60)
      : []
    const allowed = new Map(categories.map((c) => [c.name, new Set(c.subs)]))

    const today = new Date().toISOString().slice(0, 10)

    let upstream: Response
    try {
      upstream = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Aavishkar Finance',
        },
        body: JSON.stringify({
          model: Deno.env.get('OPENROUTER_MODEL') ?? DEFAULT_MODEL,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt(categories, today) },
            { role: 'user', content: text },
          ],
        }),
      })
    } catch {
      return json({ error: 'Could not reach the AI provider.' }, 502)
    }

    if (!upstream.ok) {
      // Surface the provider's message (e.g. an unknown model id) to the
      // function log, but never to the client and never the key.
      const detail = await upstream.text()
      console.error('openrouter error', upstream.status, detail.slice(0, 500))
      return json({ error: `AI provider returned ${upstream.status}.` }, 502)
    }

    const payload = await upstream.json().catch(() => null)
    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return json({ error: 'Empty response from the AI provider.' }, 502)

    // Models sometimes wrap JSON in prose or fences despite instructions.
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start === -1 || end <= start) return json({ transactions: [] })

    let parsed: unknown
    try {
      parsed = JSON.parse(content.slice(start, end + 1))
    } catch {
      return json({ transactions: [] })
    }

    const list = (parsed as { transactions?: unknown })?.transactions
    const transactions = (Array.isArray(list) ? list : [])
      .slice(0, MAX_TRANSACTIONS)
      .map((t) => validate(t, allowed))
      .filter((t): t is ParsedTransaction => t !== null)

    return json({ transactions })
  }),
}
