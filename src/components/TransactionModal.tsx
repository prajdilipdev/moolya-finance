import React, { useState } from 'react'
import { useApp } from '@/context/AppContext'
import { Transaction } from '@/lib/types'
import { Modal } from './ui/Modal'
import { Field } from './ui/Misc'
import { todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'

export function TransactionModal({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: Transaction | null
  onClose: () => void
  onSaved?: () => void
}) {
  const { db, addTransactions, updateTransaction } = useApp()
  const [form, setForm] = useState(() =>
    transaction
      ? {
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          categoryId: transaction.categoryId,
          subcategoryId: transaction.subcategoryId || '',
          merchant: transaction.merchant || '',
          paymentMethodId: transaction.paymentMethodId || '',
          date: transaction.transactionDate,
          notes: transaction.notes || '',
        }
      : {
          type: 'expense' as 'expense' | 'income',
          amount: 0,
          description: '',
          categoryId: '',
          subcategoryId: '',
          merchant: '',
          paymentMethodId: '',
          date: todayISO(),
          notes: '',
        }
  )

  const parents = db.categories.filter((c) => !c.parentId && c.type === form.type)
  const subcats = db.categories.filter((c) => c.parentId === form.categoryId)

  const save = () => {
    if (!form.description.trim() || form.amount <= 0) return
    const catId = form.categoryId || parents[0]?.id || ''
    if (!catId) return
    if (transaction) {
      updateTransaction(transaction.id, {
        type: form.type,
        amount: form.amount,
        description: form.description.trim(),
        categoryId: catId,
        subcategoryId: form.subcategoryId || null,
        merchant: form.merchant || null,
        paymentMethodId: form.paymentMethodId || null,
        transactionDate: form.date,
        notes: form.notes || null,
      })
    } else {
      addTransactions([
        {
          type: form.type,
          amount: form.amount,
          currency: 'INR',
          description: form.description.trim(),
          categoryId: catId,
          subcategoryId: form.subcategoryId || null,
          merchant: form.merchant || null,
          paymentMethodId: form.paymentMethodId || null,
          transactionDate: form.date,
          notes: form.notes || null,
          source: 'manual',
          parserConfidence: null,
        },
      ])
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={transaction ? 'Edit transaction' : 'Add transaction'} size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setForm({ ...form, type: 'expense', categoryId: '', subcategoryId: '' })} className={cn('btn', form.type === 'expense' ? 'bg-negative-soft text-negative' : 'bg-base/5 text-base-muted')}>Expense</button>
          <button onClick={() => setForm({ ...form, type: 'income', categoryId: '', subcategoryId: '' })} className={cn('btn', form.type === 'income' ? 'bg-positive-soft text-positive' : 'bg-base/5 text-base-muted')}>Income</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <input type="number" min={0} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="input" placeholder="0" />
          </Field>
          <Field label="Date">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </Field>
        </div>
        <Field label="Description">
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" placeholder="e.g. Pav Bhaji" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value, subcategoryId: '' })} className="input">
              <option value="">Select…</option>
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
          <Field label="Payment method">
            <select value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })} className="input">
              <option value="">None</option>
              {db.paymentMethods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Merchant">
            <input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} className="input" placeholder="Optional" />
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" rows={2} placeholder="Optional" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={save} disabled={!form.description.trim() || form.amount <= 0} className="btn-primary">{transaction ? 'Save changes' : 'Add transaction'}</button>
      </div>
    </Modal>
  )
}
