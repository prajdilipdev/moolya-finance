import React, { useMemo, useState } from 'react'
import { DB, Transaction, TransactionType } from '@/lib/types'
import { DateRange } from '@/lib/calc'
import { money, pct } from '@/lib/format'
import { Icon } from './ui/Icon'
import { Badge } from './ui/Misc'
import { categoryColor } from '@/lib/categories'
import { TransactionModal } from './TransactionModal'
import { TransactionRow } from './TransactionList'
import { cn } from '@/lib/utils'

export function FilterableFlow({
  db,
  range,
  type,
  title,
  icon,
  tone,
}: {
  db: DB
  range: DateRange
  type: TransactionType
  title: string
  icon: string
  tone: 'positive' | 'negative'
}) {
  const [showTxs, setShowTxs] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const txs = useMemo(
    () => db.transactions.filter((t) => t.type === type && t.transactionDate >= range.start && t.transactionDate <= range.end),
    [db.transactions, range, type]
  )
  const total = txs.reduce((s, t) => s + t.amount, 0)

  const byCategory = useMemo(() => {
    const map = new Map<string, { categoryId: string; name: string; icon: string; amount: number; count: number }>()
    for (const t of txs) {
      const c = db.categories.find((x) => x.id === t.categoryId)
      const key = c?.name || 'Other'
      const cur = map.get(key) || { categoryId: t.categoryId, name: key, icon: c?.icon || 'Tag', amount: 0, count: 0 }
      cur.amount += t.amount
      cur.count += 1
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [txs, db.categories])

  const largest = byCategory[0]

  // monthly trend
  const trend = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of txs) {
      const key = t.transactionDate.slice(0, 7)
      map.set(key, (map.get(key) || 0) + t.amount)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
  }, [txs])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={cn('card col-span-2 min-w-0 p-4 sm:col-span-1 sm:p-5', tone === 'positive' ? 'bg-positive-soft/40' : 'bg-negative-soft/40')}>
          <div className="text-xs font-semibold uppercase tracking-wide text-base-muted">Total {title}</div>
          <div className={cn('tabular mt-1 text-3xl font-extrabold', tone === 'positive' ? 'text-positive' : 'text-negative')}>{money(total)}</div>
          <div className="mt-1 text-xs text-base-muted">{txs.length} transactions</div>
        </div>
        <div className="card min-w-0 p-4 sm:p-5">
          <div className="truncate text-xs font-semibold uppercase tracking-wide text-base-muted">Largest source</div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-md font-bold sm:text-lg">
            <Icon name={largest?.icon || 'Tag'} className={cn('h-5 w-5 shrink-0', tone === 'positive' ? 'text-positive' : 'text-negative')} />
            <span className="truncate">{largest?.name || '—'}</span>
          </div>
          <div className="tabular mt-1 text-xs text-base-muted">{largest ? money(largest.amount) : ''}</div>
        </div>
        <div className="card min-w-0 p-4 sm:p-5">
          <div className="truncate text-xs font-semibold uppercase tracking-wide text-base-muted">Avg per {txs.length ? 'day' : 'period'}</div>
          <div className="tabular mt-1 truncate text-lg font-extrabold sm:text-3xl">{money(total / Math.max(new Set(txs.map((t) => t.transactionDate)).size, 1))}</div>
          <div className="mt-1 text-xs text-base-muted">across active days</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-sm font-bold">By Category</h3>
          <div className="mt-4 space-y-4">
            {byCategory.map((c) => (
              <div key={c.categoryId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[8px]" style={{ backgroundColor: categoryColor(c.name) + '1A', color: categoryColor(c.name) }}>
                      <Icon name={c.icon} className="h-3.5 w-3.5" />
                    </span>
                    {c.name} <span className="text-xs text-base-muted">({c.count})</span>
                  </span>
                  <span className={cn('tabular font-semibold', tone === 'positive' ? 'text-positive' : 'text-base')}>{money(c.amount)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-base/10">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct(c.amount, total)}%`, backgroundColor: categoryColor(c.name) }} />
                </div>
              </div>
            ))}
            {byCategory.length === 0 && <p className="text-sm text-base-muted">No {title.toLowerCase()} in this period.</p>}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-bold">Monthly Trend</h3>
          <div className="mt-4 flex h-48 items-end gap-2">
            {trend.map(([k, v]) => (
              <div key={k} className="group flex flex-1 flex-col items-center gap-1">
                <div className={cn('w-full rounded-t transition-all group-hover:opacity-90', tone === 'positive' ? 'bg-positive/70' : 'bg-negative/70')} style={{ height: `${pct(v, Math.max(...trend.map((x) => x[1]), 1)) * 0.9 + 4}%` }} title={money(v)} />
                <span className="text-[10px] text-base-muted">{new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</span>
              </div>
            ))}
            {trend.length === 0 && <p className="text-sm text-base-muted">No data yet.</p>}
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-base-muted">
            <button onClick={() => setShowTxs((s) => !s)} className="font-semibold text-accent hover:underline">
              {showTxs ? 'Hide transactions' : `Show ${txs.length} transactions`}
            </button>
            {largest && <Badge tone={tone}>{largest.name} · {money(largest.amount)}</Badge>}
          </div>
        </div>
      </div>

      {showTxs && (
        <div className="card divide-y divide-line">
          {txs.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).map((t) => (
            <TransactionRow key={t.id} t={t} db={db} onEdit={setEditing} />
          ))}
        </div>
      )}

      {editing && <TransactionModal transaction={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
