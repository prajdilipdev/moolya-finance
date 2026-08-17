import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Check, SkipForward, RefreshCcw } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Recurring as RecurringItem, Frequency } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Field, Badge, EmptyState } from '@/components/ui/Misc'
import { Icon } from '@/components/ui/Icon'
import { categoryColor } from '@/lib/categories'
import { money, todayISO, advanceByFrequency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const FREQS: Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'halfyearly', 'yearly', 'custom']

export function Recurring() {
  const { db, upsertRecurring, deleteRecurring, addTransactions } = useApp()
  const [editing, setEditing] = useState<RecurringItem | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<RecurringItem | null>(null)

  const sorted = useMemo(() => {
    const list = [...db.recurring]
    const d = (r: RecurringItem) => r.nextDueDate || r.startDate || '9999'
    return list.sort((a, b) => d(a).localeCompare(d(b)))
  }, [db.recurring])

  const monthlyOutflow = useMemo(
    () => db.recurring.filter((r) => r.active && r.type === 'expense' && r.frequency === 'monthly').reduce((s, r) => s + r.amount, 0),
    [db.recurring]
  )
  const monthlyInflow = useMemo(
    () => db.recurring.filter((r) => r.active && r.type === 'income' && r.frequency === 'monthly').reduce((s, r) => s + r.amount, 0),
    [db.recurring]
  )

  const markPaid = (r: RecurringItem) => {
    addTransactions([
      {
        type: r.type,
        amount: r.amount,
        currency: 'INR',
        description: r.name,
        categoryId: r.categoryId,
        subcategoryId: r.subcategoryId,
        merchant: null,
        paymentMethodId: r.paymentMethodId,
        transactionDate: r.nextDueDate || todayISO(),
        notes: `From recurring "${r.name}"`,
        source: 'recurring',
        parserConfidence: null,
      },
    ])
    upsertRecurring({ id: r.id, nextDueDate: nextDue(r, (r.nextDueDate || todayISO())) })
  }

  const skip = (r: RecurringItem) => {
    upsertRecurring({ id: r.id, nextDueDate: nextDue(r, (r.nextDueDate || todayISO())) })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Recurring</h2>
          <p className="text-sm text-base-muted">Repeating income &amp; expenses</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> New recurring</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card min-w-0 p-4">
          <div className="truncate text-xs text-base-muted">Monthly recurring income</div>
          <div className="tabular mt-1 truncate text-xl font-extrabold text-positive sm:text-2xl">{money(monthlyInflow)}</div>
        </div>
        <div className="card min-w-0 p-4">
          <div className="truncate text-xs text-base-muted">Monthly recurring expenses</div>
          <div className="tabular mt-1 truncate text-xl font-extrabold text-negative sm:text-2xl">{money(monthlyOutflow)}</div>
        </div>
        <div className="card col-span-2 min-w-0 p-4 sm:col-span-1">
          <div className="truncate text-xs text-base-muted">Net recurring</div>
          <div className={cn('tabular mt-1 truncate text-xl font-extrabold sm:text-2xl', monthlyInflow - monthlyOutflow >= 0 ? 'text-positive' : 'text-negative')}>{money(monthlyInflow - monthlyOutflow)}</div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon="CalendarClock" title="No recurring items" description="Add rent, salary, subscriptions and other repeating transactions. You can auto-create or just get reminders." action={<button onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> Add recurring</button>} />
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => {
            const cat = db.categories.find((c) => c.id === r.categoryId)
            return (
              <div key={r.id} className={cn('card flex flex-wrap items-center gap-3 p-4', !r.active && 'opacity-50')}>
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-[12px]"
                  style={{ backgroundColor: categoryColor(cat?.name) + '1A', color: categoryColor(cat?.name) }}
                >
                  <Icon name={cat?.icon || 'Repeat'} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    {r.name}
                    {!r.active && <Badge>Inactive</Badge>}
                    {r.autoCreate && <Badge tone="accent">Auto</Badge>}
                  </div>
                  <div className="text-xs text-base-muted">
                    {r.frequency}
                    {r.nextDueDate && ` · due ${formatDate(r.nextDueDate)}`}
                  </div>
                </div>
                <div className="tabular text-lg font-bold">{money(r.amount)}</div>
                {r.active && (
                  <>
                    <button onClick={() => markPaid(r)} className="btn-secondary !py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Mark paid</button>
                    <button onClick={() => skip(r)} className="btn-ghost !py-1.5 text-xs"><SkipForward className="h-3.5 w-3.5" /> Skip</button>
                  </>
                )}
                <div className="flex gap-1">
                  <button onClick={() => setEditing(r)} className="rounded-lg p-1.5 text-base-muted hover:bg-base/5" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setToDelete(r)} className="rounded-lg p-1.5 text-base-muted hover:bg-negative-soft hover:text-negative" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && <RecurringModal recurring={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={(r) => { upsertRecurring(r); setEditing(null) }} />}

      {toDelete && (
        <Modal open onClose={() => setToDelete(null)} title="Delete Recurring Item" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-base-muted">
              Are you sure you want to delete the recurring item <strong className="text-base">{toDelete.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setToDelete(null)} className="btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteRecurring(toDelete.id)
                  setToDelete(null)
                }}
                className="btn-primary !bg-red-600 hover:!bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function nextDue(r: RecurringItem, from: string): string {
  return advanceByFrequency(from, r.frequency)
}

function RecurringModal({ recurring, onClose, onSave }: { recurring: RecurringItem | null; onClose: () => void; onSave: (r: Partial<RecurringItem>) => void }) {
  const { db } = useApp()
  const [form, setForm] = useState({
    id: recurring?.id,
    name: recurring?.name || '',
    type: recurring?.type || 'expense',
    amount: recurring?.amount || 0,
    categoryId: recurring?.categoryId || db.categories.find((c) => c.name === (recurring?.type === 'income' ? 'Income' : 'Other'))?.id || '',
    subcategoryId: recurring?.subcategoryId || '',
    frequency: recurring?.frequency || 'monthly',
    startDate: recurring?.startDate || todayISO(),
    nextDueDate: recurring?.nextDueDate || todayISO(),
    paymentMethodId: recurring?.paymentMethodId || '',
    autoCreate: recurring?.autoCreate ?? true,
    reminder: recurring?.reminder ?? true,
    active: recurring?.active ?? true,
  })
  const parents = db.categories.filter((c) => !c.parentId && c.type === form.type)
  const subcats = db.categories.filter((c) => c.parentId === form.categoryId)

  return (
    <Modal open onClose={onClose} title={recurring ? 'Edit recurring' : 'New recurring'} size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setForm({ ...form, type: 'expense' })} className={cn('btn', form.type === 'expense' ? 'bg-negative-soft text-negative' : 'bg-base/5 text-base-muted')}>Expense</button>
          <button onClick={() => setForm({ ...form, type: 'income' })} className={cn('btn', form.type === 'income' ? 'bg-positive-soft text-positive' : 'bg-base/5 text-base-muted')}>Income</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. Rent" /></Field>
          <Field label="Amount (₹)"><input type="number" min={0} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="input" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value, subcategoryId: '' })} className="input">
              {parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Subcategory">
            <select value={form.subcategoryId} onChange={(e) => setForm({ ...form, subcategoryId: e.target.value })} className="input">
              <option value="">None</option>
              {subcats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequency">
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })} className="input">
              {FREQS.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Payment method">
            <select value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })} className="input">
              <option value="">None</option>
              {db.paymentMethods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date"><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" /></Field>
          <Field label="Next due date"><input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} className="input" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.autoCreate} onChange={(e) => setForm({ ...form, autoCreate: e.target.checked })} className="h-4 w-4" /> Auto-create transaction when due</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reminder} onChange={(e) => setForm({ ...form, reminder: e.target.checked })} className="h-4 w-4" /> Send reminder when due</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4" /> Active</label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button
          onClick={() => onSave({ ...form, subcategoryId: form.subcategoryId || null, paymentMethodId: form.paymentMethodId || null })}
          disabled={!form.name.trim() || form.amount <= 0}
          className="btn-primary"
        >
          Save
        </button>
      </div>
    </Modal>
  )
}
