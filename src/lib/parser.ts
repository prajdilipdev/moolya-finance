import { ParsedTransaction, TransactionType, Category, UserCategoryRule, DB } from './types'
import { guessCategory, matchRuleToCategory, findOrCreateCategory } from './categories'
import { todayISO, toISODate, addDays, uid } from './format'
import { cleanNarration } from './narration'

// ===========================================================================
// Foreign Exchange Rates to INR (1 Foreign Unit = X INR)
// ===========================================================================

export const FX_RATES_TO_INR: Record<string, number> = {
  USD: 95.60,
  EUR: 110.30,
  GBP: 129.00,
  AED: 26.02,
  CAD: 68.70,
  AUD: 67.50,
  SGD: 74.60,
  JPY: 0.64,
  CHF: 112.00,
}

const CURRENCY_SYMBOL_MAP: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' }

/**
 * Detects a foreign-currency marker in a raw amount cell/string (a symbol or
 * an ISO code word) before it gets stripped down to a plain number.
 */
function detectForeignCurrency(raw: string): { currency: string; rate: number } | null {
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOL_MAP)) {
    if (raw.includes(sym)) return { currency: code, rate: FX_RATES_TO_INR[code] }
  }
  const m = raw.match(/\b(usd|eur|gbp|aed|cad|aud|sgd|jpy|chf)\b/i)
  if (m) {
    const code = m[1].toUpperCase()
    if (code in FX_RATES_TO_INR) return { currency: code, rate: FX_RATES_TO_INR[code] }
  }
  return null
}

/**
 * Converts a raw amount string to its INR-equivalent, the convention every
 * calculation in this app assumes `Transaction.amount` already follows.
 * Used by the CSV and table importers, which — unlike the free-text
 * parser's extractAmount() — were reading a foreign amount's digits but
 * storing them as if they were already rupees, silently understating any
 * total that included a foreign-currency row.
 */
