import * as XLSX from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import { ParsedTransaction, Category, UserCategoryRule, DB } from './types'
import { guessCategory, matchRuleToCategory } from './categories'
import { todayISO, toISODate } from './format'

// Configure PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
} catch {
  /* worker setup fallback */
}

// -----------------------------------------------------------------------------
// UPI and Bank Narration Cleaner
// -----------------------------------------------------------------------------

export function cleanNarration(raw: string): {
  description: string
  paymentMethod: string | null
  merchant: string | null
} {
  let text = (raw || '').trim()
  if (!text) return { description: 'Transaction', paymentMethod: null, merchant: null }

  let paymentMethod: string | null = null
  let merchant: string | null = null

  // 1. UPI Transaction
  // e.g. "UPI/DR/123456/SWIGGY/swiggy@icici/UPI" or "UPI-SWIGGY-123456-PAYMENT"
  if (/^UPI[/-]/i.test(text) || /\bUPI\b/i.test(text)) {
    paymentMethod = 'UPI'
    const parts = text.split(/[/-]/).map((p) => p.trim()).filter(Boolean)

    // Search for named entity inside UPI parts
    for (const p of parts) {
      if (
        !/^(UPI|DR|CR|PAYMENT|P2A|P2P|NA|NULL|\d+)$/i.test(p) &&
        !/@/.test(p) &&
        p.length >= 2
      ) {
        merchant = p
        break
      }
    }
  }

  // 2. POS / Card swipes
  // e.g. "POS 123456 DMART BANGALORE" or "E-COM/AMAZON/MUMBAI"
  else if (/^(POS|E-?COM|IPS|VISA|MASTERCARD|DEBIT CARD)[/-]?/i.test(text)) {
    paymentMethod = 'Credit Card'
    const cleaned = text.replace(/^(POS|E-?COM|IPS|VISA|MASTERCARD|DEBIT CARD)[/-]?/i, '').replace(/\b\d{5,}\b/g, '').trim()
    const parts = cleaned.split(/[/-]/).map((s) => s.trim()).filter(Boolean)
    merchant = parts[0] || cleaned
  }

  // 3. ATM Withdrawals
  else if (/ATM[- ]?WDL|CASH[- ]?WDL|ATM/i.test(text)) {
    paymentMethod = 'Cash'
    merchant = 'ATM Cash Withdrawal'
  }

  // 4. NEFT / IMPS / RTGS / Bank Transfers
  else if (/^(NEFT|IMPS|RTGS|ACH|NACH|IFT|TPT)[/-]/i.test(text)) {
    paymentMethod = 'Bank'
    const cleaned = text.replace(/^(NEFT|IMPS|RTGS|ACH|NACH|IFT|TPT)[/-]/i, '').replace(/^(CR|DR|P2A)[/-]/i, '').trim()
    const parts = cleaned.split(/[/-]/).map((s) => s.trim()).filter(Boolean)
    for (const p of parts) {
      if (!/^(N\d+|\d+|TRANSFER|PAYMENT)$/i.test(p) && p.length >= 2) {
        merchant = p
        break
      }
    }
  }

  // 5. Interest or Charges
  else if (/INT(EREST)?\.?\s*(PD|CR|CREDIT)?/i.test(text)) {
    paymentMethod = 'Bank'
    merchant = 'Bank Interest'
  } else if (/CHARGES|SMS CHG|ANNUAL FEE/i.test(text)) {
    paymentMethod = 'Bank'
    merchant = 'Bank Service Charges'
  }

  let finalDesc = merchant || text
  // Clean up remaining noise (trailing numbers, reference IDs)
  finalDesc = finalDesc
    .replace(/\b\d{10,}\b/g, '') // strip phone/ref numbers
    .replace(/[/-]+$/, '')
    .trim()

  if (!finalDesc || finalDesc.length < 2) {
    finalDesc = text.slice(0, 40)
  }

  // Capitalize nicely
  finalDesc = finalDesc
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return {
    description: finalDesc,
    paymentMethod,
    merchant: merchant || null,
  }
}

