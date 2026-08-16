import * as XLSX from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import { ParsedTransaction, DB } from './types'
import { guessCategory, matchRuleToCategory } from './categories'
import { toISODate } from './format'

// Configure PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
} catch {
  /* worker setup fallback */
}

// -----------------------------------------------------------------------------
// Transaction Type (Income vs Expense) & Method Detector
// -----------------------------------------------------------------------------

export function detectBankTransactionType(
  rawNarration: string,
  debitAmount: number,
  creditAmount: number,
  typeIndicator?: string
): 'income' | 'expense' {
  // 1. Explicit separate Credit/Debit amounts
  if (creditAmount > 0 && debitAmount <= 0) {
    return 'income'
  }
  if (debitAmount > 0 && creditAmount <= 0) {
    return 'expense'
  }

  // 2. Explicit Type Column / Indicator (CR, DR, Credit, Debit, Deposit, Withdrawal, etc.)
  if (typeIndicator) {
    const ti = typeIndicator.toUpperCase().trim()
    if (/^(CR|CREDIT|DEP|DEPOSIT|INCOME|C|\+)$/.test(ti) || ti.includes('CR') || ti.includes('CREDIT')) {
      return 'income'
    }
    if (/^(DR|DEBIT|WDL|WITHDRAWAL|EXPENSE|D|-)$/.test(ti) || ti.includes('DR') || ti.includes('DEBIT')) {
      return 'expense'
    }
  }

  // 3. Narration Pattern Matching (Indian Banks & UPI formats)
  const norm = rawNarration.toUpperCase()

  // Strong Credit / Income Indicators
  if (
    /UPI[/-]CR\b|[/ -]CR[/ -]|[/ -]CR$|^CR[/ -]|\bCREDITED\b|\bCREDIT\b|\bDEPOSIT\b|\bDEPOSITED\b/i.test(norm) ||
    /NEFT[/-]CR|IMPS[/-]CR|RTGS[/-]CR|ACH[/-]CR|NACH[/-]CR/i.test(norm) ||
    /\b(SALARY|PAYROLL|STIPEND|DIVIDEND|CASHBACK|REFUND|REVERSAL|INTEREST CREDIT|INT\.PD)\b/i.test(norm) ||
    /RECEIVED FROM|BY TRANSFER|CREDIT ADJUSTMENT|PAYPAL/i.test(norm)
  ) {
    return 'income'
  }

  // Strong Debit / Expense Indicators
  if (
    /UPI[/-]DR\b|[/ -]DR[/ -]|[/ -]DR$|^DR[/ -]|\bDEBITED\b|\bDEBIT\b|\bWITHDRAWAL\b|\bWITHDRAWN\b/i.test(norm) ||
    /NEFT[/-]DR|IMPS[/-]DR|RTGS[/-]DR|ACH[/-]DR|NACH[/-]DR/i.test(norm) ||
    /POS|E-COM|ATM[- ]?WDL|CASH[- ]?WDL|PAID TO|BILLPAY|FEE|CHARGES|AUTOPAY/i.test(norm)
  ) {
    return 'expense'
  }

  // Fallback
  return creditAmount > 0 ? 'income' : 'expense'
}

// -----------------------------------------------------------------------------
// UPI and Bank Narration Cleaner
// -----------------------------------------------------------------------------

