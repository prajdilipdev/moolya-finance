import { supabase } from './supabase'
import {
  DB,
  Transaction,
  Profile,
  Budget,
  Recurring,
  Bill,
  Subscription,
  Goal,
  Debt,
  UserCategoryRule,
  Category,
  PaymentMethod,
} from './types'
import { defaultCategories, defaultPaymentMethods } from './categories'
import { defaultDB, seedData } from './store'

// ---- Mappers: Supabase (snake_case) <-> Frontend (camelCase) ----

function mapProfileFromDb(row: any): Profile {
  return {
    id: row.id,
    name: row.name || 'You',
    email: row.email || '',
    currency: row.currency || 'INR',
    timezone: row.timezone || 'Asia/Kolkata',
    theme: row.theme || 'system',
    onboarded: Boolean(row.onboarded),
    monthlyIncome: row.monthly_income != null ? Number(row.monthly_income) : null,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapProfileToDb(p: Profile) {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    currency: p.currency,
    timezone: p.timezone,
    theme: p.theme,
    onboarded: p.onboarded,
    monthly_income: p.monthlyIncome,
  }
}

function mapCategoryFromDb(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    parentId: row.parent_id || null,
    icon: row.icon || 'Tag',
    system: Boolean(row.system),
  }
}

function mapCategoryToDb(c: Category, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    type: c.type,
    parent_id: c.parentId || null,
    icon: c.icon || 'Tag',
    system: Boolean(c.system),
  }
}

function mapPaymentMethodFromDb(row: any): PaymentMethod {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || 'Banknote',
    system: Boolean(row.system),
  }
}

function mapPaymentMethodToDb(m: PaymentMethod, userId: string) {
  return {
    id: m.id,
    user_id: userId,
    name: m.name,
    icon: m.icon || 'Banknote',
    system: Boolean(m.system),
  }
}

function mapTransactionFromDb(row: any): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    currency: row.currency || 'INR',
    description: row.description,
    categoryId: row.category_id || '',
    subcategoryId: row.subcategory_id || null,
    merchant: row.merchant || null,
    paymentMethodId: row.payment_method_id || null,
    transactionDate: row.transaction_date,
    notes: row.notes || null,
    source: row.source || 'manual',
    parserConfidence: row.parser_confidence != null ? Number(row.parser_confidence) : null,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  }
}

function mapTransactionToDb(t: Transaction, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    type: t.type,
    amount: t.amount,
    currency: t.currency || 'INR',
    description: t.description,
    category_id: t.categoryId || null,
    subcategory_id: t.subcategoryId || null,
    merchant: t.merchant || null,
    payment_method_id: t.paymentMethodId || null,
    transaction_date: t.transactionDate,
    notes: t.notes || null,
    source: t.source || 'manual',
    parser_confidence: t.parserConfidence != null ? t.parserConfidence : null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }
}