// -----------------------------------------------------------------------------
// Smart Category Resolver
// -----------------------------------------------------------------------------

export function categorizeBankTransaction(
  description: string,
  rawNarration: string,
  type: 'income' | 'expense',
  db: DB
): { category: string; subcategory: string | null } {
  const combined = `${description} ${rawNarration}`

  // Check custom user category rules first
  const ruleMatch = matchRuleToCategory(db.userCategoryRules, combined)
  if (ruleMatch) {
    const cat = db.categories.find((c) => c.id === ruleMatch.categoryId)
    if (cat) {
      const sub = ruleMatch.subcategoryId ? db.categories.find((c) => c.id === ruleMatch.subcategoryId)?.name || null : null
      return { category: cat.name, subcategory: sub }
    }
  }

  // Specific high-frequency Indian merchants
  const lower = combined.toLowerCase()
  if (/swiggy|zomato|domino|mcdonald|starbucks|cafe|burger|pizza|chaat|chai|bakery/i.test(lower)) {
    return { category: 'Food', subcategory: 'Dining Out' }
  }
  if (/blinkit|zepto|instamart|bigbasket|grofers|dmart|supermarket|kirana|dairy|milk|reliance fresh/i.test(lower)) {
    return { category: 'Food', subcategory: 'Groceries' }
  }
  if (/petrol|fuel|indian oil|iocl|hpcl|bharat petrol|bpcl|shell/i.test(lower)) {
    return { category: 'Transportation', subcategory: 'Fuel' }
  }
  if (/uber|ola|rapido|taxi|cab|irctc|metro|redbus|flight|indigo|air india/i.test(lower)) {
    return { category: 'Transportation', subcategory: 'Cab' }
  }
  if (/amazon|flipkart|myntra|ajio|zara|h&m|nykaa|croma|reliance digital/i.test(lower)) {
    return { category: 'Shopping', subcategory: 'Electronics' }
  }
  if (/netflix|spotify|youtube|prime|disney|hotstar|apple|icloud|google one/i.test(lower)) {
    return { category: 'Subscriptions', subcategory: null }
  }
  if (/airtel|jio|vi|vodafone|electricity|bescom|tata power|mahadiscom|adani|water bill/i.test(lower)) {
    return { category: 'Bills', subcategory: 'Electricity' }
  }
  if (/pharmacy|apollo|1mg|netmeds|pharmeasy|hospital|clinic|doctor|diagnostics|medplus/i.test(lower)) {
    return { category: 'Healthcare', subcategory: 'Medicine' }
  }
  if (/rent|landlord|housing|society|maintenance/i.test(lower)) {
    return { category: 'Housing', subcategory: 'Rent' }
  }
  if (/salary|payroll|wage|stipend/i.test(lower)) {
    return { category: 'Income', subcategory: 'Salary' }
  }
  if (/interest/i.test(lower)) {
    return { category: 'Income', subcategory: 'Interest' }
  }
  if (/cashback|reward/i.test(lower)) {
    return { category: 'Income', subcategory: 'Cashback' }
  }

  // Fallback to rule engine
  const guessed = guessCategory(combined)
  return {
    category: guessed.category,
    subcategory: guessed.subcategory,
  }
}

// -----------------------------------------------------------------------------
// Date Parser Helper for Bank Formats
// -----------------------------------------------------------------------------

function parseBankDate(raw: string): string | null {
  if (!raw) return null
  const str = String(raw).trim()

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const dmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (dmy) {
    let year = +dmy[3]
    if (year < 100) year += 2000
    const month = +dmy[2]
    const day = +dmy[1]
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // yyyy-mm-dd
  const ymd = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/)
  if (ymd) {
    const year = +ymd[1]
    const month = +ymd[2]
    const day = +ymd[3]
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // Text months e.g. "16 Aug 2026" or "16-Aug-2026"
  const mmm = str.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{2,4})/)
  if (mmm) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) return toISODate(d)
  }

  return null
}

