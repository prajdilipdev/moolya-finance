import { DB, Transaction, Profile, Budget, Recurring, Bill, Subscription, Goal, Debt, UserCategoryRule, Category, PaymentMethod } from './types'
import { defaultCategories, defaultPaymentMethods } from './categories'
import { todayISO, addDays, uid, toISODate, advanceByFrequency } from './format'

const KEY = 'aavishkar.finance.v1'

export function defaultDB(): DB {
  return {
    version: 1,
    profile: null,
    categories: defaultCategories(),
    paymentMethods: defaultPaymentMethods(),
    transactions: [],
    budgets: [],
    recurring: [],
    bills: [],
    subscriptions: [],
    goals: [],
    debts: [],
    userCategoryRules: [],
    updatedAt: new Date().toISOString(),
  }
}

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      if (parsed && parsed.version) return parsed
    }
  } catch {
    /* ignore */
  }
  return defaultDB()
}

export function saveDB(db: DB): void {
  db.updatedAt = new Date().toISOString()
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage full / unavailable */
  }
}

export function clearDB(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

const LAST_CLOUD_USER_KEY = 'aavishkar.finance.lastCloudUser'

/**
 * Which signed-in account this device's local cache was last synced for.
 *
 * On a shared device, a second account signing in after a first account
 * synced would otherwise see the first account's leftover local data and
 * (believing it has "no cloud data yet") upload it into the second
 * account's cloud tables. Comparing against this marker before treating
 * local data as "mine to upload" closes that leak.
 */
export function getLastCloudUser(): string | null {
  try {
    return localStorage.getItem(LAST_CLOUD_USER_KEY)
  } catch {
    return null
  }
}

export function setLastCloudUser(userId: string): void {
  try {
    localStorage.setItem(LAST_CLOUD_USER_KEY, userId)
  } catch {
    /* ignore */
  }
}

export function exportJSON(db: DB): string {
  return JSON.stringify(db, null, 2)
}

export function importJSON(json: string): DB {
  const parsed = JSON.parse(json) as DB
  if (!parsed.categories) throw new Error('Invalid backup file')
  return { ...defaultDB(), ...parsed }
}

// ---- Recurring auto-create engine ----

// Guard against a long-dormant item flooding the ledger.
const MAX_CATCHUP_PER_ITEM = 12

/**
 * Creates the transactions for every active recurring item that is marked
 * "auto-create" and whose next due date has arrived, then advances the item to
 * its following due date. Runs once on load; items in "reminder" mode are left
 * alone for the user to mark paid.
 */
export function applyDueRecurring(db: DB): DB {
  const today = todayISO()
  const created: Transaction[] = []
  let changed = false

  const recurring = db.recurring.map((r) => {
    if (!r.active || !r.autoCreate || !r.nextDueDate) return r
    let due = r.nextDueDate
    let runs = 0
    while (due <= today && runs < MAX_CATCHUP_PER_ITEM) {
      if (r.endDate && due > r.endDate) break
      const already = db.transactions.some(
        (t) => t.source === 'recurring' && t.transactionDate === due && t.description === r.name && t.amount === r.amount
      )
      if (!already) {
        const now = new Date().toISOString()
        created.push({
          id: uid('tx_'),
          type: r.type,
          amount: r.amount,
          currency: 'INR',
          description: r.name,
          categoryId: r.categoryId,
          subcategoryId: r.subcategoryId,
          merchant: null,
          paymentMethodId: r.paymentMethodId,
          transactionDate: due,
          notes: `Auto-created from recurring "${r.name}"`,
          source: 'recurring',
          parserConfidence: null,
          createdAt: now,
          updatedAt: now,
        })
      }
      due = advanceByFrequency(due, r.frequency)
      runs++
      changed = true
    }
    return due === r.nextDueDate ? r : { ...r, nextDueDate: due }
  })

  if (!changed) return db
  return { ...db, recurring, transactions: [...created, ...db.transactions] }
}

// ---- Seed data for a good first-run experience ----
export function seedData(db: DB): DB {
  const t = todayISO()
  const now = new Date()
  const m = toISODate(now).slice(5, 7)
  const year = toISODate(now).slice(0, 4)
  // Previous calendar month — rolls the year back in January.
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = String(prev.getMonth() + 1).padStart(2, '0')
  const lastMonthYear = String(prev.getFullYear())
  const lastYear = now.getFullYear() - 1

  // Sample transactions must never be dated in the future, or the dashboard
  // opens showing spending that hasn't happened yet.
  const thisMonthDay = (dd: number) => {
    const iso = `${year}-${m}-${String(dd).padStart(2, '0')}`
    return iso > t ? t : iso
  }

  const cat = (name: string) => db.categories.find((c) => c.name === name && !c.parentId)?.id || ''
  const sub = (name: string) => db.categories.find((c) => c.name === name)?.id || ''

  const make = (type: 'income' | 'expense', amount: number, description: string, categoryId: string, subcategoryId: string | null, date: string, source: Transaction['source'] = 'manual'): Transaction => {
    const now = new Date().toISOString()
    return {
      id: uid('tx_'),
      type,
      amount,
      currency: 'INR',
      description,
      categoryId,
      subcategoryId,
      merchant: null,
      paymentMethodId: 'pm_upi',
      transactionDate: date,
      notes: null,
      source,
      parserConfidence: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  const seed: Transaction[] = []

  // This month
  seed.push(make('income', 25000, 'Salary', cat('Income'), sub('Salary'), thisMonthDay(1), 'recurring'))
  seed.push(make('expense', 200, 'Pav Bhaji', cat('Food'), sub('Street Food'), thisMonthDay(16), 'quick_entry'))
  seed.push(make('expense', 30, 'Pani Poori', cat('Food'), sub('Street Food'), thisMonthDay(16), 'quick_entry'))
  seed.push(make('expense', 40, 'Phone Charger Cable', cat('Shopping'), sub('Electronics'), thisMonthDay(15), 'quick_entry'))
  seed.push(make('expense', 500, 'Petrol', cat('Transportation'), sub('Fuel'), thisMonthDay(14), 'quick_entry'))
  seed.push(make('expense', 1200, 'Electricity Bill', cat('Utilities'), sub('Electricity'), thisMonthDay(13), 'manual'))
  seed.push(make('expense', 150, 'Chai', cat('Food'), sub('Street Food'), thisMonthDay(12), 'quick_entry'))
  seed.push(make('expense', 8500, 'Rent', cat('Housing'), sub('Rent'), thisMonthDay(5), 'recurring'))
  seed.push(make('income', 5000, 'Freelance Payment', cat('Income'), sub('Freelance'), thisMonthDay(8), 'recurring'))
  seed.push(make('expense', 899, 'Internet Bill', cat('Bills'), sub('Internet'), thisMonthDay(10), 'recurring'))

  // Last month (a few)
  seed.push(make('income', 25000, 'Salary', cat('Income'), sub('Salary'), `${lastMonthYear}-${lastMonth}-01`, 'recurring'))
  seed.push(make('expense', 8500, 'Rent', cat('Housing'), sub('Rent'), `${lastMonthYear}-${lastMonth}-05`, 'recurring'))
  seed.push(make('expense', 2400, 'Groceries', cat('Food'), sub('Groceries'), `${lastMonthYear}-${lastMonth}-11`, 'manual'))
  seed.push(make('expense', 1500, 'Petrol', cat('Transportation'), sub('Fuel'), `${lastMonthYear}-${lastMonth}-15`, 'quick_entry'))
  seed.push(make('expense', 700, 'Dining Out', cat('Food'), sub('Dining Out'), `${lastMonthYear}-${lastMonth}-19`, 'quick_entry'))
  seed.push(make('income', 4000, 'Freelance Payment', cat('Income'), sub('Freelance'), `${lastMonthYear}-${lastMonth}-20`, 'recurring'))

  // A couple older
  seed.push(make('expense', 1200, 'Mobile Recharge', cat('Bills'), sub('Mobile'), `${lastMonthYear}-${lastMonth}-09`, 'recurring'))
  seed.push(make('expense', 950, 'Medicines', cat('Healthcare'), sub('Medicine'), `${lastYear}-12-05`, 'manual'))

  // Budgets
  const budgets: Budget[] = [
    { id: uid('b_'), name: 'Overall', type: 'overall', categoryId: null, amount: 40000, period: 'monthly', startDate: null, endDate: null, rollover: false, createdAt: new Date().toISOString() },
    { id: uid('b_'), name: 'Food', type: 'category', categoryId: cat('Food'), amount: 8000, period: 'monthly', startDate: null, endDate: null, rollover: false, createdAt: new Date().toISOString() },
    { id: uid('b_'), name: 'Shopping', type: 'category', categoryId: cat('Shopping'), amount: 5000, period: 'monthly', startDate: null, endDate: null, rollover: false, createdAt: new Date().toISOString() },
    { id: uid('b_'), name: 'Transportation', type: 'category', categoryId: cat('Transportation'), amount: 6000, period: 'monthly', startDate: null, endDate: null, rollover: false, createdAt: new Date().toISOString() },
  ]

  // Next occurrence of day `dd` that is still ahead of today, so sample
  // recurring items don't immediately fire on first run.
  const nextDue = (dd: number) => {
    const thisMonth = `${year}-${m}-${String(dd).padStart(2, '0')}`
    if (thisMonth > t) return thisMonth
    const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  const recurring: Recurring[] = [
    { id: uid('r_'), name: 'Salary', type: 'income', amount: 25000, categoryId: cat('Income'), subcategoryId: sub('Salary'), frequency: 'monthly', startDate: thisMonthDay(1), nextDueDate: nextDue(1), endDate: null, paymentMethodId: 'pm_bank', autoCreate: true, reminder: true, notes: null, active: true, createdAt: new Date().toISOString() },
    { id: uid('r_'), name: 'Rent', type: 'expense', amount: 8500, categoryId: cat('Housing'), subcategoryId: sub('Rent'), frequency: 'monthly', startDate: thisMonthDay(5), nextDueDate: nextDue(5), endDate: null, paymentMethodId: 'pm_bank', autoCreate: false, reminder: true, notes: null, active: true, createdAt: new Date().toISOString() },
    { id: uid('r_'), name: 'Electricity Bill', type: 'expense', amount: 1200, categoryId: cat('Utilities'), subcategoryId: sub('Electricity'), frequency: 'monthly', startDate: thisMonthDay(13), nextDueDate: nextDue(13), endDate: null, paymentMethodId: 'pm_upi', autoCreate: false, reminder: true, notes: null, active: true, createdAt: new Date().toISOString() },
    { id: uid('r_'), name: 'Internet Bill', type: 'expense', amount: 899, categoryId: cat('Bills'), subcategoryId: sub('Internet'), frequency: 'monthly', startDate: thisMonthDay(10), nextDueDate: nextDue(10), endDate: null, paymentMethodId: 'pm_upi', autoCreate: false, reminder: true, notes: null, active: true, createdAt: new Date().toISOString() },
    { id: uid('r_'), name: 'Freelance Payment', type: 'income', amount: 5000, categoryId: cat('Income'), subcategoryId: sub('Freelance'), frequency: 'monthly', startDate: thisMonthDay(8), nextDueDate: nextDue(8), endDate: null, paymentMethodId: 'pm_bank', autoCreate: true, reminder: false, notes: null, active: true, createdAt: new Date().toISOString() },
  ]

  const bills: Bill[] = [
    { id: uid('bill_'), name: 'Electricity Bill', amount: 1200, dueDate: addDays(t, 12), recurrence: 'monthly', categoryId: cat('Utilities'), paymentMethodId: 'pm_upi', paid: false, reminder: true, notes: null, createdAt: new Date().toISOString() },
    { id: uid('bill_'), name: 'Internet Bill', amount: 899, dueDate: addDays(t, 6), recurrence: 'monthly', categoryId: cat('Bills'), paymentMethodId: 'pm_upi', paid: false, reminder: true, notes: null, createdAt: new Date().toISOString() },
    { id: uid('bill_'), name: 'Water Bill', amount: 350, dueDate: addDays(t, 20), recurrence: 'monthly', categoryId: cat('Utilities'), paymentMethodId: 'pm_upi', paid: false, reminder: false, notes: null, createdAt: new Date().toISOString() },
  ]

  const subscriptions: Subscription[] = [
    { id: uid('sub_'), name: 'Netflix', amount: 649, frequency: 'monthly', categoryId: cat('Subscriptions'), paymentMethodId: 'pm_cc', active: true, nextBilling: addDays(t, 9), notes: null, createdAt: new Date().toISOString() },
    { id: uid('sub_'), name: 'Spotify', amount: 119, frequency: 'monthly', categoryId: cat('Subscriptions'), paymentMethodId: 'pm_cc', active: true, nextBilling: addDays(t, 4), notes: null, createdAt: new Date().toISOString() },
    { id: uid('sub_'), name: 'Cloud Storage', amount: 130, frequency: 'monthly', categoryId: cat('Subscriptions'), paymentMethodId: 'pm_cc', active: true, nextBilling: addDays(t, 15), notes: null, createdAt: new Date().toISOString() },
    { id: uid('sub_'), name: 'Gym', amount: 1000, frequency: 'monthly', categoryId: cat('Subscriptions'), paymentMethodId: 'pm_upi', active: true, nextBilling: addDays(t, 22), notes: null, createdAt: new Date().toISOString() },
  ]

  const goals: Goal[] = [
    { id: uid('g_'), name: 'Emergency Fund', targetAmount: 100000, currentAmount: 45000, targetDate: `${+year + 1}-${m}-01`, monthlyContribution: 5000, icon: 'PiggyBank', createdAt: new Date().toISOString() },
    { id: uid('g_'), name: 'New Phone', targetAmount: 30000, currentAmount: 8000, targetDate: `${year}-12-01`, monthlyContribution: 3000, icon: 'Smartphone', createdAt: new Date().toISOString() },
    { id: uid('g_'), name: 'Vacation', targetAmount: 50000, currentAmount: 15000, targetDate: `${year}-11-15`, monthlyContribution: 4000, icon: 'Plane', createdAt: new Date().toISOString() },
  ]

  const debts: Debt[] = [
    { id: uid('d_'), name: 'Credit Card', originalBalance: 25000, currentBalance: 12000, interestRate: 3.2, minPayment: 1000, dueDate: addDays(t, 18), frequency: 'monthly', paymentAmount: 2000, categoryId: cat('Debt & EMI'), createdAt: new Date().toISOString() },
    { id: uid('d_'), name: 'Personal Loan', originalBalance: 150000, currentBalance: 98000, interestRate: 11.5, minPayment: 6500, dueDate: addDays(t, 10), frequency: 'monthly', paymentAmount: 7000, categoryId: cat('Debt & EMI'), createdAt: new Date().toISOString() },
  ]

  const rules: UserCategoryRule[] = []
  const paymentMethods: PaymentMethod[] = db.paymentMethods
  const categories: Category[] = db.categories

  return {
    ...db,
    profile: db.profile || { id: uid('u_'), name: 'You', email: 'you@example.com', currency: 'INR', timezone: 'Asia/Kolkata', theme: 'system', onboarded: false, monthlyIncome: null, createdAt: new Date().toISOString() },
    categories,
    paymentMethods,
    transactions: [...seed, ...db.transactions],
    budgets,
    recurring,
    bills,
    subscriptions,
    goals,
    debts,
    userCategoryRules: rules,
  }
}
