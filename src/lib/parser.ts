import { ParsedTransaction, TransactionType, Category, UserCategoryRule, DB } from './types'
import { guessCategory, matchRuleToCategory, findOrCreateCategory } from './categories'
import { todayISO, toISODate, addDays, uid } from './format'

// ===========================================================================
// Foreign Exchange Rates to INR (1 Foreign Unit = X INR)
// ===========================================================================

export const FX_RATES_TO_INR: Record<string, number> = {
  USD: 87.5,
  EUR: 95.0,
  GBP: 112.0,
  AED: 23.8,
  CAD: 64.0,
  AUD: 57.0,
  SGD: 65.5,
  JPY: 0.58,
  CHF: 98.0,
}

// ===========================================================================
// Amount extraction
// ===========================================================================

const SUFFIX_VALUE: Record<string, number> = {
  k: 1000,
  thousand: 1000,
  lakh: 100000,
  lac: 100000,
  crore: 10000000,
}

function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''))
}

export interface ExtractedAmount {
  amount: number
  rest: string
  originalAmount?: number
  originalCurrency?: string
  convertedNote?: string
}

// Returns the first amount found (converted to INR if foreign) and the remainder of the text.
export function extractAmount(text: string): ExtractedAmount | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // 1. Check foreign currency with prefix ($21, €15, £10, ₹200)
  const prefixPatterns: { pat: RegExp; currency: string; rate: number }[] = [
    { pat: /^\$\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?/i, currency: 'USD', rate: FX_RATES_TO_INR.USD },
    { pat: /\$\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?/i, currency: 'USD', rate: FX_RATES_TO_INR.USD },
    { pat: /€\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?/i, currency: 'EUR', rate: FX_RATES_TO_INR.EUR },
    { pat: /£\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?/i, currency: 'GBP', rate: FX_RATES_TO_INR.GBP },
    { pat: /₹\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?/i, currency: 'INR', rate: 1.0 },
  ]

  for (const { pat, currency, rate } of prefixPatterns) {
    const m = trimmed.match(pat)
    if (m) {
      let value = toNumber(m[1])
      if (m[2] && m[2].toLowerCase() in SUFFIX_VALUE) {
        value *= SUFFIX_VALUE[m[2].toLowerCase()]
      }
      if (isNaN(value) || value <= 0) continue
      const matchedStr = m[0]
      let rest = trimmed.replace(matchedStr, ' ').trim()
      const inrAmount = Math.round(value * rate * 100) / 100
      return {
        amount: inrAmount,
        rest,
        originalAmount: currency !== 'INR' ? value : undefined,
        originalCurrency: currency !== 'INR' ? currency : undefined,
        convertedNote: currency !== 'INR' ? `(${currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : ''}${value} ≈ ₹${inrAmount.toLocaleString('en-IN')})` : undefined,
      }
    }
  }

  // 2. Check foreign currency with suffix (21$, 21 usd, 21 dollars, 15 eur, 10 gbp, 50 aed, etc.)
  const suffixPatterns: { pat: RegExp; currency: string; rate: number }[] = [
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*(\$|usd|dollars?|bucks)\b/i, currency: 'USD', rate: FX_RATES_TO_INR.USD },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*(\$)/i, currency: 'USD', rate: FX_RATES_TO_INR.USD },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*(€|eur|euros?)\b/i, currency: 'EUR', rate: FX_RATES_TO_INR.EUR },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*(£|gbp|pounds?)\b/i, currency: 'GBP', rate: FX_RATES_TO_INR.GBP },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*(aed|dirhams?)\b/i, currency: 'AED', rate: FX_RATES_TO_INR.AED },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*cad\b/i, currency: 'CAD', rate: FX_RATES_TO_INR.CAD },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*aud\b/i, currency: 'AUD', rate: FX_RATES_TO_INR.AUD },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*sgd\b/i, currency: 'SGD', rate: FX_RATES_TO_INR.SGD },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\s*(?:rs|inr|rupees?|rupee)\b/i, currency: 'INR', rate: 1.0 },
    { pat: /([\d,]+(?:\.\d+)?)\s*rs\b/i, currency: 'INR', rate: 1.0 },
    { pat: /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)\b/i, currency: 'INR', rate: 1.0 },
    { pat: /([\d,]+(?:\.\d+)?)/, currency: 'INR', rate: 1.0 },
  ]

  for (const { pat, currency, rate } of suffixPatterns) {
    const m = trimmed.match(pat)
    if (m) {
      let value = toNumber(m[1])
      if (m[2] && m[2].toLowerCase() in SUFFIX_VALUE) {
        value *= SUFFIX_VALUE[m[2].toLowerCase()]
      }
      if (isNaN(value) || value <= 0) continue
      const matchedStr = m[0]
      let rest = trimmed.replace(matchedStr, ' ')
      rest = rest.replace(/\b(rs|inr|rupees?|rupee|₹|\$|usd|dollars?|eur|euros?|gbp|pounds?|aed|cad|aud|sgd)\b/gi, ' ').trim()
      const inrAmount = Math.round(value * rate * 100) / 100
      return {
        amount: inrAmount,
        rest,
        originalAmount: currency !== 'INR' ? value : undefined,
        originalCurrency: currency !== 'INR' ? currency : undefined,
        convertedNote: currency !== 'INR' ? `(${currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : ''}${value} ≈ ₹${inrAmount.toLocaleString('en-IN')})` : undefined,
      }
    }
  }

  return null
}