function parseAmountToINR(raw: string, explicitCurrency?: string): { amount: number; original: { amount: number; currency: string } | null } {
  const numeric = parseFloat(raw.replace(/[^\d.-]/g, ''))
  const currency = explicitCurrency && explicitCurrency !== 'INR' ? explicitCurrency : detectForeignCurrency(raw)?.currency
  const rate = currency ? FX_RATES_TO_INR[currency] : undefined
  if (currency && rate && isFinite(numeric)) {
    return { amount: Math.round(numeric * rate * 100) / 100, original: { amount: numeric, currency } }
  }
  return { amount: numeric, original: null }
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

/**
 * `fallback` is what to return when the text gives no signal either way —
 * e.g. Quick Add opened from the Income or Expenses page passes the page's
 * own type, so typing something with no explicit income/expense wording
 * lands on that page's type instead of silently defaulting to expense.
 */
export function detectType(text: string, base?: TransactionType | null, fallback: TransactionType = 'expense'): TransactionType {
  if (base) return base
  const hasIncome = INCOME_HARD.test(text)
  const hasExpense = /(bill|emi|loan repayment|paid for|spent)/i.test(text)
  if (hasIncome && !hasExpense) return 'income'
  if (INCOME_WORDS.test(text) && !/(paid|bill)/i.test(text)) return 'income'
  if (EXPENSE_WORDS.test(text)) return 'expense'
  return fallback
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
  // dd/mm/yyyy or dd/mm/yy or dd-mm-yyyy or dd-mm-yy
  const dmy = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (dmy) {
    let year = +dmy[3]
    if (year < 100) year += 2000
    const month = +dmy[2]
    const day = +dmy[1]
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      t = t.replace(dmy[0], ' ').trim()
      return { text: t, date: d }
    }
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
  opts: { categories?: Category[]; rules?: UserCategoryRule[]; date?: string | null; defaultType?: TransactionType } = {}
): ParsedTransaction | null {
  let text = raw.trim()
  if (!text) return null

  // Handle calculator expression (pure arithmetic)
  const calc = tryCalculator(text)
  if (calc) {
    return {
      amount: calc.value,
      currency: 'INR',
      type: opts.defaultType || 'expense',
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
  const type = detectType(text, baseType, opts.defaultType)

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

// ===========================================================================
// Markdown & TSV Table Parser (e.g. | Date | Type | Narration | Category | Amount |)
// ===========================================================================

export function looksLikeTable(raw: string): boolean {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return false
  const header = lines[0]
  if (header.includes('|') && /date|type|narration|amount|category/i.test(header)) return true
  if (header.includes('\t') && /date|type|narration|amount|category/i.test(header)) return true
  return false
}

export function parseMarkdownOrTsvTable(
  raw: string,
  db: DB
): {
  parsed: ParsedTransaction[]
  errors: { line: string; reason: string }[]
  openingBalance?: number
  closingBalance?: number
} {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const parsed: ParsedTransaction[] = []
  const errors: { line: string; reason: string }[] = []
  if (lines.length < 2) return { parsed, errors }

  const isMarkdown = lines[0].includes('|')

  const splitCells = (line: string): string[] => {
    if (isMarkdown) {
      // Split by pipe and trim
      const cells = line.split('|').map((s) => s.trim())
      // Remove leading/trailing empty cells from markdown | border |
      if (cells[0] === '') cells.shift()
      if (cells[cells.length - 1] === '') cells.pop()
      return cells
    }
    return line.split('\t').map((s) => s.trim())
  }

  const rawHeaders = splitCells(lines[0])
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[\s_()₹-]/g, ''))

  const col = (...names: string[]) => {
    for (const n of names) {
      const idx = headers.findIndex((h) => h.includes(n) || n.includes(h))
      if (idx !== -1) return idx
    }
    return -1
  }

  const idx = {
    num: col('#', 'sno', 'no'),
    date: col('date', 'transactiondate', 'valuedt'),
    type: col('type', 'cr/dr', 'dr/cr', 'drcr'),
    description: col('transaction/narration', 'narration', 'transaction', 'description', 'particulars', 'details'),
    category: col('category', 'category/subcategory'),
    amount: col('amount', 'amount₹', 'amt'),
    debit: col('withdrawal', 'withdrawalamt', 'debit', 'dr'),
    credit: col('deposit', 'depositamt', 'credit', 'cr'),
    closing: col('closingbalance', 'closingbal', 'balance', 'closingbalance₹'),
  }

  let openingBalance: number | null = null
  let closingBalance: number | null = null

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // Skip markdown separator lines like | -: | --- |
    if (/^[|\s\-:]+$/.test(line)) continue

    const cells = splitCells(line)
    if (cells.length < 3) continue

    // 1. Date
    const rawDate = idx.date !== -1 ? cells[idx.date] : cells[1]
    const parsedDate = detectDate(rawDate || '').date || todayISO()

    // 2. Narration / Description
    const rawNarration = idx.description !== -1 ? cells[idx.description] : cells[3] || 'Transaction'
    const { description: cleanedDesc, paymentMethod } = cleanNarration(rawNarration)

    // 3. Amount & Type
    let amount = 0
    let type: TransactionType = 'expense'
    let originalForeign: { amount: number; currency: string } | null = null

    if (idx.debit !== -1 && idx.credit !== -1) {
      const debit = parseAmountToINR(cells[idx.debit] || '')
      const credit = parseAmountToINR(cells[idx.credit] || '')
      if (!isNaN(credit.amount) && credit.amount > 0) {
        amount = credit.amount
        originalForeign = credit.original
        type = 'income'
      } else if (!isNaN(debit.amount) && debit.amount > 0) {
        amount = debit.amount
        originalForeign = debit.original
        type = 'expense'
      }
    } else if (idx.amount !== -1) {
      const amtStr = cells[idx.amount] || ''
      const converted = parseAmountToINR(amtStr)
      amount = converted.amount
      originalForeign = converted.original
      const rawType = idx.type !== -1 ? (cells[idx.type] || '').toLowerCase() : ''
      if (rawType.includes('credit') || rawType === 'cr' || rawType === '+' || rawType.includes('income')) {
        type = 'income'
      } else if (rawType.includes('debit') || rawType === 'dr' || rawType === '-' || rawType.includes('expense')) {
        type = 'expense'
      } else {
        type = detectType(rawNarration)
      }
    }

    if (isNaN(amount) || amount <= 0) {
      errors.push({ line, reason: 'Invalid amount.' })
      continue
    }

    // Track opening & closing balance from statement
    if (idx.closing !== -1) {
      const rowClosing = parseFloat((cells[idx.closing] || '').replace(/[^\d.-]/g, ''))
      if (!isNaN(rowClosing)) {
        if (openingBalance === null) {
          openingBalance =
            type === 'expense'
              ? Math.round((rowClosing + amount) * 100) / 100
              : Math.round((rowClosing - amount) * 100) / 100
        }
        closingBalance = rowClosing
      }
    }

    // 4. Category from table or auto-categorize
    let category = 'Other'
    let subcategory: string | null = null

    const rawCat = idx.category !== -1 ? cells[idx.category] : ''
    if (rawCat && rawCat !== '—') {
      const parts = rawCat.split(/[/–-]/).map((s) => s.trim()).filter(Boolean)
      category = parts[0] || 'Other'
      subcategory = parts[1] || null

      // Normalize common table labels to standard app categories
      if (/food|dining/i.test(category)) {
        category = 'Food'
        if (!subcategory) subcategory = 'Dining Out'
      } else if (/shopping|store|online purchase/i.test(category)) {
        category = 'Shopping'
        if (!subcategory) subcategory = 'Online Purchase'
      } else if (/internet|telecom|mobile|phone/i.test(category)) {
        category = 'Bills'
        subcategory = /mobile/i.test(rawCat) ? 'Mobile' : 'Internet'
      } else if (/subscription|software|digital services/i.test(category)) {
        category = 'Subscriptions'
        subcategory = null
      } else if (/pension|apy|insurance/i.test(category)) {
        category = 'Bills'
        subcategory = 'Insurance'
      } else if (/travel|rail|vehicle|auto repair|transport/i.test(category)) {
        category = 'Transportation'
        if (/rail|train|irctc/i.test(rawCat)) subcategory = 'Train'
        else if (/repair|puncter|tyre/i.test(rawCat)) subcategory = 'Maintenance'
      } else if (/transfer received|income/i.test(category) || type === 'income') {
        category = 'Income'
        if (/paypal|freelance/i.test(rawNarration)) subcategory = 'Freelance'
        else if (/transfer/i.test(rawCat)) subcategory = 'Transfer Received'
      }
    } else {
      const g = guessCategory(cleanedDesc + ' ' + rawNarration)
      category = g.category
      subcategory = g.subcategory
    }

    const description = originalForeign
      ? `${cleanedDesc} (${originalForeign.currency} ${originalForeign.amount})`
      : cleanedDesc

    parsed.push({
      amount: Math.round(amount * 100) / 100,
      currency: 'INR',
      type,
      description,
      category,
      subcategory,
      date: parsedDate,
      paymentMethod: paymentMethod || 'Bank',
      confidence: 0.99,
    })
  }

  return { parsed, errors, openingBalance: openingBalance ?? undefined, closingBalance: closingBalance ?? undefined }
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
    const rawCurrency = (cells[idx.currency] || 'INR').toUpperCase() || 'INR'
    const converted = parseAmountToINR(cells[idx.amount] || '', rawCurrency)
    if (!isFinite(converted.amount) || converted.amount <= 0) {
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
      amount: Math.round(converted.amount * 100) / 100,
      // Every calculation in this app assumes amount is already an INR value —
      // store the converted figure and note the source currency in the row
      // rather than tagging a raw foreign number as INR.
      currency: 'INR',
      type,
      description: converted.original ? `${description} (${converted.original.currency} ${converted.original.amount})` : description,
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
  contextDate?: string,
  // What to assume when a line gives no income/expense signal at all — e.g.
  // Quick Add opened from the Income or Expenses page passes that page's
  // type, instead of every ambiguous line silently becoming an expense.
  defaultType?: TransactionType
): {
  parsed: ParsedTransaction[]
  errors: { line: string; reason: string }[]
  openingBalance?: number
  closingBalance?: number
} {
  if (looksLikeTable(raw)) {
    const tableResult = parseMarkdownOrTsvTable(raw, db)
    // looksLikeTable() only checks the header line for a pipe/tab plus a
    // common word like "amount" or "date" — ordinary text pasted from a
    // spreadsheet or chat app can trip that with no real table underneath.
    // A genuine table always yields at least one row; zero means this was a
    // false positive, so fall through to the free-text parser instead of
    // silently reporting "no transactions found".
    if (tableResult.parsed.length > 0) return tableResult
  }
  if (looksLikeCSV(raw)) return parseCSV(raw)
  const lines = splitInput(raw)
  const parsed: ParsedTransaction[] = []
  const errors: { line: string; reason: string }[] = []

  for (const line of lines) {
    const p = parseLine(line, {
      categories: db.categories,
      rules: db.userCategoryRules,
      date: contextDate || todayISO(),
      defaultType,
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
