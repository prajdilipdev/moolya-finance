import { Transaction, TransactionType, DB, Budget, Category } from './types'
import { pct, todayISO, addDays, daysBetween, toISODate, startOfWeek, endOfMonth } from './format'

export interface Totals {
  income: number
  expenses: number
  balance: number
  savings: number
  savingsRate: number
  expenseRatio: number
}

export function computeTotals(txs: Transaction[]): Totals {
  let income = 0
  let expenses = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else expenses += t.amount
  }
  const savings = income - expenses
  const savingsRate = income > 0 ? pct(Math.max(savings, 0), income) : 0
  const expenseRatio = income > 0 ? pct(expenses, income) : 0
  return { income, expenses, balance: income - expenses, savings, savingsRate, expenseRatio }
}

// ---- Date ranges for periods ----
export type PeriodKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'all'
  | 'custom'

export interface DateRange {
  start: string
  end: string
}

export function rangeForPeriod(key: PeriodKey, now = new Date()): DateRange {
  const today = toISODate(now)
  const day = now.getDate()
  const month = now.getMonth()
  const year = now.getFullYear()

  switch (key) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday':
      return { start: addDays(today, -1), end: addDays(today, -1) }
    case 'thisWeek': {
      const dow = (now.getDay() + 6) % 7 // Monday start
      return { start: addDays(today, -dow), end: today }
    }
    case 'lastWeek': {
      const dow = (now.getDay() + 6) % 7
      return { start: addDays(today, -dow - 7), end: addDays(today, -dow - 1) }
    }
    case 'thisMonth':
      return { start: toISODate(new Date(year, month, 1)), end: today }
    case 'lastMonth':
      return {
        start: toISODate(new Date(year, month - 1, 1)),
        end: toISODate(new Date(year, month, 0)),
      }
    case 'thisQuarter': {
      const q = Math.floor(month / 3)
      return { start: toISODate(new Date(year, q * 3, 1)), end: today }
    }
    case 'thisYear':
      return { start: toISODate(new Date(year, 0, 1)), end: today }
    case 'lastYear':
      return { start: toISODate(new Date(year - 1, 0, 1)), end: toISODate(new Date(year - 1, 11, 31)) }
    case 'all':
      return { start: '1900-01-01', end: today }
    case 'custom':
      return { start: today, end: today }
  }
}

export function inRange(txDate: string, range: DateRange): boolean {
  return txDate >= range.start && txDate <= range.end
}

export function filterByRange(txs: Transaction[], range: DateRange): Transaction[] {
  return txs.filter((t) => inRange(t.transactionDate, range))
}

// ---- Budgets ----

export interface BudgetStatus {
  budget: Budget
  spent: number
  remaining: number
  usedPct: number
}

export function periodSpend(txDate: string, budget: Budget): boolean {
  switch (budget.period) {
    case 'weekly': {
      // Current week (Monday–Sunday), not the week of the transaction.
      const start = startOfWeek(todayISO())
      return txDate >= start && txDate <= addDays(start, 6)
    }
    case 'monthly': {
      const y = txDate.slice(0, 4)
      const m = txDate.slice(5, 7)
      const now = new Date()
      const ny = toISODate(now).slice(0, 4)
      const nm = toISODate(now).slice(5, 7)
      return y === ny && m === nm
    }
    case 'yearly': {
      const y = txDate.slice(0, 4)
      return y === toISODate(new Date()).slice(0, 4)
    }
    case 'custom':
      return budget.startDate ? txDate >= budget.startDate && (budget.endDate ? txDate <= budget.endDate : true) : false
  }
}

export function budgetStatus(budget: Budget, txs: Transaction[], categories: Category[]): BudgetStatus {
  const spent = txs.reduce((sum, t) => {
    if (t.type !== 'expense') return sum
    if (budget.type === 'overall') return periodSpend(t.transactionDate, budget) ? sum + t.amount : sum
    // Category budget: count the category itself, and — when the budget is on a
    // parent category — everything filed under one of its subcategories.
    const cat = categories.find((c) => c.id === budget.categoryId)
    if (!cat) return sum
    const matches =
      t.categoryId === budget.categoryId ||
      t.subcategoryId === budget.categoryId ||
      (!!t.subcategoryId && categories.find((c) => c.id === t.subcategoryId)?.parentId === budget.categoryId)
    if (!matches) return sum
    return periodSpend(t.transactionDate, budget) ? sum + t.amount : sum
  }, 0)

  const remaining = budget.amount - spent
  return { budget, spent, remaining, usedPct: pct(spent, budget.amount) }
}

export function overallBudgetFor(db: DB): BudgetStatus | null {
  const b = db.budgets.find((x) => x.type === 'overall')
  if (!b) return null
  return budgetStatus(b, db.transactions, db.categories)
}

// ---- Insights ----
export interface Insight {
  kind: 'info' | 'warning' | 'positive'
  text: string
}