// ===========================================================================
// Type detection from prefix marks / words
// ===========================================================================

type MarkInfo = { type: TransactionType | null; consumed: string }

function detectMark(text: string): { text: string; type: TransactionType | null } {
  let t = text.trim()
  let type: TransactionType | null = null
  if (/^[+-]/.test(t)) {
    if (t[0] === '-') type = 'expense'
    else if (t[0] === '+') type = 'income'
    t = t.slice(1).trim()
  } else if (/^e[\s:-]+\d/i.test(t)) {
    type = 'expense'
    t = t.replace(/^e[\s:-]+/i, '').trim()
  } else if (/^i[\s:-]+\d/i.test(t)) {
    type = 'income'
    t = t.replace(/^i[\s:-]+/i, '').trim()
  }
  return { text: t, type }
}

const INCOME_WORDS =
  /\b(received|received from|got|earned|earn|salary|sal|income|freelance|cashback|refund|interest|dividend|payout|bonus|from client|credited|paid me|paid to me|wages)\b/i
const EXPENSE_WORDS =
  /\b(spent|spent on|paid|pay|bought|purchased|billed|cost|buy|order|expense|bill payment|for the|paid for)\b/i
const INCOME_HARD = /\b(salary|freelance|cashback|refund|interest|dividend|from client|received)\b/i

export function detectType(text: string, base?: TransactionType | null): TransactionType {
  if (base) return base
  const hasIncome = INCOME_HARD.test(text)
  const hasExpense = /(bill|emi|loan repayment|paid for|spent)/i.test(text)
  if (hasIncome && !hasExpense) return 'income'
  if (INCOME_WORDS.test(text) && !/(paid|bill)/i.test(text)) return 'income'
  return 'expense'
}

// ===========================================================================
// Date parsing
// ===========================================================================

