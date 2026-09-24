import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, CreditCard, TrendingDown, CalendarClock } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Debt, Frequency } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Field, Progress, EmptyState } from '@/components/ui/Misc'
import { money, todayISO, pct, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Debts() {
  const { db, upsertDebt, deleteDebt } = useApp()
  const [editing, setEditing] = useState<Debt | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<Debt | null>(null)

  const totalBalance = useMemo(() => db.debts.reduce((s, d) => s + d.currentBalance, 0), [db.debts])
  const totalOriginal = useMemo(() => db.debts.reduce((s, d) => s + d.originalBalance, 0), [db.debts])
  const monthlyObligation = useMemo(() => db.debts.reduce((s, d) => s + d.paymentAmount, 0), [db.debts])
  const paid = Math.max(totalOriginal - totalBalance, 0)

  return (
    <div className="space-y-4">
      <div className="page-head flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="hidden text-xl font-bold sm:block">Debts &amp; EMI</h2>
          <p className="text-sm text-base-muted">Track loans, credit cards and EMIs</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> New debt</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card min-w-0 p-4">
          <div className="truncate text-xs text-base-muted">Total balance</div>
          <div className="tabular mt-1 truncate text-xl font-extrabold text-negative sm:text-2xl">{money(totalBalance)}</div>
        </div>
        <div className="card min-w-0 p-4">
          <div className="truncate text-xs text-base-muted">Paid off</div>
          <div className="tabular mt-1 truncate text-xl font-extrabold text-positive sm:text-2xl">{money(paid)}</div>
        </div>
        <div className="card min-w-0 p-4">
          <div className="truncate text-xs text-base-muted">Monthly obligation</div>
          <div className="tabular mt-1 truncate text-xl font-extrabold sm:text-2xl">{money(monthlyObligation)}</div>
        </div>
        <div className="card min-w-0 p-4">
          <div className="truncate text-xs text-base-muted">Progress</div>
          <div className="tabular mt-1 truncate text-xl font-extrabold text-accent sm:text-2xl">{Math.round(pct(paid, totalOriginal))}%</div>
        </div>
      </div>

      {db.debts.length === 0 ? (
        <EmptyState icon="CreditCard" title="No debts tracked" description="Add credit cards, personal loans or EMIs to see your obligations." action={<button onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> Add debt</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {db.debts.map((d) => {
            const progress = pct(d.originalBalance - d.currentBalance, d.originalBalance)
            return (
              <div key={d.id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-negative-soft"><CreditCard className="h-5 w-5 text-negative" /></span>
                    <div>
                      <div className="font-bold">{d.name}</div>
                      <div className="text-xs text-base-muted">{d.interestRate ? `${d.interestRate}% interest` : 'No interest'} · {d.frequency}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(d)} className="rounded-lg p-2 text-base-muted hover:bg-base/5 sm:p-1.5"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setToDelete(d)} className="rounded-lg p-2 text-base-muted hover:bg-negative-soft hover:text-negative sm:p-1.5"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div className="tabular text-2xl font-extrabold">{money(d.currentBalance)}</div>
                  <div className="tabular text-sm text-base-muted">of {money(d.originalBalance)}</div>
                </div>
                <div className="mt-2"><Progress value={progress} tone="positive" /></div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="tabular whitespace-nowrap font-semibold text-positive">{Math.round(progress)}% paid</span>
                  <span className="flex min-w-0 items-center gap-1 text-xs text-base-muted sm:text-sm"><TrendingDown className="h-3.5 w-3.5 shrink-0" /> <span className="whitespace-nowrap">{money(d.paymentAmount)}/payment</span>{d.dueDate && <span className="whitespace-nowrap">· due {formatDate(d.dueDate)}</span>}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && <DebtModal debt={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={(d) => { upsertDebt(d); setEditing(null) }} />}

      {toDelete && (
        <Modal open onClose={() => setToDelete(null)} title="Delete Debt" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-base-muted">
              Are you sure you want to delete <strong className="text-base">{toDelete.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setToDelete(null)} className="btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteDebt(toDelete.id)
                  setToDelete(null)
                }}
                className="btn-primary !bg-red-600 hover:!bg-red-700"
              >
                Delete Debt
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function DebtModal({ debt, onClose, onSave }: { debt: Debt | null; onClose: () => void; onSave: (d: Partial<Debt>) => void }) {
  const [form, setForm] = useState({
    id: debt?.id, name: debt?.name || '', originalBalance: debt?.originalBalance || 0, currentBalance: debt?.currentBalance || 0,
    interestRate: debt?.interestRate || 0, paymentAmount: debt?.paymentAmount || 0, minPayment: debt?.minPayment || 0,
    dueDate: debt?.dueDate || '', frequency: debt?.frequency || 'monthly', categoryId: debt?.categoryId || '',
  })
  return (
    <Modal open onClose={onClose} title={debt ? 'Edit debt' : 'New debt'} size="md">
      <div className="space-y-3">
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Credit Card" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Original balance (₹)"><input type="number" min={0} value={form.originalBalance || ''} onChange={(e) => setForm({ ...form, originalBalance: +e.target.value })} className="input" /></Field>
          <Field label="Current balance (₹)"><input type="number" min={0} value={form.currentBalance || ''} onChange={(e) => setForm({ ...form, currentBalance: +e.target.value })} className="input" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interest rate (%)"><input type="number" min={0} value={form.interestRate || ''} onChange={(e) => setForm({ ...form, interestRate: +e.target.value })} className="input" /></Field>
          <Field label="Frequency">
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })} className="input">
              {['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment amount (₹)"><input type="number" min={0} value={form.paymentAmount || ''} onChange={(e) => setForm({ ...form, paymentAmount: +e.target.value })} className="input" /></Field>
          <Field label="Due date"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="input" /></Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave(form)} disabled={!form.name.trim()} className="btn-primary">Save</button>
      </div>
    </Modal>
  )
}