function cleanAmount(val: unknown): number {
  if (typeof val === 'number') return Math.abs(val)
  if (!val) return 0
  const cleaned = String(val).replace(/[^\d.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : Math.abs(num)
}

// -----------------------------------------------------------------------------
// Excel & CSV Bank Statement Parser
// -----------------------------------------------------------------------------

export function parseExcelOrCsvStatement(
  data: ArrayBuffer | string,
  db: DB
): { transactions: ParsedTransaction[]; bankName?: string } {
  const workbook = typeof data === 'string'
    ? XLSX.read(data, { type: 'string' })
    : XLSX.read(new Uint8Array(data), { type: 'array' })

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return { transactions: [] }

  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' })

  if (!rows || rows.length < 2) return { transactions: [] }

  // Detect header row index
  let headerIndex = -1
  let dateCol = -1
  let descCol = -1
  let debitCol = -1
  let creditCol = -1
  let amountCol = -1
  let typeCol = -1

  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue

    const lower = row.map((cell) => String(cell || '').toLowerCase().trim())
    const dIdx = lower.findIndex((c) => /date|txn\s*date|value\s*date|trans\s*date/.test(c))
    const descIdx = lower.findIndex((c) => /narration|description|particulars|details|remarks|transaction\s*details/.test(c))
    const debIdx = lower.findIndex((c) => /withdrawal|debit|dr|dr\s*amount|withdrawn/.test(c))
    const credIdx = lower.findIndex((c) => /deposit|credit|cr|cr\s*amount|deposited/.test(c))
    const amtIdx = lower.findIndex((c) => /amount|transaction\s*amount/.test(c) && !/debit|credit/.test(c))
    const tIdx = lower.findIndex((c) => /type|cr\/dr|dr\/cr|txn\s*type/.test(c))

    if (dIdx !== -1 && (descIdx !== -1 || (debIdx !== -1 || credIdx !== -1 || amtIdx !== -1))) {
      headerIndex = r
      dateCol = dIdx
      descCol = descIdx !== -1 ? descIdx : 1
      debitCol = debIdx
      creditCol = credIdx
      amountCol = amtIdx
      typeCol = tIdx
      break
    }
  }

  if (headerIndex === -1) {
    // Fallback: assume column 0 is Date, column 1 is Narration, column 2 is Debit, column 3 is Credit
    headerIndex = 0
    dateCol = 0
    descCol = 1
    debitCol = 2
    creditCol = 3
  }

  const transactions: ParsedTransaction[] = []

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row) || row.length === 0) continue

    const rawDate = row[dateCol]
    const parsedDate = parseBankDate(String(rawDate || ''))
    if (!parsedDate) continue

    const rawDesc = String(row[descCol] || '').trim()
    if (!rawDesc) continue

    let amount = 0
    let type: 'income' | 'expense' = 'expense'

    if (debitCol !== -1 && creditCol !== -1) {
      const debitVal = cleanAmount(row[debitCol])
      const creditVal = cleanAmount(row[creditCol])

      if (debitVal > 0) {
        amount = debitVal
        type = 'expense'
      } else if (creditVal > 0) {
        amount = creditVal
        type = 'income'
      }
    } else if (amountCol !== -1) {
      amount = cleanAmount(row[amountCol])
      if (typeCol !== -1) {
        const typeStr = String(row[typeCol] || '').toLowerCase()
        if (/cr|credit|deposit|income/.test(typeStr)) type = 'income'
        else type = 'expense'
      }
    }

    if (amount <= 0) continue

    const { description, paymentMethod, merchant } = cleanNarration(rawDesc)
    const { category, subcategory } = categorizeBankTransaction(description, rawDesc, type, db)

    transactions.push({
      amount: Math.round(amount * 100) / 100,
      currency: db.profile?.currency || 'INR',
      type,
      description,
      category,
      subcategory,
      date: parsedDate,
      paymentMethod: paymentMethod || 'Bank',
      merchant,
      confidence: 0.95,
    })
  }

  return { transactions }
}