export function detectDate(text: string): { text: string; date: string | null } {
  let t = text.trim()
  const today = todayISO()
  // relative
  if (/\btoday\b/i.test(t)) {
    t = t.replace(/\btoday\b/gi, ' ').trim()
    return { text: t, date: today }
  }
  if (/\byesterday\b/i.test(t)) {
    t = t.replace(/\byesterday\b/gi, ' ').trim()
    return { text: t, date: addDays(today, -1) }
  }
  // yyyy-mm-dd
  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (iso) {
    const d = toISODate(new Date(+iso[1], +iso[2] - 1, +iso[3]))
    t = t.replace(iso[0], ' ').trim()
    return { text: t, date: d }
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/)
  if (dmy) {
    const d = toISODate(new Date(+dmy[3], +dmy[2] - 1, +dmy[1]))
    t = t.replace(dmy[0], ' ').trim()
    return { text: t, date: d }
  }
  // ordinal day within current month: "5th", "15th"
  const ord = t.match(/\b(\d{1,2})(st|nd|rd|th)\b/)
  if (ord && +ord[1] >= 1 && +ord[1] <= 31) {
    const now = new Date()
    const d = toISODate(new Date(now.getFullYear(), now.getMonth(), +ord[1]))
    t = t.replace(ord[0], ' ').trim()
    return { text: t, date: d }
  }
  // "16 Aug 2026" or "aug 16"
  const mon = t.match(/\b(\d{1,2})[\s-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]*(\d{4})?\b/i)
  if (mon) {
    const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
    const now = new Date()
    const year = mon[3] ? +mon[3] : now.getFullYear()
    const d = toISODate(new Date(year, months[mon[2].toLowerCase()], +mon[1]))
    t = t.replace(mon[0], ' ').trim()
    return { text: t, date: d }
  }
  return { text: t, date: null }
}

// ===========================================================================
// Main single-line parser
// ===========================================================================

