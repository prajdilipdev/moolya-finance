import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Budget, BudgetPeriod } from '@/lib/types'
import { budgetStatus, dailyLimit, rangeForPeriod } from '@/lib/calc'
import { Modal } from '@/components/ui/Modal'
import { Field, Progress, Badge, EmptyState } from '@/components/ui/Misc'
import { Icon } from '@/components/ui/Icon'
import { categoryColor } from '@/lib/categories'
import { money, todayISO, addDays, daysBetween } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Budgets() {
  const { db, upsertBudget, deleteBudget } = useApp()
  const [editing, setEditing] = useState<Budget | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<Budget | null>(null)
  const range = rangeForPeriod('thisMonth')

  const statuses = useMemo(
    () => db.budgets.map((b) => ({ ...budgetStatus(b, db.transactions, db.categories) })),
    [db.budgets, db.transactions, db.categories]
  )

  const overall = db.budgets.find((b) => b.type === 'overall')
  const limit = dailyLimit(overall ? statuses.find((s) => s.budget.id === overall.id) || null : null, range)

  return (
    <div className="space-y-4">
      <div className="page-head flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="hidden text-xl font-bold sm:block">Budgets</h2>
          <p className="text-sm text-base-muted">Track spending against monthly budgets</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> New budget</button>
      </div>

      {limit.perDay > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-2 p-4">
          <span className="text-sm text-base-muted">Suggested daily limit (this month)</span>
          <span className="tabular text-xl font-extrabold text-accent">{money(limit.perDay)}<span className="text-sm font-medium text-base-muted">/day</span></span>
        </div>
      )}

      {statuses.length === 0 ? (
        <EmptyState icon="WalletCards" title="No budgets yet" description="Create an overall monthly budget and per-category budgets to track your spending." action={<button onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> Create budget</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {statuses.map((s) => {
            const icon = db.categories.find((c) => c.id === s.budget.categoryId)?.icon || 'Wallet'
            return (
              <div key={s.budget.id} className={cn('card card-hover p-5', s.usedPct >= 100 && 'border-negative/40')}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ backgroundColor: categoryColor(db.categories.find((c) => c.id === s.budget.categoryId)?.name) + '1A', color: categoryColor(db.categories.find((c) => c.id === s.budget.categoryId)?.name) }}>
                      <Icon name={icon} className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2 font-bold">
                        {s.budget.name}
                        {s.usedPct >= 100 && <Badge tone="negative">Over</Badge>}
                        {s.usedPct >= 90 && s.usedPct < 100 && <Badge tone="warning">Warning</Badge>}
                        {s.usedPct >= 75 && s.usedPct < 90 && <Badge tone="accent">Attention</Badge>}
                      </div>
                      <div className="text-xs capitalize text-base-muted">{s.budget.period} budget{s.budget.rollover ? ' · rollover on' : ''}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(s.budget)} className="rounded-lg p-2 text-base-muted hover:bg-base/5 sm:p-1.5" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setToDelete(s.budget)} className="rounded-lg p-2 text-base-muted hover:bg-negative-soft hover:text-negative sm:p-1.5" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="tabular mt-4 text-2xl font-extrabold">{money(s.spent)}<span className="text-sm font-medium text-base-muted"> / {money(s.budget.amount)}</span></div>

                <div className="mt-2">
                  <Progress value={s.usedPct} tone={s.usedPct >= 100 ? 'negative' : s.usedPct >= 90 ? 'negative' : s.usedPct >= 75 ? 'warning' : 'positive'} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-base-muted">Remaining</span>
                  <span className={cn('tabular font-semibold', s.remaining < 0 ? 'text-negative' : 'text-positive')}>{money(s.remaining)}</span>
                </div>

                <ForecastLine budget={s.budget} spent={s.spent} />
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <BudgetModal
          budget={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(b) => { upsertBudget(b); setEditing(null) }}
        />
      )}

      {toDelete && (
        <Modal open onClose={() => setToDelete(null)} title="Delete Budget" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-base-muted">
              Are you sure you want to delete the budget <strong className="text-base">{toDelete.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setToDelete(null)} className="btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteBudget(toDelete.id)
                  setToDelete(null)
                }}
                className="btn-primary !bg-red-600 hover:!bg-red-700"
              >
                Delete Budget
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ForecastLine({ budget, spent }: { budget: Budget; spent: number }) {
  const range = rangeForPeriod('thisMonth')
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const day = new Date().getDate()
  const daysLeft = Math.max(daysInMonth - day + 1, 1)
  const rate = spent / Math.max(day, 1)
  const projected = rate * daysInMonth
  const exceed = projected - budget.amount
  if (budget.period !== 'monthly' || exceed <= 0) return null
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-warning-soft/60 px-3 py-2 text-xs text-warning">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>At your current pace, likely to exceed by ~{money(exceed)} by month end <span className="opacity-60">({daysLeft} days left)</span>.</span>
    </div>
  )
}

function BudgetModal({ budget, onClose, onSave }: { budget: Budget | null; onClose: () => void; onSave: (b: Partial<Budget>) => void }) {
  const { db } = useApp()
  const [form, setForm] = useState({
    id: budget?.id,
    name: budget?.name || '',
    type: budget?.type || 'overall',
    categoryId: budget?.categoryId || '',
    amount: budget?.amount || 0,
    period: budget?.period || 'monthly',
    rollover: budget?.rollover || false,
  })
  const expenseParents = db.categories.filter((c) => !c.parentId && c.type === 'expense')

  return (
    <Modal open onClose={onClose} title={budget ? 'Edit budget' : 'New budget'} size="sm">
      <div className="space-y-3">
        <Field label="Name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. Food, Overall" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setForm({ ...form, type: 'overall' })} className={cn('btn', form.type === 'overall' ? 'bg-accent-soft text-accent' : 'bg-base/5 text-base-muted')}>Overall</button>
          <button onClick={() => setForm({ ...form, type: 'category' })} className={cn('btn', form.type === 'category' ? 'bg-accent-soft text-accent' : 'bg-base/5 text-base-muted')}>Category</button>
        </div>
        {form.type === 'category' && (
          <Field label="Category">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="input">
              <option value="">Select…</option>
              {expenseParents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <input type="number" min={0} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="input" />
          </Field>
          <Field label="Period">
            <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as BudgetPeriod })} className="input">
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.rollover} onChange={(e) => setForm({ ...form, rollover: e.target.checked })} className="h-4 w-4" />
          Roll over unused budget to next period
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave(form)} disabled={!form.name.trim() || form.amount <= 0 || (form.type === 'category' && !form.categoryId)} className="btn-primary">Save</button>
      </div>
    </Modal>
  )
}