function mapBudgetFromDb(row: any): Budget {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    categoryId: row.category_id || null,
    amount: Number(row.amount),
    period: row.period || 'monthly',
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    rollover: Boolean(row.rollover),
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapBudgetToDb(b: Budget, userId: string) {
  return {
    id: b.id,
    user_id: userId,
    name: b.name,
    type: b.type,
    category_id: b.categoryId || null,
    amount: b.amount,
    period: b.period,
    start_date: b.startDate || null,
    end_date: b.endDate || null,
    rollover: Boolean(b.rollover),
    created_at: b.createdAt,
  }
}

function mapRecurringFromDb(row: any): Recurring {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    amount: Number(row.amount),
    categoryId: row.category_id || '',
    subcategoryId: row.subcategory_id || null,
    frequency: row.frequency || 'monthly',
    startDate: row.start_date,
    nextDueDate: row.next_due_date || null,
    endDate: row.end_date || null,
    paymentMethodId: row.payment_method_id || null,
    autoCreate: Boolean(row.auto_create),
    reminder: Boolean(row.reminder),
    notes: row.notes || null,
    active: row.active !== false,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapRecurringToDb(r: Recurring, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    name: r.name,
    type: r.type,
    amount: r.amount,
    category_id: r.categoryId || null,
    subcategory_id: r.subcategoryId || null,
    frequency: r.frequency,
    start_date: r.startDate,
    next_due_date: r.nextDueDate || null,
    end_date: r.endDate || null,
    payment_method_id: r.paymentMethodId || null,
    auto_create: Boolean(r.autoCreate),
    reminder: Boolean(r.reminder),
    notes: r.notes || null,
    active: Boolean(r.active),
    created_at: r.createdAt,
  }
}

function mapBillFromDb(row: any): Bill {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    dueDate: row.due_date,
    recurrence: row.recurrence || 'monthly',
    categoryId: row.category_id || '',
    paymentMethodId: row.payment_method_id || null,
    paid: Boolean(row.paid),
    reminder: Boolean(row.reminder),
    notes: row.notes || null,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapBillToDb(b: Bill, userId: string) {
  return {
    id: b.id,
    user_id: userId,
    name: b.name,
    amount: b.amount,
    due_date: b.dueDate,
    recurrence: b.recurrence,
    category_id: b.categoryId || null,
    payment_method_id: b.paymentMethodId || null,
    paid: Boolean(b.paid),
    reminder: Boolean(b.reminder),
    notes: b.notes || null,
    created_at: b.createdAt,
  }
}

function mapSubscriptionFromDb(row: any): Subscription {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    frequency: row.frequency || 'monthly',
    categoryId: row.category_id || '',
    paymentMethodId: row.payment_method_id || null,
    active: row.active !== false,
    nextBilling: row.next_billing || null,
    notes: row.notes || null,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapSubscriptionToDb(s: Subscription, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    name: s.name,
    amount: s.amount,
    frequency: s.frequency,
    category_id: s.categoryId || null,
    payment_method_id: s.paymentMethodId || null,
    active: Boolean(s.active),
    next_billing: s.nextBilling || null,
    notes: s.notes || null,
    created_at: s.createdAt,
  }
}

function mapGoalFromDb(row: any): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    currentAmount: Number(row.current_amount || 0),
    targetDate: row.target_date || null,
    monthlyContribution: row.monthly_contribution != null ? Number(row.monthly_contribution) : null,
    icon: row.icon || 'PiggyBank',
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapGoalToDb(g: Goal, userId: string) {
  return {
    id: g.id,
    user_id: userId,
    name: g.name,
    target_amount: g.targetAmount,
    current_amount: g.currentAmount,
    target_date: g.targetDate || null,
    monthly_contribution: g.monthlyContribution != null ? g.monthlyContribution : null,
    icon: g.icon || 'PiggyBank',
    created_at: g.createdAt,
  }
}

function mapDebtFromDb(row: any): Debt {
  return {
    id: row.id,
    name: row.name,
    originalBalance: Number(row.original_balance),
    currentBalance: Number(row.current_balance),
    interestRate: row.interest_rate != null ? Number(row.interest_rate) : null,
    minPayment: row.min_payment != null ? Number(row.min_payment) : null,
    dueDate: row.due_date || null,
    frequency: row.frequency || 'monthly',
    paymentAmount: Number(row.payment_amount || 0),
    categoryId: row.category_id || null,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapDebtToDb(d: Debt, userId: string) {
  return {
    id: d.id,
    user_id: userId,
    name: d.name,
    original_balance: d.originalBalance,
    current_balance: d.currentBalance,
    interest_rate: d.interestRate != null ? d.interestRate : null,
    min_payment: d.minPayment != null ? d.minPayment : null,
    due_date: d.dueDate || null,
    frequency: d.frequency,
    payment_amount: d.paymentAmount,
    category_id: d.categoryId || null,
    created_at: d.createdAt,
  }
}

function mapRuleFromDb(row: any): UserCategoryRule {
  return {
    id: row.id,
    keyword: row.keyword,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id || null,
  }
}

function mapRuleToDb(r: UserCategoryRule, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    keyword: r.keyword,
    category_id: r.categoryId,
    subcategory_id: r.subcategoryId || null,
  }
}

// ---- Cloud Fetch and Sync Engine ----

export async function fetchCloudDB(userId: string): Promise<DB | null> {
  if (!supabase) return null

  try {
    const [
      profileRes,
      categoriesRes,
      paymentMethodsRes,
      transactionsRes,
      budgetsRes,
      recurringRes,
      billsRes,
      subscriptionsRes,
      goalsRes,
      debtsRes,
      rulesRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('categories').select('*').order('created_at', { ascending: true }),
      supabase.from('payment_methods').select('*').order('created_at', { ascending: true }),
      supabase.from('transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('budgets').select('*').order('created_at', { ascending: true }),
      supabase.from('recurring').select('*').order('created_at', { ascending: true }),
      supabase.from('bills').select('*').order('created_at', { ascending: true }),
      supabase.from('subscriptions').select('*').order('created_at', { ascending: true }),
      supabase.from('goals').select('*').order('created_at', { ascending: true }),
      supabase.from('debts').select('*').order('created_at', { ascending: true }),
      supabase.from('user_category_rules').select('*').order('created_at', { ascending: true }),
    ])

    const profile = profileRes.data ? mapProfileFromDb(profileRes.data) : null
    const categories = (categoriesRes.data || []).map(mapCategoryFromDb)
    const paymentMethods = (paymentMethodsRes.data || []).map(mapPaymentMethodFromDb)
    const transactions = (transactionsRes.data || []).map(mapTransactionFromDb)
    const budgets = (budgetsRes.data || []).map(mapBudgetFromDb)
    const recurring = (recurringRes.data || []).map(mapRecurringFromDb)
    const bills = (billsRes.data || []).map(mapBillFromDb)
    const subscriptions = (subscriptionsRes.data || []).map(mapSubscriptionFromDb)
    const goals = (goalsRes.data || []).map(mapGoalFromDb)
    const debts = (debtsRes.data || []).map(mapDebtFromDb)
    const userCategoryRules = (rulesRes.data || []).map(mapRuleFromDb)

    return {
      version: 1,
      profile,
      categories: categories.length > 0 ? categories : defaultCategories(),
      paymentMethods: paymentMethods.length > 0 ? paymentMethods : defaultPaymentMethods(),
      transactions,
      budgets,
      recurring,
      bills,
      subscriptions,
      goals,
      debts,
      userCategoryRules,
      updatedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error('Failed to fetch data from Supabase:', err)
    return null
  }
}

/**
 * Initializes a new user's cloud account with seed data (categories, sample transactions, etc.)
 */
export async function seedCloudUser(userId: string, initialDb: DB): Promise<void> {
  if (!supabase) return

  try {
    // 1. Profile
    if (initialDb.profile) {
      await supabase.from('profiles').upsert(mapProfileToDb(initialDb.profile))
    }

    // 2. Categories
    if (initialDb.categories.length > 0) {
      // First insert parent categories (where parentId is null)
      const parents = initialDb.categories.filter((c) => !c.parentId)
      const children = initialDb.categories.filter((c) => c.parentId)
      if (parents.length > 0) {
        await supabase.from('categories').upsert(parents.map((c) => mapCategoryToDb(c, userId)))
      }
      if (children.length > 0) {
        await supabase.from('categories').upsert(children.map((c) => mapCategoryToDb(c, userId)))
      }
    }

    // 3. Payment Methods
    if (initialDb.paymentMethods.length > 0) {
      await supabase.from('payment_methods').upsert(initialDb.paymentMethods.map((m) => mapPaymentMethodToDb(m, userId)))
    }

    // 4. Transactions
    if (initialDb.transactions.length > 0) {
      await supabase.from('transactions').upsert(initialDb.transactions.map((t) => mapTransactionToDb(t, userId)))
    }

    // 5. Budgets
    if (initialDb.budgets.length > 0) {
      await supabase.from('budgets').upsert(initialDb.budgets.map((b) => mapBudgetToDb(b, userId)))
    }

    // 6. Recurring
    if (initialDb.recurring.length > 0) {
      await supabase.from('recurring').upsert(initialDb.recurring.map((r) => mapRecurringToDb(r, userId)))
    }

    // 7. Bills
    if (initialDb.bills.length > 0) {
      await supabase.from('bills').upsert(initialDb.bills.map((b) => mapBillToDb(b, userId)))
    }

    // 8. Subscriptions
    if (initialDb.subscriptions.length > 0) {
      await supabase.from('subscriptions').upsert(initialDb.subscriptions.map((s) => mapSubscriptionToDb(s, userId)))
    }

    // 9. Goals
    if (initialDb.goals.length > 0) {
      await supabase.from('goals').upsert(initialDb.goals.map((g) => mapGoalToDb(g, userId)))
    }

    // 10. Debts
    if (initialDb.debts.length > 0) {
      await supabase.from('debts').upsert(initialDb.debts.map((d) => mapDebtToDb(d, userId)))
    }

    // 11. Rules
    if (initialDb.userCategoryRules.length > 0) {
      await supabase.from('user_category_rules').upsert(initialDb.userCategoryRules.map((r) => mapRuleToDb(r, userId)))
    }
  } catch (err) {
    console.error('Failed to seed cloud user:', err)
  }
}

// ---- Fine-Grained Real-Time Mutation Handlers ----

export async function cloudSyncProfile(profile: Profile): Promise<void> {
  if (!supabase) return
  await supabase.from('profiles').upsert(mapProfileToDb(profile))
}

export async function cloudUpsertTransactions(txs: Transaction[], userId: string): Promise<void> {
  if (!supabase || txs.length === 0) return
  await supabase.from('transactions').upsert(txs.map((t) => mapTransactionToDb(t, userId)))
}

export async function cloudDeleteTransactions(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return
  await supabase.from('transactions').delete().in('id', ids)
}

export async function cloudUpsertBudget(budget: Budget, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('budgets').upsert(mapBudgetToDb(budget, userId))
}

export async function cloudDeleteBudget(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('budgets').delete().eq('id', id)
}

export async function cloudUpsertRecurring(recurring: Recurring, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('recurring').upsert(mapRecurringToDb(recurring, userId))
}

export async function cloudDeleteRecurring(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('recurring').delete().eq('id', id)
}

export async function cloudUpsertBill(bill: Bill, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('bills').upsert(mapBillToDb(bill, userId))
}

export async function cloudDeleteBill(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('bills').delete().eq('id', id)
}

export async function cloudUpsertSubscription(subscription: Subscription, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('subscriptions').upsert(mapSubscriptionToDb(subscription, userId))
}

export async function cloudDeleteSubscription(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('subscriptions').delete().eq('id', id)
}

export async function cloudUpsertGoal(goal: Goal, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('goals').upsert(mapGoalToDb(goal, userId))
}

export async function cloudDeleteGoal(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('goals').delete().eq('id', id)
}

export async function cloudUpsertDebt(debt: Debt, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('debts').upsert(mapDebtToDb(debt, userId))
}

export async function cloudDeleteDebt(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('debts').delete().eq('id', id)
}

export async function cloudUpsertCategory(category: Category, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('categories').upsert(mapCategoryToDb(category, userId))
}

export async function cloudDeleteCategory(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('categories').delete().eq('id', id)
}

export async function cloudUpsertPaymentMethod(pm: PaymentMethod, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('payment_methods').upsert(mapPaymentMethodToDb(pm, userId))
}

export async function cloudUpsertRule(rule: UserCategoryRule, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('user_category_rules').upsert(mapRuleToDb(rule, userId))
}

export async function cloudDeleteRule(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('user_category_rules').delete().eq('id', id)
}

export async function cloudClearAllData(userId: string): Promise<void> {
  if (!supabase) return
  await Promise.all([
    supabase.from('transactions').delete().eq('user_id', userId),
    supabase.from('budgets').delete().eq('user_id', userId),
    supabase.from('recurring').delete().eq('user_id', userId),
    supabase.from('bills').delete().eq('user_id', userId),
    supabase.from('subscriptions').delete().eq('user_id', userId),
    supabase.from('goals').delete().eq('user_id', userId),
    supabase.from('debts').delete().eq('user_id', userId),
    supabase.from('user_category_rules').delete().eq('user_id', userId),
    supabase.from('categories').delete().eq('user_id', userId),
    supabase.from('payment_methods').delete().eq('user_id', userId),
  ])
}
