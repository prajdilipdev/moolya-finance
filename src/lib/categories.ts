import { Category, PaymentMethod, UserCategoryRule } from './types'
import { uid } from './format'

export const CATEGORY_ICONS: Record<string, string> = {
  Food: 'Utensils',
  'Street Food': 'Flame',
  Snacks: 'Cookie',
  Groceries: 'ShoppingBasket',
  'Dining Out': 'Coffee',
  Transportation: 'Car',
  Fuel: 'Fuel',
  Cab: 'CarTaxiFront',
  Train: 'TrainFront',
  Public: 'Bus',
  Housing: 'Home',
  Rent: 'House',
  'Home Maintenance': 'Wrench',
  Utilities: 'Zap',
  Electricity: 'PlugZap',
  Water: 'Droplets',
  Gas: 'Flame',
  Bills: 'FileText',
  Mobile: 'Smartphone',
  Internet: 'Wifi',
  Healthcare: 'HeartPulse',
  Medicine: 'Pill',
  Education: 'GraduationCap',
  Shopping: 'ShoppingBag',
  Electronics: 'MonitorSmartphone',
  Clothing: 'Shirt',
  Entertainment: 'Film',
  Travel: 'Plane',
  Subscriptions: 'Repeat',
  'Debt & EMI': 'CreditCard',
  'Personal Care': 'Sparkles',
  Other: 'CircleDashed',
  Income: 'Wallet',
  Salary: 'Briefcase',
  Freelance: 'Laptop',
  Business: 'Building2',
  Investments: 'TrendingUp',
  Interest: 'Percent',
  Cashback: 'BadgePercent',
  Gifts: 'Gift',
  'Other Income': 'Coins',
  Savings: 'PiggyBank',
}

const E = 'expense'
const I = 'income'

export function defaultCategories(): Category[] {
  const list: Category[] = []
  const add = (name: string, type: string, parent: string | null, icon: string, system = true) =>
    list.push({ id: uid('cat_'), name, type: type as 'income' | 'expense', parentId: parent, icon, system })

  // Expense parents
  add('Food', E, null, 'Utensils')
  add('Transportation', E, null, 'Car')
  add('Housing', E, null, 'Home')
  add('Utilities', E, null, 'Zap')
  add('Bills', E, null, 'FileText')
  add('Healthcare', E, null, 'HeartPulse')
  add('Education', E, null, 'GraduationCap')
  add('Shopping', E, null, 'ShoppingBag')
  add('Entertainment', E, null, 'Film')
  add('Travel', E, null, 'Plane')
  add('Subscriptions', E, null, 'Repeat')
  add('Debt & EMI', E, null, 'CreditCard')
  add('Personal Care', E, null, 'Sparkles')
  add('Other', E, null, 'CircleDashed')

  // Expense children
  add('Street Food', E, 'Food', 'Flame')
  add('Snacks', E, 'Food', 'Cookie')
  add('Groceries', E, 'Food', 'ShoppingBasket')
  add('Dining Out', E, 'Food', 'Coffee')
  add('Fuel', E, 'Transportation', 'Fuel')
  add('Cab', E, 'Transportation', 'CarTaxiFront')
  add('Train', E, 'Transportation', 'TrainFront')
  add('Public', E, 'Transportation', 'Bus')
  add('Rent', E, 'Housing', 'House')
  add('Home Maintenance', E, 'Housing', 'Wrench')
  add('Electricity', E, 'Utilities', 'PlugZap')
  add('Water', E, 'Utilities', 'Droplets')
  add('Gas', E, 'Utilities', 'Flame')
  add('Mobile', E, 'Bills', 'Smartphone')
  add('Internet', E, 'Bills', 'Wifi')
  add('Medicine', E, 'Healthcare', 'Pill')
  add('Electronics', E, 'Shopping', 'MonitorSmartphone')
  add('Clothing', E, 'Shopping', 'Shirt')

  // Income parents
  add('Income', I, null, 'Wallet')
  add('Salary', I, 'Income', 'Briefcase')
  add('Freelance', I, 'Income', 'Laptop')
  add('Business', I, 'Income', 'Building2')
  add('Investments', I, 'Income', 'TrendingUp')
  add('Interest', I, 'Income', 'Percent')
  add('Cashback', I, 'Income', 'BadgePercent')
  add('Gifts', I, 'Income', 'Gift')
  add('Other Income', I, 'Income', 'Coins')

  return list
}