export function computeInsights(db: DB, range: DateRange): Insight[] {
  const insights: Insight[] = []
  const txs = filterByRange(db.transactions, range)
  const totals = computeTotals(txs)

  const lastRange = rangeForPeriod('lastMonth', new Date(range.end + 'T00:00:00'))
  const lastTotals = computeTotals(filterByRange(db.transactions, lastRange))

  // Month-over-month expense comparison
  if (lastTotals.expenses > 0 && totals.expenses > 0) {
    const diff = ((totals.expenses - lastTotals.expenses) / lastTotals.expenses) * 100
    if (diff > 15)
      insights.push({
        kind: 'warning',
        text: `Expenses are ${Math.round(diff)}% higher than last month (₹${Math.round(totals.expenses - lastTotals.expenses).toLocaleString('en-IN')} more).`,
      })
    else if (diff < -15)
      insights.push({
        kind: 'positive',
        text: `Expenses are ${Math.abs(Math.round(diff))}% lower than last month. Great job!`,
      })
  }

  // Budget warnings
  for (const b of db.budgets) {
    const st = budgetStatus(b, db.transactions, db.categories)
    if (st.usedPct >= 90) {
      insights.push({
        kind: 'warning',
        text: `You've used ${Math.round(st.usedPct)}% of your ${b.name} budget (${'₹' + Math.round(st.budget.amount).toLocaleString('en-IN')}). ₹${Math.round(st.remaining).toLocaleString('en-IN')} remaining.`,
      })
    }
  }

  // Fixed vs variable
  const fixedCats = new Set(['Housing', 'Rent', 'Utilities', 'Bills', 'Subscriptions', 'Debt & EMI'])
  let fixed = 0
  let variable = 0
  for (const t of txs) {
    if (t.type !== 'expense') continue
    const c = db.categories.find((x) => x.id === t.categoryId)
    if (c && fixedCats.has(c.name)) fixed += t.amount
    else variable += t.amount
  }
  if (totals.expenses > 0) {
    const fixedPct = pct(fixed, totals.expenses)
    if (fixedPct > 0)
      insights.push({
        kind: 'info',
        text: `Fixed expenses represent ${Math.round(fixedPct)}% of your monthly expenses.`,
      })
  }

  // Top spending category
  const byCat = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'expense') continue
    const c = db.categories.find((x) => x.id === t.categoryId)
    const key = c?.name || 'Other'
    byCat.set(key, (byCat.get(key) || 0) + t.amount)
  }
  let top = ''
  let topAmt = 0
  for (const [k, v] of byCat) if (v > topAmt) {
    topAmt = v
    top = k
  }
  if (top) insights.push({ kind: 'info', text: `${top} is your top spending category this period at ₹${Math.round(topAmt).toLocaleString('en-IN')}.` })

  // Savings rate
  if (totals.income > 0)
    insights.push({
      kind: totals.savingsRate >= 20 ? 'positive' : 'info',
      text: `Your savings rate is ${Math.round(totals.savingsRate)}%. ${totals.savingsRate >= 20 ? 'Healthy target reached.' : 'Aim for 20%+ for a strong buffer.'}`,
    })

  return insights
}

// ---- Daily spending limit ----

// Last day of the budget's own period. The displayed range usually ends
// *today* (e.g. "This Month" = 1st → today), which would leave zero days to
// spread the remaining budget over.
export function budgetPeriodEnd(budget: Budget, fallbackEnd: string): string {
  const today = todayISO()
  switch (budget.period) {
    case 'weekly':
      return addDays(startOfWeek(today), 6)
    case 'monthly':
      return endOfMonth(today)
    case 'yearly':
      return toISODate(new Date(new Date().getFullYear(), 11, 31))
    case 'custom':
      return budget.endDate || fallbackEnd
  }
}

export function dailyLimit(budget: BudgetStatus | null, range: DateRange): { perDay: number; daysLeft: number } {
  if (!budget) return { perDay: 0, daysLeft: 0 }
  const remaining = Math.max(budget.remaining, 0)
  const end = budgetPeriodEnd(budget.budget, range.end)
  // Today counts as a day you can still spend on, hence the +1.
  const daysLeft = Math.max(daysBetween(todayISO(), end) + 1, 1)
  return { perDay: Math.round(remaining / daysLeft), daysLeft }
}

// ---- Cash flow forecast ----
export interface ForecastLine {
  label: string
  amount: number
  projected: boolean
}

export function buildForecast(db: DB): ForecastLine[] {
  const lines: ForecastLine[] = []
  const balance = computeTotals(db.transactions).balance
  lines.push({ label: 'Current balance', amount: balance, projected: false })

  const today = todayISO()
  const activeRecurring = db.recurring.filter((r) => r.active)

  // Expected upcoming income from recurring
  let expectedIncome = 0
  for (const r of activeRecurring) {
    if (r.type === 'income' && r.nextDueDate && r.nextDueDate >= today) expectedIncome += r.amount
  }
  if (expectedIncome > 0) lines.push({ label: 'Expected income (recurring)', amount: expectedIncome, projected: true })

  let recurringExp = 0
  for (const r of activeRecurring) {
    if (r.type === 'expense' && r.nextDueDate && r.nextDueDate >= today) recurringExp += r.amount
  }
  if (recurringExp > 0) lines.push({ label: 'Upcoming recurring expenses', amount: -recurringExp, projected: true })

  const unpaidBills = db.bills
    .filter((b) => !b.paid && b.dueDate >= today)
    .reduce((s, b) => s + b.amount, 0)
  if (unpaidBills > 0) lines.push({ label: 'Unpaid bills', amount: -unpaidBills, projected: true })

  const activeSubs = db.subscriptions
    .filter((s) => s.active && (!s.nextBilling || s.nextBilling >= today))
    .reduce((s, x) => s + (x.frequency === 'monthly' ? x.amount : x.amount / 12), 0)
  if (activeSubs > 0) lines.push({ label: 'Active subscriptions (monthly)', amount: -activeSubs, projected: true })

  return lines
}

export function forecastTotal(lines: ForecastLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0)
}
