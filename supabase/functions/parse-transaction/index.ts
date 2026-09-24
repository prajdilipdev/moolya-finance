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
//   supabase secrets set OPENROUTER_MODEL=some/model:free   # optional, tried before MODELS
//
// Request:  { text: string, categories: { name: string, subs: string[] }[], type?: 'income' | 'expense' }
// Response: { transactions: ParsedTransaction[] }  |  { error: string }

import { withSupabase } from 'npm:@supabase/server'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// Tried in order; the next one takes over the moment one fails (HTTP error,
// rate limit, timeout, empty or non-JSON reply). Picked by benchmarking the
// free models on Indian-English notes: ling-flash-fin was fastest and exact,
// the others matched it for accuracy. OPENROUTER_MODEL, if set, goes first.
const MODELS = [
  'inclusionai/ling-3.0-flash-fin:free',
  'inclusionai/ling-3.0-flash-sante:free',
  'nex-agi/nex-n2.5-mini:free',
]
// Free models are either fast (~2s) or stuck in a queue; move on quickly.
const MODEL_TIMEOUT_MS = 6_000
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
// Generic words a label may add even though the note didn't say them.
const LABEL_HELPERS = new Set([
  'payment', 'gift', 'subscription', 'repair', 'delivery', 'grocery', 'groceries', 'bill', 'fee', 'fees',
  'recharge', 'purchase', 'order', 'refund', 'service', 'ride', 'charges', 'tip', 'salary', 'rent',
  'items', 'and', 'of', 'for', 'to', 'the', 'at', 'from', '&',
])
const LEADING_VERBS = /^(gave|give|paid|pay|bought|buy|spent|spend|got|sent|send|transferred)\s+/i

/**
 * Free models sometimes mangle or invent words ("gave watchman" → "Agave
 * Watchman"). Keep only words that appear in the user's note (allowing for
 * spelling fixes), plus a few generic helper words.
 */
function cleanLabel(label: string, note: string): string {
  const noteWords = note.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const inNote = (w: string) => {
    const lw = w.toLowerCase()
    // Same word, or a spelling fix sharing its first 4 letters (5 for longer words).
    return noteWords.some((n) => {
      if (n === lw) return true
      const k = Math.min(n.length, lw.length) >= 6 ? 5 : 4
      return n.length >= 4 && lw.length >= 4 && n.slice(0, k) === lw.slice(0, k)
    })
  }
  const kept = label
    .replace(LEADING_VERBS, '')
    .split(/\s+/)
    .filter((w) => /^\(.*\)$/.test(w) || /\d/.test(w) || LABEL_HELPERS.has(w.toLowerCase().replace(/[^a-z&]/g, '')) || inNote(w.replace(/[^\w]/g, '')))
    .join(' ')
    .trim()
  // Nothing recognisable left (or only filler) — fall back to the note itself.
  const meaningful = kept.split(' ').some((w) => inNote(w.replace(/[^\w]/g, '')))
  return meaningful ? kept : note.replace(LEADING_VERBS, '').replace(/[\d,.]+\s*(rs|₹|inr)?|₹\s*[\d,.]+/gi, '').trim() || label
}

function validate(raw: unknown, allowed: Map<string, Set<string>>, note: string): ParsedTransaction | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const amount = typeof r.amount === 'number' ? r.amount : Number(r.amount)
  if (!isFinite(amount) || amount <= 0 || amount > 1e12) return null

  const type = r.type === 'income' ? 'income' : 'expense'
  const description = typeof r.description === 'string' && r.description.trim()
    ? cleanLabel(r.description.trim(), note).slice(0, 120)
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