export function defaultPaymentMethods(): PaymentMethod[] {
  return [
    { id: 'pm_upi', name: 'UPI', icon: 'Smartphone', system: true },
    { id: 'pm_cash', name: 'Cash', icon: 'Banknote', system: true },
    { id: 'pm_bank', name: 'Bank', icon: 'Landmark', system: true },
    { id: 'pm_cc', name: 'Credit Card', icon: 'CreditCard', system: true },
    { id: 'pm_dc', name: 'Debit Card', icon: 'CreditCard', system: true },
    { id: 'pm_other', name: 'Other', icon: 'CircleDashed', system: true },
  ]
}

// --- Smart categorization rules (local keyword matching) ---
// Order matters: first match wins (most specific first).
const RULES: Array<[RegExp, string, string | null, number]> = [
  // Electronics first (cable contains "cab", phone etc.)
  [/charger|cable|earphone|headphone|electronics|gadget|laptop|screen|phone case|phone cover|phone/i, 'Shopping', 'Electronics', 0.85],
  [/shirt|jeans|dress|clothing|clothes|shoes|apparel|trouser/i, 'Shopping', 'Clothing', 0.8],
  [/pav bhaji|pani ?p(?:oo|u)ri|gol ?gappe?|golgappa|puchka|chaat|bhel|sev ?puri|dahi ?puri|ragda|dabeli|vada ?pav|misal|kachori|momos?|frankie|kathi roll|egg roll|chole bhature|pakod?a|bhaji|street food|\bchai\b|\btea\b|cutting|samosa|vada|idli|dosa|poha|upma|maggi|sandwich|kulfi|gola|jalebi|lassi|nimbu pani|sugarcane|ganne ka ras|coconut water|nariyal pani/i, 'Food', 'Street Food', 0.9],
  [/snacks?|chips|lays|kurkure|namkeen|bhujia|biscuits?|cookies?|chocolates?|dairy milk|kitkat|candy|toffee|ice ?cream|cold ?drink|soft drink|coke|pepsi|sprite|thums up|juice|popcorn|nachos|cake|pastry|donut|mithai|sweets|ladoo|barfi/i, 'Food', 'Snacks', 0.85],
  [/veg|vegetable|vegetables|milk|bread|dairy|grocery|groceries|grocer|kirana|provision|ration|egg|fruits|fruit|onion|rice|daal|dal/i, 'Food', 'Groceries', 0.85],
  [/swiggy|zomato|restaurant|food delivery|dominos|mcdonalds|pizza|burger/i, 'Food', 'Dining Out', 0.85],
  [/\bfood\b|meal|lunch|dinner|breakfast|snack|tiffin|biryani|thali/i, 'Food', null, 0.7],
  [/petrol|diesel|fuel|indian oil|hp petrol|bharat petrol/i, 'Transportation', 'Fuel', 0.9],
  [/uber|ola|rapido|taxi|\bcab\b/i, 'Transportation', 'Cab', 0.9],
  [/train|rail|irctc|metro|\bbus pass\b/i, 'Transportation', 'Train', 0.85],
  [/\bbus\b|busfare/i, 'Transportation', 'Public', 0.8],
  [/\brent\b/i, 'Housing', 'Rent', 0.95],
  [/maintenance|plumber|\brepair\b|home depot/i, 'Housing', 'Home Maintenance', 0.8],
  [/electricity|bijli|power bill|light bill|electric/i, 'Utilities', 'Electricity', 0.9],
  [/water bill|\bwater\b|pipeline/i, 'Utilities', 'Water', 0.9],
  [/\bgas\b|cylinder|lpg|indane/i, 'Utilities', 'Gas', 0.85],
  [/mobile|recharge|jio|airtel|\bvi\b|vodafone|\bsim\b/i, 'Bills', 'Mobile', 0.85],
  [/internet|wifi|broadband|\bact\b|fiber|net bill/i, 'Bills', 'Internet', 0.85],
  [/\bbill\b|bills/i, 'Bills', null, 0.7],
  [/hospital|doctor|clinic|medicine|pharmacy|health|dental|checkup/i, 'Healthcare', 'Medicine', 0.85],
  [/school|college|course|class|tuition|fees|books?|education/i, 'Education', null, 0.8],
  [/movie|cinema|concert|gaming|theatre|hotstar/i, 'Entertainment', null, 0.8],
  [/hotel|flight|\bair\b|trip|vacation|holiday|travel/i, 'Travel', null, 0.8],
  [/subscription|netflix|spotify|youtube premium|\bprime\b|icloud|google one|crm|\bsoftware\b/i, 'Subscriptions', null, 0.85],
  [/emi|\bloan\b|credit card|\bdebit\b|repayment|instalment/i, 'Debt & EMI', null, 0.85],
  [/salon|barber|\bgym\b|haircut|spa|grooming|personal care/i, 'Personal Care', null, 0.8],
  [/salary|\bsal\b|wage|payout|monthly pay/i, 'Income', 'Salary', 0.99],
  [/freelance|client|project|gig|consult|invoice|contract/i, 'Income', 'Freelance', 0.9],
  [/\bbusiness\b|shop|sale revenue|\brevenue\b/i, 'Income', 'Business', 0.85],
  [/stock|mutual fund|share|dividend|\binvest\b|sip|nifty/i, 'Income', 'Investments', 0.85],
  [/interest|\bfd\b|\brd\b|savings interest/i, 'Income', 'Interest', 0.85],
  [/cashback|refund|reward|coupon/i, 'Income', 'Cashback', 0.85],
  [/\bgift\b|bonus|festival|birthday/i, 'Income', 'Gifts', 0.85],
]

