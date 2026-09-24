import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, X, Sparkles } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'aavishkar.checklist.dismissed'

/**
 * Friendly setup checklist shown on the Dashboard until the core steps are
 * complete or the user dismisses it. Pure UX helper — no logic changes.
 */
export function SetupChecklist() {
  const { db } = useApp()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  const steps = useMemo(() => {
    const hasIncome = db.recurring.some((r) => r.type === 'income' && r.active)
    const hasBudget = db.budgets.length > 0
    const hasGoal = db.goals.length > 0
    const hasBill = db.bills.length > 0
    return [
      { label: 'Set your monthly income', done: hasIncome, to: '/recurring', hint: 'Add salary or freelance as a recurring income' },
      { label: 'Create a budget', done: hasBudget, to: '/budgets', hint: 'Set an overall monthly budget to track spending' },
      { label: 'Add a savings goal', done: hasGoal, to: '/goals', hint: 'Plan for an emergency fund or a big purchase' },
      { label: 'Track a bill', done: hasBill, to: '/bills', hint: 'Add rent, electricity, or a subscription' },
    ]
  }, [db])

  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length

  if (dismissed || allDone) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4 text-accent" /> Get the most out of Moolya
        </h3>
        <button onClick={dismiss} className="rounded-lg p-1.5 text-muted hover:bg-base/5 hover:text-base" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className={cn(
              'group flex items-center gap-3 rounded-[12px] border p-3 transition-colors',
              s.done ? 'border-positive/30 bg-positive-soft/50' : 'border-line bg-card-muted/50 hover:border-accent/40'
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                s.done ? 'bg-positive text-white' : 'border-2 border-dashed border-muted text-transparent'
              )}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-semibold', s.done && 'text-positive')}>{s.label}</span>
              <span className="block truncate text-xs text-base-muted">{s.done ? 'Completed' : s.hint}</span>
            </span>
            {!s.done && <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />}
          </Link>
        ))}
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-base/10">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
    </div>
  )
}