export function cleanNarration(raw: string): {
  description: string
  paymentMethod: string | null
  merchant: string | null
} {
  let text = (raw || '').replace(/\s+/g, ' ').trim()
  if (!text) return { description: 'Transaction', paymentMethod: null, merchant: null }

  let paymentMethod: string | null = null
  let merchant: string | null = null

  // 1. UPI Transaction (e.g. "UPI-AMAZON PAY ON DELIVE-AMZNLPA...", "UPI-SARANYA KANNAN-PAYTM...", "UPI-KALURAM...")
  if (/^UPI[/-]/i.test(text) || /\bUPI\b/i.test(text)) {
    paymentMethod = 'UPI'
    const withoutPrefix = text.replace(/^UPI[/-]/i, '').trim()
    const parts = withoutPrefix.split(/[-/]/).map((p) => p.trim()).filter(Boolean)

    // Check for note suffix at the end (e.g. "JIO HOME WIFI", "TYRE PUNCTER", "VEG PUFF", "CLAUDE")
    let noteSuffix: string | null = null
    for (let i = parts.length - 1; i >= 1; i--) {
      const p = parts[i]
      if (
        /^(JIO HOME WIFI|TYRE PUNCTER|VEG PUFF|CLAUDE|RENT|FOOD|MEDICINE|PETROL|CAB|SALARY|FREELANCE)$/i.test(p) ||
        (/^[A-Z\s]{3,25}$/i.test(p) && !/PAYMENT|PHONE|FROM|BANK|HDFC|ICICI|SBI|AXIS|YESB|PUNB|CNRB/i.test(p))
      ) {
        if (!/@/.test(p) && !/\d{5,}/.test(p)) {
          noteSuffix = p
          break
        }
      }
    }

    // Find main name (e.g. "AMAZON PAY", "SARANYA KANNAN", "KALURAM", "APPLE MEDIA SERVICES", "JIO RECHARGE")
    for (const p of parts) {
      if (
        !/^(UPI|DR|CR|AUTOPAY|PAYMENT|P2A|P2P|NA|NULL|\d+)$/i.test(p) &&
        !/@/.test(p) &&
        p.length >= 2
      ) {
        // Strip out noise words
        merchant = p
          .replace(/^(ON DELIVE|DELIVE|PAY TO|PAY VIA|PAYTM|GPAY|PHONEPE)\b/gi, '')
          .replace(/\b(MAHENDARKUMAWAT\d+|THIRUSUDHA\d+|SUNILPRAJAPATI\d+|KUMARKDHIRAJ\d+|DEVARAM\.\w+)\b/gi, '')
          .trim()
        if (merchant) break
      }
    }

    if (merchant && noteSuffix && !merchant.toLowerCase().includes(noteSuffix.toLowerCase())) {
      merchant = `${merchant} - ${noteSuffix}`
    } else if (!merchant && noteSuffix) {
      merchant = noteSuffix
    }
  }

  // 2. POS / Card swipes (e.g. "POS 526099XXXXXX4799 011961 14AUG26 19:44:28 SAN FRANCISCO RENDER.COM", "ME DC SI ... ANTHROPIC* CLAUDE SUB")
  else if (/^(POS|ME DC SI|E-?COM|IPS|VISA|MASTERCARD|DEBIT CARD)/i.test(text)) {
    paymentMethod = 'Credit Card'
    if (/RENDER\.COM/i.test(text)) merchant = 'Render.com'
    else if (/ANTHROPIC.*CLAUDE/i.test(text)) merchant = 'Anthropic Claude Sub'
    else if (/ATLAS FUNDED/i.test(text)) merchant = 'Atlas Funded'
    else {
      const cleaned = text
        .replace(/^(POS|ME DC SI|E-?COM|IPS|VISA|MASTERCARD|DEBIT CARD)\s*/i, '')
        .replace(/\b\d{6,}\b/g, '')
        .replace(/\b\d{2}[A-Za-z]{3}\d{2}\s+\d{2}:\d{2}:\d{2}\b/g, '') // remove timestamps e.g. 14AUG26 19:44:28
        .replace(/\b(DUBAI TAP|SAN FRANCISCO|MUMBAI|BANGALORE|CHENNAI|DELHI)\b/gi, '')
        .trim()
      merchant = cleaned
    }
  }

  // 3. ATM Withdrawals
  else if (/ATM[- ]?WDL|CASH[- ]?WDL|ATM/i.test(text)) {
    paymentMethod = 'Cash'
    merchant = 'ATM Cash Withdrawal'
  }

  // 4. NEFT / IMPS / RTGS (e.g. "NEFT CR-CITI0100000-PAYPAL PAYMENTS PVT L PACB...")
  else if (/^(NEFT|IMPS|RTGS|ACH|NACH|IFT|TPT)/i.test(text)) {
    paymentMethod = 'Bank'
    if (/PAYPAL/i.test(text)) {
      merchant = 'PayPal Payments'
    } else {
      const cleaned = text
        .replace(/^(NEFT|IMPS|RTGS|ACH|NACH|IFT|TPT)[ -]?(CR|DR)?[ -]?/i, '')
        .replace(/\b[A-Z]{4}\d{7}\b/g, '') // strip IFSC
        .replace(/\b(PACB|INR|INCA|TRANSFER|PAYMENT)\b/gi, '')
        .trim()
      const parts = cleaned.split(/[-/]/).map((s) => s.trim()).filter(Boolean)
      merchant = parts[0] || cleaned
    }
  }

  // 5. APY (Atal Pension Yojana) or Insurance/Tax
  else if (/^APY\d+/i.test(text)) {
    paymentMethod = 'Bank'
    merchant = 'APY Pension Installment'
  }

  // 6. International POS markup / Bank charges
  else if (/DC INTL POS TXN MARKUP/i.test(text)) {
    paymentMethod = 'Bank'
    merchant = 'Intl Card Markup & Tax'
  } else if (/INT(EREST)?\.?\s*(PD|CR|CREDIT)?/i.test(text)) {
    paymentMethod = 'Bank'
    merchant = 'Bank Interest'
  } else if (/CHARGES|SMS CHG|ANNUAL FEE/i.test(text)) {
    paymentMethod = 'Bank'
    merchant = 'Bank Service Charges'
  }

  let finalDesc = merchant || text
  // Clean up remaining noise (trailing numbers, reference IDs)
  finalDesc = finalDesc
    .replace(/\b\d{8,}\b/g, '') // strip long reference numbers
    .replace(/[/-]+$/, '')
    .replace(/\s+/g, ' ')
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
      const sub = ruleMatch.subcategoryId
        ? db.categories.find((c) => c.id === ruleMatch.subcategoryId)?.name || null
        : null
      return { category: cat.name, subcategory: sub }
    }
  }

  const lower = combined.toLowerCase()

  // 1. IF INCOME: Always categorize into Income branches
  if (type === 'income') {
    if (/salary|payroll|wage|stipend|monthly sal/i.test(lower)) {
      return { category: 'Income', subcategory: 'Salary' }
    }
    if (/paypal|freelance|client|consulting|contract|invoice|upwork|fiverr/i.test(lower)) {
      return { category: 'Income', subcategory: 'Freelance' }
    }
    if (/cashback|reward|google pay reward|cred cashback|scratch card/i.test(lower)) {
      return { category: 'Income', subcategory: 'Cashback' }
    }
    if (/interest|int\.pd|dividend|yield/i.test(lower)) {
      return { category: 'Income', subcategory: 'Interest' }
    }
    if (/refund|reversal|returned|reimbursement/i.test(lower)) {
      return { category: 'Income', subcategory: 'Other Income' }
    }
    const incCat = db.categories.find((c) => c.type === 'income' && !c.parentId)
    return { category: incCat?.name || 'Income', subcategory: null }
  }

  // 2. IF EXPENSE: Categorize into appropriate Expense branches
  if (/swiggy|zomato|domino|mcdonald|starbucks|cafe|burger|pizza|chaat|chai|bakery|restaurant|dhaba|biryani|veg puff|halwa/i.test(lower)) {
    return { category: 'Food', subcategory: 'Dining Out' }
  }
  if (/blinkit|zepto|instamart|bigbasket|grofers|dmart|supermarket|kirana|dairy|milk|reliance fresh|easwari store|nature basket|more retail/i.test(lower)) {
    return { category: 'Food', subcategory: 'Groceries' }
  }
  if (/petrol|fuel|indian oil|iocl|hpcl|bharat petrol|bpcl|shell|cng/i.test(lower)) {
    return { category: 'Transportation', subcategory: 'Fuel' }
  }
  if (/irctc|train|railway|metro|ticket/i.test(lower)) {
    return { category: 'Transportation', subcategory: 'Train' }
  }
  if (/uber|ola|rapido|taxi|cab|redbus|flight|indigo|air india|makemytrip|goibibo/i.test(lower)) {
    return { category: 'Transportation', subcategory: 'Cab' }
  }
  if (/tyre|puncter|puncture|mechanic|service center/i.test(lower)) {
    return { category: 'Transportation', subcategory: 'Maintenance' }
  }
  if (/amazon|flipkart|myntra|ajio|zara|h&m|nykaa|croma|reliance digital|meesho|tata cliq/i.test(lower)) {
    return { category: 'Shopping', subcategory: 'Electronics' }
  }
  if (/netflix|spotify|youtube|prime|disney|hotstar|apple|icloud|google one|render\.com|anthropic|claude|chatgpt|openai|atlas funded/i.test(lower)) {
    return { category: 'Subscriptions', subcategory: null }
  }
  if (/air fiber|wifi|broadband|internet|jio home wifi/i.test(lower)) {
    return { category: 'Bills', subcategory: 'Internet' }
  }
  if (/jio recharge|airtel|vi|vodafone|mobile recharge/i.test(lower)) {
    return { category: 'Bills', subcategory: 'Mobile' }
  }
  if (/electricity|bescom|tata power|mahadiscom|adani|water bill|gas bill/i.test(lower)) {
    return { category: 'Bills', subcategory: 'Electricity' }
  }
  if (/snapmint|emi|loan|credit card bill/i.test(lower)) {
    return { category: 'Bills', subcategory: 'Loan/EMI' }
  }
  if (/apy|pension|insurance|lic/i.test(lower)) {
    return { category: 'Bills', subcategory: 'Insurance' }
  }
  if (/pharmacy|apollo|1mg|netmeds|pharmeasy|hospital|clinic|doctor|diagnostics|medplus|pathology/i.test(lower)) {
    return { category: 'Healthcare', subcategory: 'Medicine' }
  }
  if (/rent|landlord|housing|society|maintenance|flat/i.test(lower)) {
    return { category: 'Housing', subcategory: 'Rent' }
  }
  if (/markup|fee|charges|atm/i.test(lower)) {
    return { category: 'Other', subcategory: null }
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

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy or dd/mm/yy
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

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue

    const lower = row.map((cell) => String(cell || '').toLowerCase().trim())
    const dIdx = lower.findIndex((c) => /date|txn\s*date|value\s*date|trans\s*date/.test(c))
    const descIdx = lower.findIndex((c) => /narration|description|particulars|details|remarks|transaction\s*details/.test(c))
    const debIdx = lower.findIndex((c) => /withdraw|debit\b|^dr\b|dr\s*amt|dr\s*amount|withdrawn|paid\s*out/i.test(c))
    const credIdx = lower.findIndex((c) => /deposit|credit\b|^cr\b|cr\s*amt|cr\s*amount|deposited|paid\s*in/i.test(c))
    const amtIdx = lower.findIndex((c) => /amount|transaction\s*amount/i.test(c) && !/debit|credit|dr|cr/i.test(c))
    const tIdx = lower.findIndex((c) => /type|cr\/dr|dr\/cr|cr\s*\/\s*dr|txn\s*type/i.test(c))

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

    const debitVal = debitCol !== -1 ? cleanAmount(row[debitCol]) : 0
    const creditVal = creditCol !== -1 ? cleanAmount(row[creditCol]) : 0
    const typeIndicator = typeCol !== -1 ? String(row[typeCol] || '') : ''

    if (debitCol !== -1 && creditCol !== -1) {
      if (creditVal > 0 && debitVal === 0) {
        amount = creditVal
        type = 'income'
      } else if (debitVal > 0 && creditVal === 0) {
        amount = debitVal
        type = 'expense'
      } else {
        type = detectBankTransactionType(rawDesc, debitVal, creditVal, typeIndicator)
        amount = type === 'income' ? (creditVal || debitVal) : (debitVal || creditVal)
      }
    } else if (amountCol !== -1) {
      const rawAmt = row[amountCol]
      const isNegative = typeof rawAmt === 'string' && (rawAmt.includes('-') || rawAmt.includes('('))
      amount = cleanAmount(rawAmt)
      if (isNegative) {
        type = 'expense'
      } else {
        type = detectBankTransactionType(rawDesc, 0, 0, typeIndicator)
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
// Specialized Indian Bank PDF Statement Parser (HDFC, SBI, ICICI, Axis, Kotak)
// -----------------------------------------------------------------------------

interface PDFTextItem {
  str: string
  x: number
  y: number
  width: number
}

interface TransactionBlock {
  date: string
  narrationParts: string[]
  debitAmount: number
  creditAmount: number
  closingBalance?: number
  rawLine: string
}

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
    const transactions: ParsedTransaction[] = []

    for (let p = 1; p <= numPages; p++) {
      const page = await pdf.getPage(p)
      const textContent = await page.getTextContent()

      const items: PDFTextItem[] = []
      for (const item of textContent.items as any[]) {
        if (!item.str || !item.transform) continue
        const str = item.str.trim()
        if (!str) continue
        const x = Math.round(item.transform[4])
        const y = Math.round(item.transform[5])
        items.push({ str, x, y, width: item.width || 0 })
      }

      // Group items into rows by Y coordinate
      const rowsByY: Record<number, PDFTextItem[]> = {}
      for (const item of items) {
        // Round Y to nearest 3px to merge text on the same line
        const roundedY = Math.round(item.y / 3) * 3
        if (!rowsByY[roundedY]) rowsByY[roundedY] = []
        rowsByY[roundedY].push(item)
      }

      // Sort rows top-to-bottom
      const sortedY = Object.keys(rowsByY)
        .map(Number)
        .sort((a, b) => b - a)

      // Detect table header columns X positions on this page
      let withdrawalX = 430 // standard HDFC defaults
      let depositX = 500
      let balanceX = 570

      for (const y of sortedY) {
        const rowItems = rowsByY[y]
        for (const it of rowItems) {
          const lower = it.str.toLowerCase()
          if (/withdrawal|debit|dr\s*amt/i.test(lower)) withdrawalX = it.x
          if (/deposit|credit|cr\s*amt/i.test(lower)) depositX = it.x
          if (/closing\s*balance|balance/i.test(lower)) balanceX = it.x
        }
      }

      // Group multi-line transaction blocks
      const blocks: TransactionBlock[] = []
      let currentBlock: TransactionBlock | null = null

      for (const y of sortedY) {
        const rowItems = rowsByY[y].sort((a, b) => a.x - b.x)
        const firstItem = rowItems[0]

        // Ignore headers & footers
        const fullRowText = rowItems.map((i) => i.str).join(' ')
        if (
          /STATEMENT SUMMARY|Opening Balance|Closing balance includes|Contents of this statement|Page No\s*\./i.test(
            fullRowText
          )
        ) {
          continue
        }

        // Check if row begins with a new transaction date (x < 100)
        const dateMatch = firstItem && firstItem.x < 100 ? firstItem.str.match(/^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/) : null

        if (dateMatch) {
          const parsedDate = parseBankDate(dateMatch[1])
          if (parsedDate) {
            if (currentBlock) {
              blocks.push(currentBlock)
            }
            currentBlock = {
              date: parsedDate,
              narrationParts: [],
              debitAmount: 0,
              creditAmount: 0,
              rawLine: fullRowText,
            }
          }
        }

        if (currentBlock) {
          for (const it of rowItems) {
            const val = cleanAmount(it.str)

            // Narration column (x between 60 and 380)
            if (it.x >= 60 && it.x < 370) {
              if (!/^\d{16}$/.test(it.str)) {
                // exclude pure 16-digit ref numbers from description
                currentBlock.narrationParts.push(it.str)
              }
            }

            // Amount columns (x >= 370)
            if (val > 0 && /\d+\.\d{2}/.test(it.str)) {
              // Compare distance to Withdrawal vs Deposit vs Balance
              const distWithdrawal = Math.abs(it.x - withdrawalX)
              const distDeposit = Math.abs(it.x - depositX)
              const distBalance = Math.abs(it.x - balanceX)

              if (distWithdrawal <= distDeposit && distWithdrawal <= distBalance) {
                currentBlock.debitAmount = val
              } else if (distDeposit <= distWithdrawal && distDeposit <= distBalance) {
                currentBlock.creditAmount = val
              } else {
                currentBlock.closingBalance = val
              }
            }
          }
        }
      }

      if (currentBlock) {
        blocks.push(currentBlock)
      }

      // Convert blocks to structured transactions
      for (const block of blocks) {
        const rawNarration = block.narrationParts.join(' ').trim() || block.rawLine
        let type: 'income' | 'expense' = 'expense'
        let amount = 0

        if (block.creditAmount > 0 && block.debitAmount === 0) {
          type = 'income'
          amount = block.creditAmount
        } else if (block.debitAmount > 0 && block.creditAmount === 0) {
          type = 'expense'
          amount = block.debitAmount
        } else {
          type = detectBankTransactionType(rawNarration, block.debitAmount, block.creditAmount)
          amount = type === 'income' ? (block.creditAmount || block.debitAmount) : (block.debitAmount || block.creditAmount)
        }

        if (amount <= 0) continue

        const { description, paymentMethod, merchant } = cleanNarration(rawNarration)
        const { category, subcategory } = categorizeBankTransaction(description, rawNarration, type, db)

        transactions.push({
          amount: Math.round(amount * 100) / 100,
          currency: db.profile?.currency || 'INR',
          type,
          description,
          category,
          subcategory,
          date: block.date,
          paymentMethod: paymentMethod || 'Bank',
          merchant,
          confidence: 0.98,
        })
      }
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