const INCOME_WORDS = /received|got|earned|salary|freelance|cashback|refund|interest|dividend|income|payout|from client|bonus|gift|revenue|sale|credit|paid me|credited/i

export function guessCategory(text: string): {
  category: string
  subcategory: string | null
  confidence: number
  isIncome: boolean
} {
  const income = INCOME_WORDS.test(text) && !/(bill|emi|loan repayment)/i.test(text)
  for (const [re, cat, sub, conf] of RULES) {
    if (re.test(text)) {
      return { category: cat, subcategory: sub, confidence: conf, isIncome: cat === 'Income' }
    }
  }
  // Default by type
  if (income) return { category: 'Income', subcategory: 'Other Income', confidence: 0.55, isIncome: true }
  return { category: 'Other', subcategory: null, confidence: 0.5, isIncome: false }
}

export function matchRuleToCategory(rules: UserCategoryRule[], text: string) {
  const lower = text.toLowerCase()
  for (const r of rules) {
    if (lower.includes(r.keyword.toLowerCase())) {
      return r
    }
  }
  return null
}

export function categoryLabel(id: string | null, categories: Category[]): string {
  if (!id) return '—'
  const c = categories.find((x) => x.id === id)
  return c ? c.name : '—'
}

export function categoryIcon(id: string | null, categories: Category[]): string {
  if (!id) return 'CircleDashed'
  const c = categories.find((x) => x.id === id)
  return c?.icon || 'CircleDashed'
}

// Muted, sophisticated per-category color (hex). Used for icons, chips & chart
// series. Soft backgrounds are derived via alpha in components.
const CAT_COLORS: Record<string, string> = {
  Food: '#D97706', 'Street Food': '#D97706', Snacks: '#EA580C', Groceries: '#F59E0B', 'Dining Out': '#FB923C',
  Transportation: '#2563EB', Fuel: '#3B82F6', Cab: '#60A5FA', Train: '#1D4ED8', Public: '#93C5FD',
  Housing: '#475569', Rent: '#64748B', 'Home Maintenance': '#94A3B8',
  Utilities: '#0D9488', Electricity: '#14B8A6', Water: '#22D3EE', Gas: '#2DD4BF',
  Bills: '#D97706', Mobile: '#F59E0B', Internet: '#FB923C',
  Healthcare: '#E11D48', Medicine: '#F43F5E',
  Education: '#4F46E5', Shopping: '#7C3AED', Electronics: '#8B5CF6', Clothing: '#A78BFA',
  Entertainment: '#DB2777', Travel: '#0891B2', Subscriptions: '#9333EA',
  'Debt & EMI': '#DC2626', 'Personal Care': '#C026D3', Other: '#64748B',
  Income: '#059669', Salary: '#10B981', Freelance: '#34D399', Business: '#0D9488',
  Investments: '#3B82F6', Interest: '#0EA5E9', Cashback: '#22C55E', Gifts: '#EC4899',
  'Other Income': '#14B8A6', Savings: '#10B981',
}

export function categoryColor(name: string | null | undefined): string {
  if (!name) return '#64748B'
  return CAT_COLORS[name] || '#64748B'
}

// Returns { hex, soft } where soft is a low-alpha background color.
export function categoryColorPair(name: string | null | undefined): { hex: string; soft: string } {
  const hex = categoryColor(name)
  return { hex, soft: hex + '1A' }
}

export function findOrCreateCategory(
  categories: Category[],
  type: 'income' | 'expense',
  name: string,
  icon?: string,
  parentId: string | null = null,
  system = false
): { categories: Category[]; id: string } {
  const existing = categories.find(
    (c) => c.name.toLowerCase() === name.toLowerCase() && c.type === type && (c.parentId ?? null) === parentId
  )
  if (existing) return { categories, id: existing.id }
  const cat: Category = {
    id: uid('cat_'),
    name,
    type,
    parentId,
    icon: icon || 'Tag',
    system,
  }
  return { categories: [...categories, cat], id: cat.id }
}
