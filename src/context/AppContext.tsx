import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import {
  DB,
  Transaction,
  Budget,
  Recurring,
  Bill,
  Subscription,
  Goal,
  Debt,
  UserCategoryRule,
  Category,
  PaymentMethod,
  TransactionType,
  Profile,
  ParsedTransaction,
  Source,
} from '@/lib/types'
import { loadDB, saveDB, defaultDB, seedData, clearDB, exportJSON, importJSON, applyDueRecurring } from '@/lib/store'
import { materializeInto } from '@/lib/parser'
import { uid, todayISO } from '@/lib/format'

interface AppContextValue {
  db: DB
  hasData: boolean
  seeded: boolean
  // profile
  updateProfile: (p: Partial<Profile>) => void
  // transactions
  addTransactions: (txs: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>) => string[]
  addParsedTransactions: (parsed: ParsedTransaction[], source: Source) => void
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  deleteTransactions: (ids: string[]) => void
  // budgets
  upsertBudget: (b: Partial<Budget> & { id?: string }) => void
  deleteBudget: (id: string) => void
  // recurring
  upsertRecurring: (r: Partial<Recurring> & { id?: string }) => void
  deleteRecurring: (id: string) => void
  // bills
  upsertBill: (b: Partial<Bill> & { id?: string }) => void
  deleteBill: (id: string) => void
  toggleBillPaid: (id: string) => void
  // subscriptions
  upsertSubscription: (s: Partial<Subscription> & { id?: string }) => void
  deleteSubscription: (id: string) => void
  // goals
  upsertGoal: (g: Partial<Goal> & { id?: string }) => void
  deleteGoal: (id: string) => void
  contributeGoal: (id: string, amount: number) => void
  // debts
  upsertDebt: (d: Partial<Debt> & { id?: string }) => void
  deleteDebt: (id: string) => void
  // categories & rules
  upsertCategory: (c: Partial<Category> & { id?: string }) => void
  deleteCategory: (id: string) => void
  upsertPaymentMethod: (p: Partial<PaymentMethod> & { id?: string }) => void
  addRule: (rule: Omit<UserCategoryRule, 'id'>) => void
  deleteRule: (id: string) => void
  // data mgmt
  seed: () => void
  resetAll: () => void
  replaceDB: (db: DB) => void
  backupJSON: () => string
  setTheme: (t: 'light' | 'dark' | 'system') => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => {
    const d = loadDB()
    // If completely fresh (no transactions), seed with sample data
    if (d.transactions.length === 0) return applyDueRecurring(seedData(d))
    // Catch up on any recurring items marked "auto-create" that fell due
    // while the app was closed.
    return applyDueRecurring(d)
  })

  useEffect(() => {
    saveDB(db)
  }, [db])

  // Theme application
  useEffect(() => {
    const root = document.documentElement
    const apply = (t: 'light' | 'dark') => {
      root.classList.toggle('dark', t === 'dark')
    }
    const p = db.profile
    const pref = p?.theme || 'system'
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    if (pref === 'system') {
      apply(media.matches ? 'dark' : 'light')
      const h = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light')
      media.addEventListener('change', h)
      return () => media.removeEventListener('change', h)
    }
    apply(pref)
  }, [db.profile?.theme])

  const update = useCallback((fn: (prev: DB) => DB) => {
    setDb((prev) => fn(prev))
  }, [])

  const updateProfile = useCallback((p: Partial<Profile>) => {
    update((d) => ({
      ...d,
      profile: { ...(d.profile as Profile), ...p },
    }))
  }, [update])

  const addTransactions: AppContextValue['addTransactions'] = useCallback(
    (txs) => {
      const ids: string[] = []
      update((d) => {
        const now = new Date().toISOString()
        const items = txs.map((t) => {
          const id = uid('tx_')
          ids.push(id)
          return { ...t, id, createdAt: now, updatedAt: now }
        })
        return { ...d, transactions: [...items, ...d.transactions] }
      })
      return ids
    },
    [update]
  )

  /**
   * Insert transactions coming from the parser (Quick Add / Import).
   *
   * Category resolution happens inside the state update so that categories
   * invented along the way are persisted together with the transactions that
   * reference them, and a batch that mentions the same new category twice
   * creates it only once.
   */
  const addParsedTransactions: AppContextValue['addParsedTransactions'] = useCallback(
    (parsed, source) => {
      update((d) => {
        const now = new Date().toISOString()
        let categories = d.categories
        const items: Transaction[] = parsed.map((p) => {
          const res = materializeInto(p, categories)
          categories = res.categories
          return {
            id: uid('tx_'),
            type: p.type,
            amount: p.amount,
            currency: p.currency || d.profile?.currency || 'INR',
            description: p.description,
            categoryId: res.categoryId,
            subcategoryId: res.subcategoryId,
            merchant: p.merchant || null,
            paymentMethodId:
              d.paymentMethods.find((pm) => pm.name.toLowerCase() === (p.paymentMethod || '').toLowerCase())?.id || null,
            transactionDate: p.date || todayISO(),
            notes: null,
            source,
            parserConfidence: p.confidence,
            createdAt: now,
            updatedAt: now,
          }
        })
        return { ...d, categories, transactions: [...items, ...d.transactions] }
      })
    },
    [update]
  )

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      update((d) => ({
        ...d,
        transactions: d.transactions.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
      }))
    },
    [update]
  )

  const deleteTransactions = useCallback(
    (ids: string[]) => {
      const set = new Set(ids)
      update((d) => ({ ...d, transactions: d.transactions.filter((t) => !set.has(t.id)) }))
    },
    [update]
  )

  const upsertBudget = useCallback(
    (b: Partial<Budget> & { id?: string }) => {
      update((d) => {
        if (b.id) {
          return { ...d, budgets: d.budgets.map((x) => (x.id === b.id ? { ...x, ...b } as Budget : x)) }
        }
        const nb: Budget = { id: uid('b_'), name: 'Budget', type: 'overall', categoryId: null, amount: 0, period: 'monthly', startDate: null, endDate: null, rollover: false, createdAt: new Date().toISOString(), ...b }
        return { ...d, budgets: [...d.budgets, nb] }
      })
    },
    [update]
  )
  const deleteBudget = useCallback((id: string) => update((d) => ({ ...d, budgets: d.budgets.filter((x) => x.id !== id) })), [update])

  const upsertRecurring = useCallback(
    (r: Partial<Recurring> & { id?: string }) => {
      update((d) => {
        if (r.id) return { ...d, recurring: d.recurring.map((x) => (x.id === r.id ? { ...x, ...r } as Recurring : x)) }
        const nr: Recurring = { id: uid('r_'), name: 'Recurring', type: 'expense', amount: 0, categoryId: d.categories[0]?.id || '', subcategoryId: null, frequency: 'monthly', startDate: todayISO(), nextDueDate: null, endDate: null, paymentMethodId: null, autoCreate: false, reminder: true, notes: null, active: true, createdAt: new Date().toISOString(), ...r }
        return { ...d, recurring: [...d.recurring, nr] }
      })
    },
    [update]
  )
  const deleteRecurring = useCallback((id: string) => update((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== id) })), [update])

  const upsertBill = useCallback(
    (b: Partial<Bill> & { id?: string }) => {
      update((d) => {
        if (b.id) return { ...d, bills: d.bills.map((x) => (x.id === b.id ? { ...x, ...b } as Bill : x)) }
        const nb: Bill = { id: uid('bill_'), name: 'Bill', amount: 0, dueDate: todayISO(), recurrence: 'monthly', categoryId: d.categories[0]?.id || '', paymentMethodId: null, paid: false, reminder: true, notes: null, createdAt: new Date().toISOString(), ...b }
        return { ...d, bills: [...d.bills, nb] }
      })
    },
    [update]
  )
  const deleteBill = useCallback((id: string) => update((d) => ({ ...d, bills: d.bills.filter((x) => x.id !== id) })), [update])
  const toggleBillPaid = useCallback((id: string) => update((d) => ({ ...d, bills: d.bills.map((x) => (x.id === id ? { ...x, paid: !x.paid } : x)) })), [update])

  const upsertSubscription = useCallback(
    (s: Partial<Subscription> & { id?: string }) => {
      update((d) => {
        if (s.id) return { ...d, subscriptions: d.subscriptions.map((x) => (x.id === s.id ? { ...x, ...s } as Subscription : x)) }
        const ns: Subscription = { id: uid('sub_'), name: 'Subscription', amount: 0, frequency: 'monthly', categoryId: d.categories.find((c) => c.name === 'Subscriptions')?.id || '', paymentMethodId: null, active: true, nextBilling: null, notes: null, createdAt: new Date().toISOString(), ...s }
        return { ...d, subscriptions: [...d.subscriptions, ns] }
      })
    },
    [update]
  )
  const deleteSubscription = useCallback((id: string) => update((d) => ({ ...d, subscriptions: d.subscriptions.filter((x) => x.id !== id) })), [update])

  const upsertGoal = useCallback(
    (g: Partial<Goal> & { id?: string }) => {
      update((d) => {
        if (g.id) return { ...d, goals: d.goals.map((x) => (x.id === g.id ? { ...x, ...g } as Goal : x)) }
        const ng: Goal = { id: uid('g_'), name: 'Goal', targetAmount: 0, currentAmount: 0, targetDate: null, monthlyContribution: null, icon: 'PiggyBank', createdAt: new Date().toISOString(), ...g }
        return { ...d, goals: [...d.goals, ng] }
      })
    },
    [update]
  )
  const deleteGoal = useCallback((id: string) => update((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== id) })), [update])
  const contributeGoal = useCallback((id: string, amount: number) => update((d) => ({ ...d, goals: d.goals.map((x) => (x.id === id ? { ...x, currentAmount: x.currentAmount + amount } : x)) })), [update])

  const upsertDebt = useCallback(
    (dt: Partial<Debt> & { id?: string }) => {
      update((d) => {
        if (dt.id) return { ...d, debts: d.debts.map((x) => (x.id === dt.id ? { ...x, ...dt } as Debt : x)) }
        const nd: Debt = { id: uid('d_'), name: 'Debt', originalBalance: 0, currentBalance: 0, interestRate: null, minPayment: null, dueDate: null, frequency: 'monthly', paymentAmount: 0, categoryId: null, createdAt: new Date().toISOString(), ...dt }
        return { ...d, debts: [...d.debts, nd] }
      })
    },
    [update]
  )
  const deleteDebt = useCallback((id: string) => update((d) => ({ ...d, debts: d.debts.filter((x) => x.id !== id) })), [update])

  const upsertCategory = useCallback(
    (c: Partial<Category> & { id?: string }) => {
      update((d) => {
        if (c.id) return { ...d, categories: d.categories.map((x) => (x.id === c.id ? { ...x, ...c } as Category : x)) }
        const nc: Category = { id: uid('cat_'), name: 'Category', type: 'expense', parentId: null, icon: 'Tag', system: false, ...c }
        return { ...d, categories: [...d.categories, nc] }
      })
    },
    [update]
  )
  const deleteCategory = useCallback((id: string) => update((d) => ({ ...d, categories: d.categories.filter((x) => x.id !== id) })), [update])

  const upsertPaymentMethod = useCallback(
    (p: Partial<PaymentMethod> & { id?: string }) => {
      update((d) => {
        if (p.id) return { ...d, paymentMethods: d.paymentMethods.map((x) => (x.id === p.id ? { ...x, ...p } as PaymentMethod : x)) }
        const np: PaymentMethod = { id: uid('pm_'), name: 'Method', icon: 'CircleDashed', system: false, ...p }
        return { ...d, paymentMethods: [...d.paymentMethods, np] }
      })
    },
    [update]
  )

  const addRule = useCallback((rule: Omit<UserCategoryRule, 'id'>) => update((d) => ({ ...d, userCategoryRules: [...d.userCategoryRules, { ...rule, id: uid('rule_') }] })), [update])
  const deleteRule = useCallback((id: string) => update((d) => ({ ...d, userCategoryRules: d.userCategoryRules.filter((x) => x.id !== id) })), [update])

  const seed = useCallback(() => update((d) => seedData({ ...defaultDB(), profile: d.profile })), [update])
  const resetAll = useCallback(() => update(() => seedData(defaultDB())), [update])
  const replaceDB = useCallback((ndb: DB) => setDb(ndb), [])
  const backupJSON = useCallback(() => exportJSON(db), [db])

  const setTheme = useCallback((t: 'light' | 'dark' | 'system') => update((d) => ({ ...d, profile: { ...(d.profile as Profile), theme: t } })), [update])

  const hasData = db.transactions.length > 0
  const seeded = true

  const value = useMemo<AppContextValue>(
    () => ({
      db,
      hasData,
      seeded,
      updateProfile,
      addTransactions,
      addParsedTransactions,
      updateTransaction,
      deleteTransactions,
      upsertBudget,
      deleteBudget,
      upsertRecurring,
      deleteRecurring,
      upsertBill,
      deleteBill,
      toggleBillPaid,
      upsertSubscription,
      deleteSubscription,
      upsertGoal,
      deleteGoal,
      contributeGoal,
      upsertDebt,
      deleteDebt,
      upsertCategory,
      deleteCategory,
      upsertPaymentMethod,
      addRule,
      deleteRule,
      seed,
      resetAll,
      replaceDB,
      backupJSON,
      setTheme,
    }),
    [db, hasData, seeded, updateProfile, addTransactions, addParsedTransactions, updateTransaction, deleteTransactions, upsertBudget, deleteBudget, upsertRecurring, deleteRecurring, upsertBill, deleteBill, toggleBillPaid, upsertSubscription, deleteSubscription, upsertGoal, deleteGoal, contributeGoal, upsertDebt, deleteDebt, upsertCategory, deleteCategory, upsertPaymentMethod, addRule, deleteRule, seed, resetAll, replaceDB, backupJSON, setTheme]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
