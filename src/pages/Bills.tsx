import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Check, Repeat, CreditCard } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Bill, Subscription } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Field, Badge } from '@/components/ui/Misc'
import { Icon } from '@/components/ui/Icon'
import { categoryColor } from '@/lib/categories'
import { money, todayISO, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Bills() {
  const { db, upsertBill, deleteBill, toggleBillPaid, upsertSubscription, deleteSubscription } = useApp()
  const [editBill, setEditBill] = useState<Bill | 'new' | null>(null)
  const [editSub, setEditSub] = useState<Subscription | 'new' | null>(null)

  const bills = useMemo(() => [...db.bills].sort((a, b) => (a.paid === b.paid ? a.dueDate.localeCompare(b.dueDate) : a.paid ? 1 : -1)), [db.bills])
  const monthlySubCost = useMemo(() => db.subscriptions.filter((s) => s.active).reduce((s, x) => s + (x.frequency === 'monthly' ? x.amount : x.amount / 12), 0), [db.subscriptions])
  const annualSubCost = monthlySubCost * 12

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Bills</h2>
            <p className="text-sm text-base-muted">Track upcoming payments</p>
          </div>
          <button onClick={() => setEditBill('new')} className="btn-primary"><Plus className="h-4 w-4" /> New bill</button>
        </div>
        {bills.length === 0 ? (
          <div className="card mt-4 p-10 text-center text-sm text-base-muted">No bills yet. Add electricity, internet, rent &amp; more.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {bills.map((b) => {
              const cat = db.categories.find((c) => c.id === b.categoryId)
              const overdue = !b.paid && b.dueDate < todayISO()
              return (
                <div key={b.id} className={cn('card flex flex-wrap items-center gap-3 p-4', b.paid && 'opacity-55')}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ backgroundColor: categoryColor(cat?.name) + '1A', color: categoryColor(cat?.name) }}>
                    <Icon name={cat?.icon || 'FileText'} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{b.name}</div>
                    <div className="text-xs text-base-muted">Due {formatDate(b.dueDate)}{overdue && <span className="ml-1 font-semibold text-negative">· overdue</span>} · {b.recurrence}</div>
                  </div>
                  <div className="tabular text-lg font-bold">{money(b.amount)}</div>
                  {b.paid ? <Badge tone="positive"><Check className="h-3 w-3" /> Paid</Badge> : <Badge tone="warning">Due</Badge>}
                  <button onClick={() => toggleBillPaid(b.id)} className="btn-secondary !py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> {b.paid ? 'Mark unpaid' : 'Mark paid'}</button>
                  <div className="flex gap-1">
                    <button onClick={() => setEditBill(b)} className="rounded-lg p-1.5 text-base-muted hover:bg-base/5"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => deleteBill(b.id)} className="rounded-lg p-1.5 text-base-muted hover:bg-negative-soft hover:text-negative"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold"><Repeat className="h-5 w-5 text-accent" /> Subscriptions</h2>
            <p className="text-sm text-base-muted">
              {money(monthlySubCost)}<span className="text-xs">/mo</span> · {money(annualSubCost)}<span className="text-xs">/yr</span> in active subscriptions
            </p>
          </div>
          <button onClick={() => setEditSub('new')} className="btn-primary"><Plus className="h-4 w-4" /> Add subscription</button>
        </div>
        {db.subscriptions.length === 0 ? (
          <div className="card mt-4 p-10 text-center text-sm text-base-muted">No subscriptions tracked yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {db.subscriptions.map((s) => (
              <div key={s.id} className={cn('card flex flex-wrap items-center gap-3 p-4', !s.active && 'opacity-50')}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft"><CreditCard className="h-5 w-5 text-accent" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">{s.name}{!s.active && <Badge>Paused</Badge>}</div>
                  <div className="text-xs text-base-muted">{s.frequency}{s.nextBilling ? ` · next ${formatDate(s.nextBilling)}` : ''}</div>
                </div>
                <div className="tabular text-lg font-bold">{money(s.amount)}<span className="text-xs font-medium text-base-muted">/{s.frequency === 'monthly' ? 'mo' : 'yr'}</span></div>
                <div className="flex gap-1">
                  <button onClick={() => setEditSub(s)} className="rounded-lg p-1.5 text-base-muted hover:bg-base/5"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => deleteSubscription(s.id)} className="rounded-lg p-1.5 text-base-muted hover:bg-negative-soft hover:text-negative"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editBill && <BillModal bill={editBill === 'new' ? null : editBill} onClose={() => setEditBill(null)} onSave={(b) => { upsertBill(b); setEditBill(null) }} />}
      {editSub && <SubModal sub={editSub === 'new' ? null : editSub} onClose={() => setEditSub(null)} onSave={(s) => { upsertSubscription(s); setEditSub(null) }} />}
    </div>
  )
}

function BillModal({ bill, onClose, onSave }: { bill: Bill | null; onClose: () => void; onSave: (b: Partial<Bill>) => void }) {
  const { db } = useApp()
  const [form, setForm] = useState({
    id: bill?.id, name: bill?.name || '', amount: bill?.amount || 0, dueDate: bill?.dueDate || todayISO(),
    recurrence: bill?.recurrence || 'monthly', categoryId: bill?.categoryId || db.categories.find((c) => c.name === 'Bills')?.id || '', paymentMethodId: bill?.paymentMethodId || '', reminder: bill?.reminder ?? true,
  })
  return (
    <Modal open onClose={onClose} title={bill ? 'Edit bill' : 'New bill'} size="sm">
      <div className="space-y-3">
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Electricity Bill" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)"><input type="number" min={0} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="input" /></Field>
          <Field label="Due date"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="input" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="input">
              {db.categories.filter((c) => !c.parentId && c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Recurrence">
            <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as Bill['recurrence'] })} className="input">
              <option value="none">One-time</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
            </select>
          </Field>
        </div>
        <Field label="Payment method">
          <select value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })} className="input">
            <option value="">None</option>
            {db.paymentMethods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave(form)} disabled={!form.name.trim() || form.amount <= 0} className="btn-primary">Save</button>
      </div>
    </Modal>
  )
}

function SubModal({ sub, onClose, onSave }: { sub: Subscription | null; onClose: () => void; onSave: (s: Partial<Subscription>) => void }) {
  const [form, setForm] = useState({
    id: sub?.id, name: sub?.name || '', amount: sub?.amount || 0, frequency: sub?.frequency || 'monthly',
    nextBilling: sub?.nextBilling || todayISO(), active: sub?.active ?? true, paymentMethodId: sub?.paymentMethodId || '',
  })
  return (
    <Modal open onClose={onClose} title={sub ? 'Edit subscription' : 'Add subscription'} size="sm">
      <div className="space-y-3">
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Netflix" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)"><input type="number" min={0} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="input" /></Field>
          <Field label="Billing">
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as 'monthly' | 'yearly' })} className="input">
              <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </Field>
        </div>
        <Field label="Next billing date"><input type="date" value={form.nextBilling} onChange={(e) => setForm({ ...form, nextBilling: e.target.value })} className="input" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4" /> Active</label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave(form)} disabled={!form.name.trim() || form.amount <= 0} className="btn-primary">Save</button>
      </div>
    </Modal>
  )
}
