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
//   supabase secrets set OWNER_USER_ID=<uuid>   # only this account may use OPENROUTER_API_KEY;
//                                               # everyone else uses keys saved in Settings → AI
//
// Request:  { text, categories: { name, subs[] }[], type?: 'income' | 'expense', goals?: string[], bills?: string[] }
// Response: { transactions: ParsedTransaction[], actions: Action[] }  |  { error: string }

import { withSupabase } from 'npm:@supabase/server'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// Free models only, tried in order; the next takes over the moment one fails
// (HTTP error, rate limit, timeout, empty or non-JSON reply). openrouter/free
// is OpenRouter's router across whatever free models are currently up.
// Hard-coded on purpose: users' own keys run here, so nothing may pick a paid model.
const MODELS = ['inclusionai/ling-3.0-flash-sante:free', 'openrouter/free']
// Free models are either fast (~3s, ling-sante up to ~6s) or stuck in a queue; move on after that.
const MODEL_TIMEOUT_MS = 8_000
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

type Action =
  | { kind: 'goal_contribution'; goal: string; amount: number }
  | { kind: 'bill_paid'; bill: string }
  | { kind: 'set_budget'; category: string; amount: number }

/** Actions may only name goals/bills/categories the caller actually has. */
function validateAction(raw: unknown, names: { goals: string[]; bills: string[]; categories: string[] }): Action | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  // Case-insensitive match back to the user's exact spelling.
  const pick = (v: unknown, list: string[]) =>
    typeof v === 'string' ? list.find((n) => n.toLowerCase() === v.trim().toLowerCase()) ?? null : null
  const amount = typeof r.amount === 'number' ? r.amount : Number(r.amount)
  const okAmount = isFinite(amount) && amount > 0 && amount <= 1e12
  const rounded = Math.round(amount * 100) / 100
  if (r.kind === 'goal_contribution') {
    const goal = pick(r.goal, names.goals)
    return goal && okAmount ? { kind: 'goal_contribution', goal, amount: rounded } : null
  }
  if (r.kind === 'bill_paid') {
    const bill = pick(r.bill, names.bills)
    return bill ? { kind: 'bill_paid', bill } : null
  }
  if (r.kind === 'set_budget') {
    const category = pick(r.category, ['Overall', ...names.categories])
    return category && okAmount ? { kind: 'set_budget', category, amount: rounded } : null
  }
  return null
}