export function parseLine(
  raw: string,
  opts: { categories?: Category[]; rules?: UserCategoryRule[]; date?: string | null } = {}
): ParsedTransaction | null {
  let text = raw.trim()
  if (!text) return null

  // Handle calculator expression (pure arithmetic)
  const calc = tryCalculator(text)
  if (calc) {
    return {
      amount: calc.value,
      currency: 'INR',
      type: 'expense',
      description: calc.expression,
      category: 'Other',
      subcategory: null,
      confidence: 0.6,
      date: opts.date || todayISO(),
    }
  }

  // Prefix marks / leading keywords
  let marked = detectMark(text)
  text = marked.text
  let baseType = marked.type

  // Date
  const dateRes = detectDate(text)
  text = dateRes.text
  const date = dateRes.date || opts.date || todayISO()

  // A +/- mark may appear right after a date prefix, e.g. "16/08/2026 - 500rs petrol"
  const postDateMark = text.match(/^([-+])\s*/)
  if (postDateMark) {
    baseType = postDateMark[1] === '-' ? 'expense' : 'income'
    text = text.slice(postDateMark[0].length).trim()
  }

  // Payment method
  let paymentMethod: string | null = null
  const pmMatch = text.match(/@([\w\s]+)/)
  if (pmMatch) {
    paymentMethod = pmMatch[1].trim()
    text = text.replace(pmMatch[0], ' ').trim()
  }

  // Category override #Food or #Food/Street
  let categoryOverride: string | null = null
  let subcategoryOverride: string | null = null
  const catMatch = text.match(/#([\w\s/]+)/)
  if (catMatch) {
    const parts = catMatch[1].split('/').map((s) => s.trim())
    categoryOverride = parts[0]
    subcategoryOverride = parts[1] || null
    text = text.replace(catMatch[0], ' ').trim()
  }

  // Amount
  const amountRes = extractAmount(text)
  if (!amountRes) return null
  text = amountRes.rest

  // Resolve type
  const type = detectType(text, baseType)

  // Description = remaining text
  let description = text.replace(/[-\s,]+$/g, '').trim()
  // Extract the object after "on/for": "I spent 200 on pav bhaji" -> "pav bhaji"
  const objMatch = description.match(/\b(?:on|for)\s+(.+?)[,.]?$/i)
  if (objMatch && objMatch[1].trim()) description = objMatch[1].trim()
  // remove common leading verbs / pronouns
  description = description
    .replace(/^i\s+(?:spent|paid|bought|purchased|got|received|earned|made)\s+/i, '')
    .replace(/^(spent|spent on|paid|paid for|bought|purchased|got|received|earned|on|for|in|from)\s+/i, '')
    .trim()
  if (!description) {
    // try to derive from category
    const g = guessCategory(categoryOverride || '')
    description = g.category === 'Other' ? (type === 'income' ? 'Income' : 'Expense') : g.category
  }
  // Capitalize first letter
  description = description.charAt(0).toUpperCase() + description.slice(1)

  // If foreign currency was converted, note the original amount in description
  if (amountRes.originalCurrency && amountRes.originalAmount) {
    const sym = amountRes.originalCurrency === 'USD' ? '$' : amountRes.originalCurrency === 'EUR' ? '€' : amountRes.originalCurrency === 'GBP' ? '£' : amountRes.originalCurrency + ' '
    const tag = `(${sym}${amountRes.originalAmount})`
    if (!description.includes(tag) && !description.includes(`${sym}${amountRes.originalAmount}`)) {
      description = `${description} ${tag}`
    }
  }

  // Category resolution: override > user rule > keyword guess
  let category: string
  let subcategory: string | null
  let confidence = 0.9

  const userRule = matchRuleToCategory(opts.rules || [], description + ' ' + (categoryOverride || ''))
  if (categoryOverride) {
    category = categoryOverride
    subcategory = subcategoryOverride
    confidence = 0.95
  } else if (userRule) {
    const rc = opts.categories?.find((c) => c.id === userRule.categoryId)
    category = rc?.name || 'Other'
    const rs = userRule.subcategoryId ? opts.categories?.find((c) => c.id === userRule.subcategoryId) : null
    subcategory = rs?.name || null
    confidence = 0.9
  } else {
    const g = guessCategory(description + ' ' + text)
    category = g.category
    subcategory = g.subcategory
    confidence = g.confidence
  }

  return {
    amount: amountRes.amount,
    currency: 'INR',
    type,
    description,
    category,
    subcategory,
    date,
    paymentMethod,
    confidence,
  }
}

// ===========================================================================
// Calculator support
// ===========================================================================

export function tryCalculator(text: string): { value: number; expression: string } | null {
  const clean = text.trim().replace(/[₹,]|rs|rupees?|inr/gi, ' ').trim()
  if (!/^[\d+\-*/().\s]+$/.test(clean) || !/\d/.test(clean)) return null
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${clean})`)()
    if (typeof value !== 'number' || !isFinite(value)) return null
    return { value: Math.round(value * 100) / 100, expression: clean.replace(/\s+/g, ' ') }
  } catch {
    return null
  }
}

// ===========================================================================
// Multi-line / comma splitting
// ===========================================================================

function looksLikeNumberToken(token: string): boolean {
  return /^[\d.,]+$/.test(token) || /^[\d.,]+[kKml]?$/.test(token)
}

export function splitInput(raw: string): string[] {
  // split on newlines or semicolons
  let lines = raw.split(/\n+|;/).map((s) => s.trim()).filter(Boolean)
  // additionally split comma-separated within a line only when it contains 2+ amounts
  const result: string[] = []
  for (const line of lines) {
    if (line.includes(',')) {
      const commas = line.split(',').map((s) => s.trim())
      const amountCount = commas.filter((c) => extractAmount(c) || /^[+-]?\s*\d/.test(c)).length
      if (amountCount >= 2) {
        result.push(...commas.filter(Boolean))
        continue
      }
    }
    result.push(line)
  }
  return result
}

// ===========================================================================
// CSV input (the template offered on the Import screen)
// ===========================================================================

// Splits one CSV line, honouring "quoted, fields" and doubled quotes.
function splitCSVLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

const CSV_HEADER = /(^|,)\s*"?amount"?\s*(,|$)/i

export function looksLikeCSV(raw: string): boolean {
  const first = raw.split(/\r?\n/).find((l) => l.trim())
  if (!first || !first.includes(',')) return false
  return CSV_HEADER.test(first) && /date|type|description/i.test(first)
}

export function parseCSV(raw: string): { parsed: ParsedTransaction[]; errors: { line: string; reason: string }[] } {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  const parsed: ParsedTransaction[] = []
  const errors: { line: string; reason: string }[] = []
  if (lines.length === 0) return { parsed, errors }

  const header = splitCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s_-]/g, ''))
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i !== -1) return i
    }
    return -1
  }
  const idx = {
    date: col('date', 'transactiondate'),
    type: col('type'),
    amount: col('amount'),
    currency: col('currency'),
    description: col('description', 'note', 'narration'),
    category: col('category'),
    subcategory: col('subcategory'),
    payment: col('paymentmethod', 'payment'),
  }

  for (const line of lines.slice(1)) {
    const cells = splitCSVLine(line)
    const amount = parseFloat((cells[idx.amount] || '').replace(/[^\d.-]/g, ''))
    if (!isFinite(amount) || amount <= 0) {
      errors.push({ line, reason: 'Missing or invalid amount.' })
      continue
    }
    const rawType = (cells[idx.type] || '').toLowerCase()
    const description = cells[idx.description] || 'Transaction'
    const type: TransactionType = rawType.startsWith('inc') || rawType === 'credit' || rawType === '+'
      ? 'income'
      : rawType.startsWith('exp') || rawType === 'debit' || rawType === '-'
        ? 'expense'
        : detectType(description)
    const guessed = guessCategory(description)
    const date = detectDate((cells[idx.date] || '').trim()).date

    parsed.push({
      amount: Math.round(amount * 100) / 100,
      currency: (cells[idx.currency] || 'INR').toUpperCase() || 'INR',
      type,
      description,
      category: cells[idx.category] || guessed.category,
      subcategory: cells[idx.subcategory] || guessed.subcategory,
      date: date || todayISO(),
      paymentMethod: cells[idx.payment] || null,
      confidence: cells[idx.category] ? 0.95 : guessed.confidence,
    })
  }
  return { parsed, errors }
}

// Parse an entire input block into parsed transactions.
export function parseBlock(
  raw: string,
  db: DB,
  contextDate?: string
): { parsed: ParsedTransaction[]; errors: { line: string; reason: string }[] } {
  if (looksLikeCSV(raw)) return parseCSV(raw)
  const lines = splitInput(raw)
  const parsed: ParsedTransaction[] = []
  const errors: { line: string; reason: string }[] = []

  for (const line of lines) {
    const p = parseLine(line, {
      categories: db.categories,
      rules: db.userCategoryRules,
      date: contextDate || todayISO(),
    })
    if (p) parsed.push(p)
    else errors.push({ line, reason: 'Could not identify an amount.' })
  }
  return { parsed, errors }
}

// ===========================================================================
// Resolve parsed transaction -> concrete Category IDs in the DB
// ===========================================================================

/**
 * Resolve a parsed transaction against a category list, creating any missing
 * category/subcategory on the way.
 *
 * It returns the (possibly extended) category list so the caller can persist
 * it — dropping it would leave transactions pointing at category IDs that
 * exist nowhere, which shows up as a blank category everywhere in the UI.
 */
export function materializeInto(
  parsed: ParsedTransaction,
  categories: Category[]
): { categoryId: string; subcategoryId: string | null; categories: Category[] } {
  const parentName = parsed.category || (parsed.type === 'income' ? 'Income' : 'Other')
  const withParent = findOrCreateCategory(categories, parsed.type, parentName)
  let next = withParent.categories
  const parentId = withParent.id
  let subcategoryId: string | null = null
  if (parsed.subcategory) {
    const sc = findOrCreateCategory(next, parsed.type, parsed.subcategory, undefined, parentId)
    next = sc.categories
    subcategoryId = sc.id
  }
  return { categoryId: parentId, subcategoryId, categories: next }
}

export function categoryIdForName(db: DB, type: TransactionType, name: string): string | null {
  const c = db.categories.find((x) => x.type === type && x.name.toLowerCase() === name.toLowerCase() && !x.parentId)
  return c ? c.id : null
}

export function newId(): string {
  return uid('tx_')
}
