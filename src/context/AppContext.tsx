import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
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
  Profile,
  ParsedTransaction,
  Source,
} from '@/lib/types'
import { loadDB, saveDB, defaultDB, seedData, clearDB, exportJSON, importJSON, applyDueRecurring, getLastCloudUser, setLastCloudUser } from '@/lib/store'
import { materializeInto } from '@/lib/parser'
import { uid, todayISO } from '@/lib/format'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import {
  fetchCloudDB,
  seedCloudUser,
  cloudSyncProfile,
  cloudUpsertTransactions,
  cloudDeleteTransactions,
  cloudUpsertBudget,
  cloudDeleteBudget,
  cloudUpsertRecurring,
  cloudDeleteRecurring,
  cloudUpsertBill,
  cloudDeleteBill,
  cloudUpsertSubscription,
  cloudDeleteSubscription,
  cloudUpsertGoal,
  cloudDeleteGoal,
  cloudUpsertDebt,
  cloudDeleteDebt,
  cloudUpsertCategory,
  cloudDeleteCategory,
  cloudUpsertPaymentMethod,
  cloudUpsertRule,
  cloudDeleteRule,
  cloudClearAllData,
} from '@/lib/supabaseSync'

interface AppContextValue {
  db: DB
  hasData: boolean
  seeded: boolean
  syncing: boolean
  lastSyncedAt: string | null
  cloudEnabled: boolean
  syncNow: () => Promise<void>
  // profile
  updateProfile: (p: Partial<Profile>) => void
  // transactions
  addTransactions: (txs: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>) => string[]
  /** Returns how many were actually saved vs. skipped as duplicates, so callers can tell the user the truth. */
  addParsedTransactions: (parsed: ParsedTransaction[], source: Source) => { added: number; skipped: number }
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

/**
 * Runs the recurring auto-create engine and, for signed-in users, pushes
 * whatever it produced up to Supabase.
 *
 * applyDueRecurring() only returns a new local DB — it never talks to the
 * network. Without this wrapper, every cloud fetch (sign-in, "Sync Now",
 * every future re-login) would materialize the same due recurring items
 * locally, never see them again after the next cloud fetch (since they were
 * never saved to Supabase), and materialize them again — silently
 * double- or triple-counting income/expenses over time for anyone using
 * recurring auto-create while signed in.
 */
function runRecurringAndSync(db: DB, userId: string | null): DB {
  const beforeCount = db.transactions.length
  const beforeDue = new Map(db.recurring.map((r) => [r.id, r.nextDueDate]))

  const result = applyDueRecurring(db)
  if (!userId) return result

  const createdCount = result.transactions.length - beforeCount
  if (createdCount > 0) {
    const created = result.transactions.slice(0, createdCount)
    cloudUpsertTransactions(created, userId).catch(console.error)
  }
  const changedRecurring = result.recurring.filter((r) => beforeDue.get(r.id) !== r.nextDueDate)
  if (changedRecurring.length > 0) {
    Promise.all(changedRecurring.map((r) => cloudUpsertRecurring(r, userId))).catch(console.error)
  }
  return result
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user, enabled: authEnabled } = useAuth()
  const { toast } = useToast()
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const [db, setDb] = useState<DB>(() => {
    const d = loadDB()
    if (d.transactions.length === 0) return applyDueRecurring(seedData(d))
    return applyDueRecurring(d)
  })

  const userId = user?.id || null
  const dbRef = useRef(db)
  dbRef.current = db

