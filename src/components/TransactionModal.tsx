import React, { useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Transaction } from '@/lib/types'
import { Modal } from './ui/Modal'
import { Field } from './ui/Misc'
import { todayISO, money } from '@/lib/format'
import { extractAmount } from '@/lib/parser'
import { cn } from '@/lib/utils'
import { Trash2, AlertTriangle } from 'lucide-react'

export function TransactionModal({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: Transaction | null
  onClose: () => void
  onSaved?: () => void
}) {
  const { db, addTransactions, updateTransaction, deleteTransactions } = useApp()
  const { toast } = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [amountText, setAmountText] = useState(transaction ? String(transaction.amount) : '')
  const [conversionHint, setConversionHint] = useState<string | null>(null)
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

  const handleAmountChange = (val: string) => {
    setAmountText(val)
    if (!val.trim()) {
      setForm((prev) => ({ ...prev, amount: 0 }))
      setConversionHint(null)
      return
    }

    const extracted = extractAmount(val)
    if (extracted && extracted.amount > 0) {
      setForm((prev) => ({ ...prev, amount: extracted.amount }))
      if (extracted.originalCurrency && extracted.originalAmount) {
        setConversionHint(`Converted: ${extracted.originalCurrency} ${extracted.originalAmount} ≈ ₹${extracted.amount.toLocaleString('en-IN')}`)
      } else {
        setConversionHint(null)
      }
    } else {
      const num = parseFloat(val.replace(/[^\d.]/g, ''))
      setForm((prev) => ({ ...prev, amount: isNaN(num) ? 0 : num }))
      setConversionHint(null)
    }
  }

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
      toast({ title: 'Transaction updated', tone: 'success' })
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
      toast({ title: 'Transaction added', tone: 'success' })
    }
    onSaved?.()
    onClose()
  }

  const handleDelete = () => {
    if (!transaction) return
    deleteTransactions([transaction.id])
    toast({
      title: 'Transaction deleted',
      message: `Deleted "${transaction.description}" (${money(transaction.amount)})`,
      tone: 'success',
    })
    onSaved?.()
    onClose()
  }

  return (
    <>
      <Modal open onClose={onClose} title={transaction ? 'Edit transaction' : 'Add transaction'} size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, type: 'expense', categoryId: '', subcategoryId: '' })}
              className={cn('btn', form.type === 'expense' ? 'bg-negative-soft text-negative font-semibold' : 'bg-base/5 text-base-muted')}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, type: 'income', categoryId: '', subcategoryId: '' })}
              className={cn('btn', form.type === 'income' ? 'bg-positive-soft text-positive font-semibold' : 'bg-base/5 text-base-muted')}
            >
              Income
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)">
              <input
                type="text"
                value={amountText}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="input tabular font-semibold"
                placeholder="e.g. 200 or $21"
              />
              {conversionHint && (
                <p className="mt-1 text-[11px] text-accent font-medium">{conversionHint}</p>
              )}
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="input"
              />
            </Field>
          </div>
          <Field label="Description">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input"
              placeholder="e.g. Pav Bhaji"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value, subcategoryId: '' })}
                className="input"
              >
                <option value="">Select…</option>
                {parents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subcategory">
              <select
                value={form.subcategoryId}
                onChange={(e) => setForm({ ...form, subcategoryId: e.target.value })}
                className="input"
              >
                <option value="">None</option>
                {subcats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment method">
              <select
                value={form.paymentMethodId}
                onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}
                className="input"
              >
                <option value="">None</option>
                {db.paymentMethods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Merchant">
              <input
                value={form.merchant}
                onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                className="input"
                placeholder="Optional"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input"
              rows={2}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between border-t pt-4">
          {transaction ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn bg-negative-soft text-negative text-xs hover:bg-negative/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!form.description.trim() || form.amount <= 0}
              className="btn-primary text-xs"
            >
              {transaction ? 'Save changes' : 'Add transaction'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Dialog inside Modal */}
      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(false)}
          title="Delete Transaction?"
          size="sm"
          footer={
            <div className="flex w-full items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="btn bg-negative text-white text-xs hover:bg-negative/90"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Permanently
              </button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-negative-soft text-negative">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold">
                Delete "{transaction?.description}"?
              </h4>
              {transaction && (
                <p className="mt-0.5 text-xs font-semibold text-base-muted">
                  Amount: {money(transaction.amount, transaction.currency)}
                </p>
              )}
              <p className="mt-2 text-xs text-base-muted leading-relaxed">
                This transaction will be permanently removed from your device and Supabase cloud database.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