/** Date arithmetic on YYYY-MM-DD strings; models are unreliable at it. */
function shiftDate(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekday(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

function systemPrompt(
  categories: { name: string; subs: string[] }[],
  today: string,
  forcedType: 'income' | 'expense' | null,
  goals: string[],
  bills: string[],
): string {
  const tree = categories.map((c) => (c.subs.length ? `${c.name}: ${c.subs.join(', ')}` : c.name)).join('\n')
  return `You are the assistant inside a personal-finance app. You read short notes written in Indian English and turn them into transactions and app actions.

Today is ${today} (${weekday(today)}). Yesterday was ${shiftDate(today, -1)}, the day before yesterday was ${shiftDate(today, -2)}. Use these exact dates for "today", "yesterday", "day before yesterday"; for "last <weekday>" count back from today.
Amounts must be converted to Indian rupees (INR). "2k" means 2000, "1.5 lakh" means 150000, "1 crore" means 10000000.
If the note mentions foreign currency (e.g. $21, 21 USD, €15, £10, 50 AED), convert it to INR (assume 1 USD = 95.60 INR, 1 EUR = 110.30 INR, 1 GBP = 129.00 INR, 1 AED = 26.02 INR, 1 CAD = 68.70 INR, 1 AUD = 67.50 INR, 1 SGD = 74.60 INR) and note the original amount in description e.g. "Domain Renewal ($21)".

Available categories (use these names exactly, or omit):
${tree}

The user's savings goals (use these names exactly): ${goals.length ? goals.join(', ') : '(none)'}
The user's bills (use these names exactly): ${bills.length ? bills.join(', ') : '(none)'}

Return ONLY a JSON object, no prose and no markdown fences:
{"transactions":[{"amount":number,"type":"income"|"expense","description":string,"category":string,"subcategory":string|null,"date":"YYYY-MM-DD"|null,"paymentMethod":string|null,"confidence":number}],
 "actions":[{"kind":"goal_contribution","goal":string,"amount":number} | {"kind":"bill_paid","bill":string} | {"kind":"set_budget","category":string,"amount":number}]}

Actions (use them instead of a transaction when the note is about the app's goals, bills or budgets):
- Putting money into / adding to / saving towards one of the goals above, in any word order ("1000 emergency fund add", "add 5k to goa trip", "saved 2000 for bike") → goal_contribution. Do NOT also add a transaction for it.
- Saying one of the bills above is paid ("paid electricity bill", "rent done") → bill_paid. bill_paid only ticks the bill off and records no money, so if the note gives an amount ALSO add an expense transaction for it ("jio recharge done 299" → bill_paid Jio Recharge + expense 299). With no amount, just bill_paid.
- Setting or changing a budget ("food budget 5000", "set monthly budget 30k") → set_budget; category is one of the category names above, or "Overall" for a total budget.
- Only reference goals and bills from the lists above. If nothing matches, treat the note as a normal transaction.
- Omit "actions" or use [] when there are none.

Transaction rules:
- One entry per distinct transaction in the note.
${forcedType
    ? `- The user explicitly marked this as ${forcedType}. type MUST be "${forcedType}" for every entry, and category must be one that fits ${forcedType}.`
    : `- type is "income" only for money received (salary, refund, cashback, client payment); everything else is "expense".`}
- Categorise by what the item actually IS, using your knowledge of Indian food, brands and services. Always choose the most specific subcategory that fits. Examples: "pani poori", "vada pav", "momos", "chai" → Food / Street Food; "chips", "biscuits", "chocolate", "cold drink" → Food / Snacks; "swiggy", "zomato", restaurant meals → Food / Dining Out; "sabzi", "atta", "milk" → Food / Groceries; "rapido", "ola" → Transportation / Cab; "tyre puncture", "bike service" → Transportation / Vehicle Maintenance; "maid", "cook", "watchman", "dhobi" → Housing / Household Help; "jio recharge" → Bills / Mobile; "claude sub", "icloud", "netflix" → Subscriptions.
- Use "Other" only when the item truly fits no category.
- description is a short label built ONLY from words in the note (fix obvious spelling, add a word like "Subscription" or "Repair" if implied). Never invent names, people or brands that are not in the note.
- date is null unless the note states or implies one.
- confidence is 0-1: how sure you are of amount and type.
- If you cannot find an amount and there is no action, return {"transactions":[],"actions":[]}.`
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
  for (const model of MODELS) {
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
        // Bad key or no credit: every model will fail the same way — next key.
        if (res.status === 401 || res.status === 402 || res.status === 403) return null
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

/**
 * The caller's own OpenRouter keys, newest first. The key column is not
 * granted to browser roles, so this reads it with the service role — scoped
 * to the JWT's user id, which the platform has already verified.
 */
async function userKeys(req: Request): Promise<{ sub: string; keys: string[] }> {
  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  let sub = ''
  try {
    sub = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? ''
  } catch { /* no usable claims → server key only */ }
  if (!url || !service || !/^[0-9a-f-]{36}$/.test(sub)) return { sub, keys: [] }
  try {
    const res = await fetch(`${url}/rest/v1/openrouter_keys?user_id=eq.${sub}&select=key&order=created_at.desc&limit=10`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    })
    if (!res.ok) return { sub, keys: [] }
    return { sub, keys: ((await res.json()) as { key: string }[]).map((r) => r.key) }
  } catch {
    return { sub, keys: [] }
  }
}

export default {
  // auth: 'user' rejects anything without a valid user JWT before we get here,
  // so reaching this body means the caller is signed in.
  fetch: withSupabase({ auth: 'user' }, async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    // Each account brings its own keys. The server key is the owner's only —
    // it is never spent on other users' requests.
    const { sub, keys } = await userKeys(req)
    const serverKey = sub && sub === Deno.env.get('OWNER_USER_ID') ? Deno.env.get('OPENROUTER_API_KEY') : undefined
    const apiKeys = [...keys, serverKey].filter((k): k is string => !!k)
    if (apiKeys.length === 0) {
      return json({ error: 'Add your OpenRouter API key in Settings → AI & Parser to use AI.', code: 'no_key' }, 402)
    }

    let body: { text?: unknown; categories?: unknown; type?: unknown; goals?: unknown; bills?: unknown }
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
    const names = (v: unknown) =>
      Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string' && !!n.trim()).map((n) => n.slice(0, 60)).slice(0, 50) : []
    const goals = names(body.goals)
    const bills = names(body.bills)

    // The app's users are in India: a UTC date would still be "yesterday" until 05:30 IST.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    const messages: Message[] = [
      { role: 'system', content: systemPrompt(categories, today, forcedType, goals, bills) },
      { role: 'user', content: text },
    ]
    let parsed: unknown | null = null
    for (const key of apiKeys) {
      parsed = await askModels(key, messages)
      if (parsed !== null) break
    }
    if (parsed === null) return json({ error: 'No AI model produced a usable answer.' }, 502)
    const list = (parsed as { transactions?: unknown })?.transactions
    const transactions = (Array.isArray(list) ? list : [])
      .slice(0, MAX_TRANSACTIONS)
      .map((t) => validate(t, allowed, text))
      .filter((t): t is ParsedTransaction => t !== null)
      // The user's explicit choice beats whatever the model decided.
      .map((t) => (forcedType ? { ...t, type: forcedType } : t))

    const rawActions = (parsed as { actions?: unknown })?.actions
    const actions = (Array.isArray(rawActions) ? rawActions : [])
      .slice(0, MAX_TRANSACTIONS)
      .map((a) => validateAction(a, { goals, bills, categories: categories.map((c) => c.name) }))
      .filter((a): a is Action => a !== null)

    return json({ transactions, actions })
  }),
}