  // Sync with Supabase on user sign-in or session load
  useEffect(() => {
    if (!userId || !user) return

    let active = true
    const loadCloudData = async () => {
      setSyncing(true)
      try {
        const cloudData = await fetchCloudDB(userId)
        if (!active) return

        if (cloudData && (cloudData.transactions.length > 0 || cloudData.categories.length > 0)) {
          const fresh = runRecurringAndSync(cloudData, userId)
          setDb(fresh)
          saveDB(fresh)
          setLastSyncedAt(new Date().toISOString())
        } else {
          // New cloud user: seed with local data — but only if this device's
          // local cache actually belongs to this account. On a shared device,
          // a second account signing in after a first account already synced
          // would otherwise see the first account's leftover local data,
          // conclude (correctly) that ITS OWN cloud is empty, and upload the
          // first account's private transactions into the second account.
          const lastSyncedFor = getLastCloudUser()
          const current = lastSyncedFor && lastSyncedFor !== userId ? seedData(defaultDB()) : dbRef.current
          const seedTarget: DB = {
            ...current,
            profile: {
              ...(current.profile || {
                id: userId,
                name: user.user_metadata?.name || 'You',
                email: user.email || '',
                currency: 'INR',
                timezone: 'Asia/Kolkata',
                theme: 'system',
                onboarded: false,
                monthlyIncome: null,
                createdAt: new Date().toISOString(),
              }),
              id: userId,
              email: user.email || current.profile?.email || '',
            },
          }
          await seedCloudUser(userId, seedTarget)
          if (!active) return
          setDb(seedTarget)
          saveDB(seedTarget)
          setLastSyncedAt(new Date().toISOString())
        }
        setLastCloudUser(userId)
      } catch (err) {
        console.error('Error syncing cloud data on mount:', err)
      } finally {
        if (active) setSyncing(false)
      }
    }

    loadCloudData()

    return () => {
      active = false
    }
  }, [userId])

  // Save to local cache on state changes
  useEffect(() => {
    saveDB(db)
  }, [db])