// -----------------------------------------------------------------------------
// PDF Bank Statement Parser (with Password Decryption support)
// -----------------------------------------------------------------------------

export async function parsePdfStatement(
  data: ArrayBuffer,
  password: string | null,
  db: DB
): Promise<{ transactions: ParsedTransaction[]; requiresPassword?: boolean }> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(data),
      password: password || undefined,
    })

    const pdf = await loadingTask.promise
    const numPages = pdf.numPages
    const allLines: string[] = []

    for (let p = 1; p <= numPages; p++) {
      const page = await pdf.getPage(p)
      const textContent = await page.getTextContent()
      
      // Group items by Y coordinate (rows)
      const rowsByY: Record<number, Array<{ x: number; text: string }>> = {}
      for (const item of textContent.items as any[]) {
        if (!item.str || !item.transform) continue
        const y = Math.round(item.transform[5])
        const x = Math.round(item.transform[4])
        if (!rowsByY[y]) rowsByY[y] = []
        rowsByY[y].push({ x, text: item.str })
      }

      // Sort rows top-to-bottom
      const sortedY = Object.keys(rowsByY)
        .map(Number)
        .sort((a, b) => b - a)

      for (const y of sortedY) {
        const sortedItems = rowsByY[y].sort((a, b) => a.x - b.x)
        const lineText = sortedItems.map((i) => i.text).join('   ')
        if (lineText.trim()) {
          allLines.push(lineText)
        }
      }
    }

    // Process extracted PDF lines into structured bank transactions
    const transactions: ParsedTransaction[] = []

    for (const line of allLines) {
      // Find date in line
      const dateMatch = line.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/)
      if (!dateMatch) continue

      const parsedDate = parseBankDate(dateMatch[1])
      if (!parsedDate) continue

      // Find amounts in line (e.g. 2,500.00, 200.00)
      const amountMatches = Array.from(line.matchAll(/\b([\d,]+\.\d{2})\b/g)).map((m) => cleanAmount(m[1]))
      if (amountMatches.length === 0) continue

      let type: 'income' | 'expense' = 'expense'
      let amount = amountMatches[0]

      // Detect Debit / Credit indicator in line
      if (/\b(CR|CREDIT|DEPOSIT)\b/i.test(line) && !/\b(DR|DEBIT)\b/i.test(line)) {
        type = 'income'
      } else if (/\b(DR|DEBIT|WITHDRAWAL)\b/i.test(line)) {
        type = 'expense'
      } else if (amountMatches.length >= 2) {
        // Many Indian bank tables list Debit in col 1, Credit in col 2, Balance in col 3
        // If line has multiple amounts, check context
        amount = amountMatches[0]
      }

      if (amount <= 0) continue

      // Clean narration from line by removing date and amounts
      let rawNarration = line
        .replace(dateMatch[0], '')
        .replace(/\b[\d,]+\.\d{2}\b/g, '')
        .replace(/\b(CR|DR|INR|Rs\.?)\b/gi, '')
        .trim()

      const { description, paymentMethod, merchant } = cleanNarration(rawNarration)
      const { category, subcategory } = categorizeBankTransaction(description, rawNarration, type, db)

      transactions.push({
        amount: Math.round(amount * 100) / 100,
        currency: db.profile?.currency || 'INR',
        type,
        description,
        category,
        subcategory,
        date: parsedDate,
        paymentMethod: paymentMethod || 'Bank',
        merchant,
        confidence: 0.9,
      })
    }

    return { transactions }
  } catch (err: any) {
    if (err?.name === 'PasswordException' || err?.message?.toLowerCase().includes('password')) {
      return { transactions: [], requiresPassword: true }
    }
    console.error('Failed to parse PDF statement:', err)
    return { transactions: [] }
  }
}