function systemPrompt(categories: { name: string; subs: string[] }[], today: string, forcedType: 'income' | 'expense' | null): string {
  const tree = categories.map((c) => (c.subs.length ? `${c.name}: ${c.subs.join(', ')}` : c.name)).join('\n')
  return `You convert short personal-finance notes written in Indian English into structured transactions.

Today is ${today}. Amounts must be converted to Indian rupees (INR). "2k" means 2000, "1.5 lakh" means 150000, "1 crore" means 10000000.
If the note mentions foreign currency (e.g. $21, 21 USD, €15, £10, 50 AED), convert it to INR (assume 1 USD = 95.60 INR, 1 EUR = 110.30 INR, 1 GBP = 129.00 INR, 1 AED = 26.02 INR, 1 CAD = 68.70 INR, 1 AUD = 67.50 INR, 1 SGD = 74.60 INR) and note the original amount in description e.g. "Domain Renewal ($21)".

Available categories (use these names exactly, or omit):
${tree}

Return ONLY a JSON object, no prose and no markdown fences:
{"transactions":[{"amount":number,"type":"income"|"expense","description":string,"category":string,"subcategory":string|null,"date":"YYYY-MM-DD"|null,"paymentMethod":string|null,"confidence":number}]}

Rules:
- One entry per distinct transaction in the note.
${forcedType
    ? `- The user explicitly marked this as ${forcedType}. type MUST be "${forcedType}" for every entry, and category must be one that fits ${forcedType}.`
    : `- type is "income" only for money received (salary, refund, cashback, client payment); everything else is "expense".`}
- Categorise by what the item actually IS, using your knowledge of Indian food, brands and services. Always choose the most specific subcategory that fits. Examples: "pani poori", "vada pav", "momos", "chai" → Food / Street Food; "chips", "biscuits", "chocolate", "cold drink" → Food / Snacks; "swiggy", "zomato", restaurant meals → Food / Dining Out; "sabzi", "atta", "milk" → Food / Groceries; "rapido", "ola" → Transportation / Cab; "tyre puncture", "bike service" → Transportation / Vehicle Maintenance; "maid", "cook", "watchman", "dhobi" → Housing / Household Help; "jio recharge" → Bills / Mobile; "claude sub", "icloud", "netflix" → Subscriptions.
- Use "Other" only when the item truly fits no category.
- description is a short label built ONLY from words in the note (fix obvious spelling, add a word like "Subscription" or "Repair" if implied). Never invent names, people or brands that are not in the note.
- date is null unless the note states or implies one.
- confidence is 0-1: how sure you are of amount and type.
- If you cannot find an amount, return {"transactions":[]}.`
}

type Message = { role: 'system' | 'user'; content: string }

/** Pulls the JSON object out of a reply; models sometimes wrap it in prose or fences. */
function extractJSON(content: unknown): unknown | null {
  if (typeof content !== 'string') return null
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
}

async function askModels(apiKey: string, messages: Message[]): Promise<unknown | null> {
  const preferred = Deno.env.get('OPENROUTER_MODEL')
  const models = preferred ? [preferred, ...MODELS.filter((m) => m !== preferred)] : MODELS

  for (const model of models) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Moolya Finance',
        },
        body: JSON.stringify({ model, max_tokens: 1500, messages }),
      })
      if (!res.ok) {
        // Log the provider's message, never the key, never to the client.
        console.error('openrouter', model, res.status, (await res.text()).slice(0, 300))
        continue
      }
      const payload = await res.json().catch(() => null)
      const parsed = extractJSON(payload?.choices?.[0]?.message?.content)
      if (parsed !== null) return parsed
      console.error('openrouter', model, 'unusable reply')
    } catch (e) {
      console.error('openrouter', model, e instanceof Error ? e.name : 'error')
    }
  }
  return null
}

export default {
  // auth: 'user' rejects anything without a valid user JWT before we get here,
  // so reaching this body means the caller is signed in.
  fetch: withSupabase({ auth: 'user' }, async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json({ error: 'AI is not configured on the server.' }, 501)

    let body: { text?: unknown; categories?: unknown; type?: unknown }
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
    const forcedType = body.type === 'income' || body.type === 'expense' ? body.type : null

    const today = new Date().toISOString().slice(0, 10)

    const parsed = await askModels(apiKey, [
      { role: 'system', content: systemPrompt(categories, today, forcedType) },
      { role: 'user', content: text },
    ])
    if (parsed === null) return json({ error: 'No AI model produced a usable answer.' }, 502)
    const list = (parsed as { transactions?: unknown })?.transactions
    const transactions = (Array.isArray(list) ? list : [])
      .slice(0, MAX_TRANSACTIONS)
      .map((t) => validate(t, allowed, text))
      .filter((t): t is ParsedTransaction => t !== null)
      // The user's explicit choice beats whatever the model decided.
      .map((t) => (forcedType ? { ...t, type: forcedType } : t))

    return json({ transactions })
  }),
}