  // Theme application
  useEffect(() => {
    const root = document.documentElement
    const apply = (t: 'light' | 'dark') => {
      root.classList.toggle('dark', t === 'dark')
      // Browser chrome (mobile status bar / address bar) follows the theme.
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0C0E0D' : '#F7F7F4')
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

  const syncNow = useCallback(async () => {
    if (!userId) {
      toast({ title: 'Local Mode', message: 'Sign in to sync with Supabase Cloud', tone: 'info' })
      return
    }
    setSyncing(true)
    try {
      const cloudData = await fetchCloudDB(userId)
      if (cloudData) {
        const merged = runRecurringAndSync(cloudData, userId)
        setDb(merged)
        saveDB(merged)
        setLastSyncedAt(new Date().toISOString())
        toast({ title: 'Synced', message: 'Your data is up to date with the cloud', tone: 'success' })
      }
    } catch (err) {
      toast({ title: 'Sync Error', message: 'Could not sync with Supabase', tone: 'error' })
    } finally {
      setSyncing(false)
    }
  }, [userId, toast])

  const updateProfile = useCallback(
    (p: Partial<Profile>) => {
      let updatedProfile: Profile | null = null
      update((d) => {
        const base = d.profile || {
          id: userId || uid('u_'),
          name: 'You',
          email: '',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          theme: 'system',
          onboarded: false,
          monthlyIncome: null,
          createdAt: new Date().toISOString(),
        }
        updatedProfile = { ...base, ...p }
        return {
          ...d,
          profile: updatedProfile,
        }
      })
      if (updatedProfile && userId) {
        cloudSyncProfile(updatedProfile).catch(console.error)
      }
    },
    [update, userId]
  )

  const addTransactions: AppContextValue['addTransactions'] = useCallback(
    (txs) => {
      const ids: string[] = []
      const now = new Date().toISOString()
      const items: Transaction[] = txs.map((t) => {
        const id = uid('tx_')
        ids.push(id)
        return { ...t, id, createdAt: now, updatedAt: now }
      })

      update((d) => ({ ...d, transactions: [...items, ...d.transactions] }))

      if (userId && items.length > 0) {
        cloudUpsertTransactions(items, userId).catch(console.error)
      }
      return ids
    },
    [update, userId]
  )

  const addParsedTransactions: AppContextValue['addParsedTransactions'] = useCallback(
    (parsed, source) => {
      const now = new Date().toISOString()
      let createdTransactions: Transaction[] = []
      let newCategories: Category[] = []
      let skippedCount = 0

      const dedupeKey = (date: string, type: string, amount: number, desc: string): string => {
        const cleanDesc = (desc || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        return `${date}|${type}|${Math.round(amount * 100)}|${cleanDesc}`
      }

      update((d) => {
        let categories = d.categories
        const prevCatCount = categories.length

        // Deduplication against existing database transactions
        const existingKeys = new Set(
          d.transactions.map((t) => dedupeKey(t.transactionDate, t.type, t.amount, t.description))
        )
        const batchKeys = new Set<string>()

        const filtered = parsed.filter((p) => {
          const key = dedupeKey(p.date || todayISO(), p.type, p.amount, p.description)
          if (existingKeys.has(key) || batchKeys.has(key)) {
            skippedCount++
            return false // skip duplicate entry!
          }
          batchKeys.add(key)
          return true
        })

        const items: Transaction[] = filtered.map((p) => {
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
        createdTransactions = items
        if (categories.length > prevCatCount) {
          newCategories = categories.slice(prevCatCount)
        }
        return { ...d, categories, transactions: [...items, ...d.transactions] }
      })

      if (userId) {
        if (newCategories.length > 0) {
          Promise.all(newCategories.map((c) => cloudUpsertCategory(c, userId))).catch(console.error)
        }
        if (createdTransactions.length > 0) {
          cloudUpsertTransactions(createdTransactions, userId).catch(console.error)
        }
      }
      return { added: createdTransactions.length, skipped: skippedCount }
    },
    [update, userId]
  )

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      let updated: Transaction | null = null
      update((d) => ({
        ...d,
        transactions: d.transactions.map((t) => {
          if (t.id === id) {
            updated = { ...t, ...patch, updatedAt: new Date().toISOString() }
            return updated
          }
          return t
        }),
      }))
      if (userId && updated) {
        cloudUpsertTransactions([updated], userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteTransactions = useCallback(
    (ids: string[]) => {
      const set = new Set(ids)
      update((d) => ({ ...d, transactions: d.transactions.filter((t) => !set.has(t.id)) }))
      if (userId && ids.length > 0) {
        cloudDeleteTransactions(ids).catch(console.error)
      }
    },
    [update, userId]
  )

  const upsertBudget = useCallback(
    (b: Partial<Budget> & { id?: string }) => {
      let savedBudget: Budget | null = null
      update((d) => {
        if (b.id) {
          const budgets = d.budgets.map((x) => {
            if (x.id === b.id) {
              savedBudget = { ...x, ...b } as Budget
              return savedBudget
            }
            return x
          })
          return { ...d, budgets }
        }
        const nb: Budget = {
          id: uid('b_'),
          name: 'Budget',
          type: 'overall',
          categoryId: null,
          amount: 0,
          period: 'monthly',
          startDate: null,
          endDate: null,
          rollover: false,
          createdAt: new Date().toISOString(),
          ...b,
        }
        savedBudget = nb
        return { ...d, budgets: [...d.budgets, nb] }
      })
      if (userId && savedBudget) {
        cloudUpsertBudget(savedBudget, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteBudget = useCallback(
    (id: string) => {
      update((d) => ({ ...d, budgets: d.budgets.filter((x) => x.id !== id) }))
      if (userId) {
        cloudDeleteBudget(id).catch(console.error)
      }
    },
    [update, userId]
  )

  const upsertRecurring = useCallback(
    (r: Partial<Recurring> & { id?: string }) => {
      let savedRecurring: Recurring | null = null
      update((d) => {
        if (r.id) {
          const recurring = d.recurring.map((x) => {
            if (x.id === r.id) {
              savedRecurring = { ...x, ...r } as Recurring
              return savedRecurring
            }
            return x
          })
          return { ...d, recurring }
        }
        const nr: Recurring = {
          id: uid('r_'),
          name: 'Recurring',
          type: 'expense',
          amount: 0,
          categoryId: d.categories[0]?.id || '',
          subcategoryId: null,
          frequency: 'monthly',
          startDate: todayISO(),
          nextDueDate: null,
          endDate: null,
          paymentMethodId: null,
          autoCreate: false,
          reminder: true,
          notes: null,
          active: true,
          createdAt: new Date().toISOString(),
          ...r,
        }
        savedRecurring = nr
        return { ...d, recurring: [...d.recurring, nr] }
      })
      if (userId && savedRecurring) {
        cloudUpsertRecurring(savedRecurring, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteRecurring = useCallback(
    (id: string) => {
      update((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== id) }))
      if (userId) {
        cloudDeleteRecurring(id).catch(console.error)
      }
    },
    [update, userId]
  )

  const upsertBill = useCallback(
    (b: Partial<Bill> & { id?: string }) => {
      let savedBill: Bill | null = null
      update((d) => {
        if (b.id) {
          const bills = d.bills.map((x) => {
            if (x.id === b.id) {
              savedBill = { ...x, ...b } as Bill
              return savedBill
            }
            return x
          })
          return { ...d, bills }
        }
        const nb: Bill = {
          id: uid('bill_'),
          name: 'Bill',
          amount: 0,
          dueDate: todayISO(),
          recurrence: 'monthly',
          categoryId: d.categories[0]?.id || '',
          paymentMethodId: null,
          paid: false,
          reminder: true,
          notes: null,
          createdAt: new Date().toISOString(),
          ...b,
        }
        savedBill = nb
        return { ...d, bills: [...d.bills, nb] }
      })
      if (userId && savedBill) {
        cloudUpsertBill(savedBill, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteBill = useCallback(
    (id: string) => {
      update((d) => ({ ...d, bills: d.bills.filter((x) => x.id !== id) }))
      if (userId) {
        cloudDeleteBill(id).catch(console.error)
      }
    },
    [update, userId]
  )

  const toggleBillPaid = useCallback(
    (id: string) => {
      let updatedBill: Bill | null = null
      update((d) => ({
        ...d,
        bills: d.bills.map((x) => {
          if (x.id === id) {
            updatedBill = { ...x, paid: !x.paid }
            return updatedBill
          }
          return x
        }),
      }))
      if (userId && updatedBill) {
        cloudUpsertBill(updatedBill, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const upsertSubscription = useCallback(
    (s: Partial<Subscription> & { id?: string }) => {
      let savedSub: Subscription | null = null
      update((d) => {
        if (s.id) {
          const subscriptions = d.subscriptions.map((x) => {
            if (x.id === s.id) {
              savedSub = { ...x, ...s } as Subscription
              return savedSub
            }
            return x
          })
          return { ...d, subscriptions }
        }
        const ns: Subscription = {
          id: uid('sub_'),
          name: 'Subscription',
          amount: 0,
          frequency: 'monthly',
          categoryId: d.categories.find((c) => c.name === 'Subscriptions')?.id || '',
          paymentMethodId: null,
          active: true,
          nextBilling: null,
          notes: null,
          createdAt: new Date().toISOString(),
          ...s,
        }
        savedSub = ns
        return { ...d, subscriptions: [...d.subscriptions, ns] }
      })
      if (userId && savedSub) {
        cloudUpsertSubscription(savedSub, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteSubscription = useCallback(
    (id: string) => {
      update((d) => ({ ...d, subscriptions: d.subscriptions.filter((x) => x.id !== id) }))
      if (userId) {
        cloudDeleteSubscription(id).catch(console.error)
      }
    },
    [update, userId]
  )

  const upsertGoal = useCallback(
    (g: Partial<Goal> & { id?: string }) => {
      let savedGoal: Goal | null = null
      update((d) => {
        if (g.id) {
          const goals = d.goals.map((x) => {
            if (x.id === g.id) {
              savedGoal = { ...x, ...g } as Goal
              return savedGoal
            }
            return x
          })
          return { ...d, goals }
        }
        const ng: Goal = {
          id: uid('g_'),
          name: 'Goal',
          targetAmount: 0,
          currentAmount: 0,
          targetDate: null,
          monthlyContribution: null,
          icon: 'PiggyBank',
          createdAt: new Date().toISOString(),
          ...g,
        }
        savedGoal = ng
        return { ...d, goals: [...d.goals, ng] }
      })
      if (userId && savedGoal) {
        cloudUpsertGoal(savedGoal, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteGoal = useCallback(
    (id: string) => {
      update((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== id) }))
      if (userId) {
        cloudDeleteGoal(id).catch(console.error)
      }
    },
    [update, userId]
  )

  const contributeGoal = useCallback(
    (id: string, amount: number) => {
      let updatedGoal: Goal | null = null
      update((d) => ({
        ...d,
        goals: d.goals.map((x) => {
          if (x.id === id) {
            updatedGoal = { ...x, currentAmount: x.currentAmount + amount }
            return updatedGoal
          }
          return x
        }),
      }))
      if (userId && updatedGoal) {
        cloudUpsertGoal(updatedGoal, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const upsertDebt = useCallback(
    (dt: Partial<Debt> & { id?: string }) => {
      let savedDebt: Debt | null = null
      update((d) => {
        if (dt.id) {
          const debts = d.debts.map((x) => {
            if (x.id === dt.id) {
              savedDebt = { ...x, ...dt } as Debt
              return savedDebt
            }
            return x
          })
          return { ...d, debts }
        }
        const nd: Debt = {
          id: uid('d_'),
          name: 'Debt',
          originalBalance: 0,
          currentBalance: 0,
          interestRate: null,
          minPayment: null,
          dueDate: null,
          frequency: 'monthly',
          paymentAmount: 0,
          categoryId: null,
          createdAt: new Date().toISOString(),
          ...dt,
        }
        savedDebt = nd
        return { ...d, debts: [...d.debts, nd] }
      })
      if (userId && savedDebt) {
        cloudUpsertDebt(savedDebt, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteDebt = useCallback(
    (id: string) => {
      update((d) => ({ ...d, debts: d.debts.filter((x) => x.id !== id) }))
      if (userId) {
        cloudDeleteDebt(id).catch(console.error)
      }
    },
    [update, userId]
  )

  const upsertCategory = useCallback(
    (c: Partial<Category> & { id?: string }) => {
      let savedCategory: Category | null = null
      update((d) => {
        if (c.id) {
          const categories = d.categories.map((x) => {
            if (x.id === c.id) {
              savedCategory = { ...x, ...c } as Category
              return savedCategory
            }
            return x
          })
          return { ...d, categories }
        }
        const nc: Category = { id: uid('cat_'), name: 'Category', type: 'expense', parentId: null, icon: 'Tag', system: false, ...c }
        savedCategory = nc
        return { ...d, categories: [...d.categories, nc] }
      })
      if (userId && savedCategory) {
        cloudUpsertCategory(savedCategory, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteCategory = useCallback(
    (id: string) => {
      update((d) => ({ ...d, categories: d.categories.filter((x) => x.id !== id) }))
      if (userId) {
        cloudDeleteCategory(id).catch(console.error)
      }
    },
    [update, userId]
  )

  const upsertPaymentMethod = useCallback(
    (p: Partial<PaymentMethod> & { id?: string }) => {
      let savedPm: PaymentMethod | null = null
      update((d) => {
        if (p.id) {
          const paymentMethods = d.paymentMethods.map((x) => {
            if (x.id === p.id) {
              savedPm = { ...x, ...p } as PaymentMethod
              return savedPm
            }
            return x
          })
          return { ...d, paymentMethods }
        }
        const np: PaymentMethod = { id: uid('pm_'), name: 'Method', icon: 'CircleDashed', system: false, ...p }
        savedPm = np
        return { ...d, paymentMethods: [...d.paymentMethods, np] }
      })
      if (userId && savedPm) {
        cloudUpsertPaymentMethod(savedPm, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const addRule = useCallback(
    (rule: Omit<UserCategoryRule, 'id'>) => {
      const nr: UserCategoryRule = { ...rule, id: uid('rule_') }
      update((d) => ({ ...d, userCategoryRules: [...d.userCategoryRules, nr] }))
      if (userId) {
        cloudUpsertRule(nr, userId).catch(console.error)
      }
    },
    [update, userId]
  )

  const deleteRule = useCallback(
    (id: string) => {
      update((d) => ({ ...d, userCategoryRules: d.userCategoryRules.filter((x) => x.id !== id) }))
      if (userId) {
        cloudDeleteRule(id).catch(console.error)
      }
    },
    [update, userId]
  )

  const seed = useCallback(() => {
    const seeded = seedData({ ...defaultDB(), profile: db.profile })
    update(() => seeded)
    if (userId) {
      seedCloudUser(userId, seeded).catch(console.error)
    }
  }, [update, db.profile, userId])

  const resetAll = useCallback(() => {
    const seeded = seedData(defaultDB())
    update(() => seeded)
    if (userId) {
      cloudClearAllData(userId)
        .then(() => seedCloudUser(userId, seeded))
        .catch(console.error)
    }
  }, [update, userId])

  const replaceDB = useCallback(
    (ndb: DB) => {
      setDb(ndb)
      if (userId) {
        seedCloudUser(userId, ndb).catch(console.error)
      }
    },
    [userId]
  )

  const backupJSON = useCallback(() => exportJSON(db), [db])

  const setTheme = useCallback(
    (t: 'light' | 'dark' | 'system') => {
      updateProfile({ theme: t })
    },
    [updateProfile]
  )

  const hasData = db.transactions.length > 0
  const seeded = true

  const value = useMemo<AppContextValue>(
    () => ({
      db,
      hasData,
      seeded,
      syncing,
      lastSyncedAt,
      cloudEnabled: Boolean(authEnabled && user),
      syncNow,
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
    [
      db,
      hasData,
      seeded,
      syncing,
      lastSyncedAt,
      authEnabled,
      user,
      syncNow,
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
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
