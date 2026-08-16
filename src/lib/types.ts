export type TransactionType = 'income' | 'expense'
export type Source = 'manual' | 'quick_entry' | 'ai_parser' | 'import' | 'recurring'

export interface Profile {
  id: string
  name: string
  email: string
  currency: string
  timezone: string
  theme: 'light' | 'dark' | 'system'
  onboarded: boolean
  monthlyIncome?: number | null
  initialBalance?: number | null
  createdAt: string
}

export interface Category {
  id: string
  name: string
  type: TransactionType
  parentId: string | null
  icon: string
  system: boolean
}

export interface PaymentMethod {
  id: string
  name: string
  icon: string
  system: boolean
}

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  currency: string
  description: string
  categoryId: string
  subcategoryId: string | null
  merchant: string | null
  paymentMethodId: string | null
  transactionDate: string // ISO date yyyy-mm-dd
  notes: string | null
  source: Source
  parserConfidence: number | null
  createdAt: string
  updatedAt: string
}

export type BudgetPeriod = 'monthly' | 'weekly' | 'yearly' | 'custom'

export interface Budget {
  id: string
  name: string
  type: 'overall' | 'category'
  categoryId: string | null
  amount: number
  period: BudgetPeriod
  startDate: string | null
  endDate: string | null
  rollover: boolean
  createdAt: string
}

export type Frequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'halfyearly'
  | 'yearly'
  | 'custom'

export interface Recurring {
  id: string
  name: string
  type: TransactionType
  amount: number
  categoryId: string
  subcategoryId: string | null
  frequency: Frequency
  startDate: string
  nextDueDate: string | null
  endDate: string | null
  paymentMethodId: string | null
  autoCreate: boolean
  reminder: boolean
  notes: string | null
  active: boolean
  createdAt: string
}

export interface Bill {
  id: string
  name: string
  amount: number
  dueDate: string
  recurrence: Frequency | 'none'
  categoryId: string
  paymentMethodId: string | null
  paid: boolean
  reminder: boolean
  notes: string | null
  createdAt: string
}

export interface Subscription {
  id: string
  name: string
  amount: number
  frequency: 'monthly' | 'yearly'
  categoryId: string
  paymentMethodId: string | null
  active: boolean
  nextBilling: string | null
  notes: string | null
  createdAt: string
}

export interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  targetDate: string | null
  monthlyContribution: number | null
  icon: string
  createdAt: string
}

export interface Debt {
  id: string
  name: string
  originalBalance: number
  currentBalance: number
  interestRate: number | null
  minPayment: number | null
  dueDate: string | null
  frequency: Frequency
  paymentAmount: number
  categoryId: string | null
  createdAt: string
}

export interface UserCategoryRule {
  id: string
  keyword: string
  categoryId: string
  subcategoryId: string | null
}

export interface ParsedTransaction {
  amount: number
  currency: string
  type: TransactionType
  description: string
  category: string
  subcategory?: string | null
  date?: string | null
  paymentMethod?: string | null
  merchant?: string | null
  recurring?: boolean
  confidence: number
}

export interface DB {
  version: number
  profile: Profile | null
  categories: Category[]
  paymentMethods: PaymentMethod[]
  transactions: Transaction[]
  budgets: Budget[]
  recurring: Recurring[]
  bills: Bill[]
  subscriptions: Subscription[]
  goals: Goal[]
  debts: Debt[]
  userCategoryRules: UserCategoryRule[]
  updatedAt: string
}
