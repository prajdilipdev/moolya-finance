// UPI / bank narration cleaning — split out of bankParser.ts so this pure
// string-processing function can be shared with the free-text parser
// without dragging in bankParser.ts's pdfjs-dist and xlsx imports.
//
// Those libraries account for ~800KB of the production bundle; bankParser.ts
// also runs a side-effecting top-level statement (setting the PDF.js worker
// URL), which defeats tree-shaking for the whole file. Every page imports
// parser.ts (QuickAdd sits on the Dashboard, the very first page loaded), so
// parser.ts importing this one function from bankParser.ts previously forced
// that entire 800KB onto every visit — including for someone who never opens
// Import. Keeping this function in its own dependency-free module lets
// bankParser.ts (and its heavy imports) load only when Import is actually
// opened.

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
