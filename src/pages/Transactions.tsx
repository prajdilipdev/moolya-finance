import React, { useMemo, useState } from 'react'
import { Search, Plus, Trash2, Filter, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Transaction } from '@/lib/types'
import { TransactionRow } from '@/components/TransactionList'
import { TransactionModal } from '@/components/TransactionModal'
import { EmptyState } from '@/components/ui/Misc'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

export function Transactions() {
  const { db, deleteTransactions } = useApp()
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'income' | 'expense'>('all')
  const [catId, setCatId] = useState('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim()
    let list = db.transactions
    if (type !== 'all') list = list.filter((t) => t.type === type)
    if (catId !== 'all') list = list.filter((t) => t.categoryId === catId || t.subcategoryId === catId)
    if (query) list = list.filter((t) => t.description.toLowerCase().includes(query) || (t.merchant || '').toLowerCase().includes(query))
    return [...list].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
  }, [db.transactions, q, type, catId])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Deleting rows can shrink the list past the current page.
  const safePage = Math.min(page, pages - 1)
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  // Window of page numbers centred on the current page.
  const pageWindow = useMemo(() => {
    const size = Math.min(6, pages)
    let start = Math.max(0, Math.min(safePage - Math.floor(size / 2), pages - size))
    return Array.from({ length: size }, (_, i) => start + i)
  }, [pages, safePage])

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const allSelected = pageItems.length > 0 && pageItems.every((t) => selected.has(t.id))

  const totalShown = filtered.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0)
  const selTotal = useMemo(() => {
    let total = 0
    selected.forEach((id) => {
      const t = db.transactions.find((x) => x.id === id)
      if (t) total += t.type === 'income' ? t.amount : -t.amount
    })
    return total
  }, [selected, db.transactions])

  const parents = db.categories.filter((c) => !c.parentId)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Search transactions…" className="input pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <select value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(0) }} className="input w-auto !py-2">
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select value={catId} onChange={(e) => { setCatId(e.target.value); setPage(0) }} className="input w-auto !py-2">
            <option value="all">All categories</option>
            {parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setCreating(true)} className="btn-primary !px-3"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-accent-soft px-4 py-2.5">
          <span className="text-sm font-semibold text-accent">{selected.size} selected · {money(selTotal)}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => { deleteTransactions([...selected]); setSelected(new Set()) }} className="btn !py-1.5 text-xs bg-negative-soft text-negative">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="btn-ghost !p-1.5"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon="Receipt" title="No transactions found" description="Try adjusting your filters, or add your first transaction with Quick Add." action={<button onClick={() => setCreating(true)} className="btn-primary"><Plus className="h-4 w-4" /> Add transaction</button>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] items-center gap-3 border-b bg-base/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-base-muted md:grid">
            <div className="pl-1">
              <input type="checkbox" className="h-4 w-4" checked={allSelected} onChange={(e) => {
                setSelected(e.target.checked ? new Set(pageItems.map((t) => t.id)) : new Set())
              }} aria-label="Select all" />
            </div>
            <span>Date</span>
            <span>Description</span>
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Source</span>
          </div>
          <div className="divide-y divide-line">
            {pageItems.map((t) => (
              <div key={t.id} className="group">
                <TransactionRow t={t} db={db} onEdit={setEditing} selected={selected.has(t.id)} onSelect={toggleSelect} />
                <div className="flex items-center justify-between px-12 pb-1 text-[11px] text-base-muted md:hidden">
                  <span>{db.categories.find((c) => c.id === t.categoryId)?.name}</span>
                  <span>{t.source} · {t.paymentMethodId ? db.paymentMethods.find((p) => p.id === t.paymentMethodId)?.name : '—'}</span>
                </div>
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-base-muted">{safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length}</span>
              <div className="flex items-center gap-1">
                <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="btn-ghost !p-1.5" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
                {pageWindow.map((i) => (
                  <button key={i} onClick={() => setPage(i)} className={cn('h-8 w-8 rounded-lg text-xs font-semibold', i === safePage ? 'bg-accent text-white' : 'text-base-muted hover:bg-base/5')}>{i + 1}</button>
                ))}
                {pages > pageWindow.length && pageWindow[pageWindow.length - 1] < pages - 1 && <span className="text-xs text-base-muted">…</span>}
                <button disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} className="btn-ghost !p-1.5" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {editing && <TransactionModal transaction={editing} onClose={() => setEditing(null)} />}
      {creating && <TransactionModal transaction={null} onClose={() => setCreating(false)} />}
    </div>
  )
}
