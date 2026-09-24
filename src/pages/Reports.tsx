import React, { useMemo, useState } from 'react'
import { Download, FileJson, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { computeTotals, budgetStatus } from '@/lib/calc'
import { money, downloadFile, toISODate } from '@/lib/format'
import { Badge } from '@/components/ui/Misc'

export function Reports() {
  const { db, backupJSON } = useApp()
  const [monthOffset, setMonthOffset] = useState(0)

  const target = useMemo(() => {
    const now = new Date()
    const date = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      key,
      start: toISODate(new Date(date.getFullYear(), date.getMonth(), 1)),
      end: toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
      prevStart: toISODate(new Date(date.getFullYear(), date.getMonth() - 1, 1)),
      prevEnd: toISODate(new Date(date.getFullYear(), date.getMonth(), 0)),
      label: date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    }
  }, [monthOffset])

  const monthTxs = useMemo(
    () => db.transactions.filter((t) => t.transactionDate >= target.start && t.transactionDate <= target.end),
    [db.transactions, target]
  )
  const totals = useMemo(() => computeTotals(monthTxs), [monthTxs])
  const prevTotals = useMemo(
    () => computeTotals(db.transactions.filter((t) => t.transactionDate >= target.prevStart && t.transactionDate <= target.prevEnd)),
    [db.transactions, target]
  )

  const byCat = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>()
    for (const t of monthTxs) {
      if (t.type !== 'expense') continue
      const c = db.categories.find((x) => x.id === t.categoryId)
      const name = c?.name || 'Other'
      const cur = map.get(name) || { name, amount: 0, count: 0 }
      cur.amount += t.amount
      cur.count += 1
      map.set(name, cur)
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [monthTxs, db.categories])

  const largestExp = useMemo(() => monthTxs.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0], [monthTxs])
  const overallBudget = db.budgets.find((b) => b.type === 'overall')
  const budgetUse = overallBudget ? budgetStatus(overallBudget, db.transactions, db.categories) : null

  const expChange = prevTotals.expenses > 0 ? ((totals.expenses - prevTotals.expenses) / prevTotals.expenses) * 100 : 0
  const savChange = prevTotals.savings > 0 ? ((totals.savings - prevTotals.savings) / prevTotals.savings) * 100 : 0

  const exportCSV = () => {
    const header = ['date', 'type', 'amount', 'currency', 'description', 'category', 'subcategory', 'payment_method', 'source']
    const rows = monthTxs.map((t) => [
      t.transactionDate, t.type, t.amount, t.currency, `"${t.description.replace(/"/g, '""')}"`,
      db.categories.find((c) => c.id === t.categoryId)?.name || '',
      t.subcategoryId ? db.categories.find((c) => c.id === t.subcategoryId)?.name || '' : '',
      t.paymentMethodId ? db.paymentMethods.find((p) => p.id === t.paymentMethodId)?.name || '' : '',
      t.source,
    ].join(','))
    downloadFile(`transactions-${target.key}.csv`, [header.join(','), ...rows].join('\n'), 'text/csv')
  }

  const exportJSON = () => downloadFile('moolya-backup.json', backupJSON(), 'application/json')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Reports</h2>
          <p className="text-sm text-base-muted">Monthly summaries with export</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-base/5 p-1">
            <button onClick={() => setMonthOffset((o) => o - 1)} className="rounded-lg p-2 hover:bg-base/10 sm:p-1.5" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-[100px] text-center text-sm font-semibold sm:min-w-[120px]">{target.label}</span>
            <button onClick={() => setMonthOffset((o) => Math.min(o + 1, 0))} className="rounded-lg p-2 hover:bg-base/10 sm:p-1.5" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button onClick={exportCSV} className="btn-secondary text-xs"><FileSpreadsheet className="h-4 w-4" /> CSV</button>
          <button onClick={exportJSON} className="btn-secondary text-xs"><FileJson className="h-4 w-4" /> Backup</button>
        </div>
      </div>

      <div className="card relative overflow-hidden border-emerald-500/20 bg-[linear-gradient(145deg,#060C09,#0E1D16)] p-6 text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.15)]">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #10B981 0%, transparent 70%)' }}
        />
        <div className="relative">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white/70">Monthly Summary</h3>
          <Badge tone="accent" className="!bg-white/10 !text-emerald-300">Savings rate {Math.round(totals.savingsRate)}%</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="min-w-0"><div className="text-xs text-white/60">Income</div><div className="tabular mt-1 truncate text-xl font-bold">{money(totals.income)}</div></div>
          <div className="min-w-0"><div className="text-xs text-white/60">Expenses</div><div className="tabular mt-1 truncate text-xl font-bold">{money(totals.expenses)}</div></div>
          <div className="min-w-0"><div className="text-xs text-white/60">Savings</div><div className="tabular mt-1 truncate text-xl font-bold text-emerald-300">{money(totals.savings)}</div></div>
          <div className="min-w-0"><div className="text-xs text-white/60">Budget usage</div><div className="tabular mt-1 truncate text-xl font-bold">{budgetUse ? `${Math.round(budgetUse.usedPct)}%` : '—'}</div></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm sm:grid-cols-3">
          <div className="min-w-0"><div className="text-xs text-white/60">Top category</div><div className="truncate font-semibold">{byCat[0] ? `${byCat[0].name} · ${money(byCat[0].amount)}` : '—'}</div></div>
          <div className="min-w-0"><div className="text-xs text-white/60">Largest expense</div><div className="truncate font-semibold">{largestExp ? `${largestExp.description} · ${money(largestExp.amount)}` : '—'}</div></div>
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <div className="text-xs text-white/60">vs previous month</div>
            <div className="font-semibold">Expenses <span className={expChange <= 0 ? 'text-emerald-300' : 'text-red-300'}>{expChange <= 0 ? '↓' : '↑'} {Math.abs(expChange).toFixed(1)}%</span> · Savings <span className={savChange >= 0 ? 'text-emerald-300' : 'text-red-300'}>{savChange >= 0 ? '↑' : '↓'} {Math.abs(savChange).toFixed(1)}%</span></div>
          </div>
        </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-sm font-bold">Expense by Category</h3>
          <div className="mt-3 divide-y divide-line">
            {byCat.map((c) => (
              <div key={c.name} className="flex items-center justify-between py-2 text-sm">
                <span className="text-base-muted">{c.name} <span className="text-xs">({c.count})</span></span>
                <span className="tabular font-semibold">{money(c.amount)}</span>
              </div>
            ))}
            {byCat.length === 0 && <p className="py-4 text-sm text-base-muted">No expenses this month.</p>}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-bold">Budget Report</h3>
          <div className="mt-3 space-y-3">
            {db.budgets.length === 0 ? <p className="text-sm text-base-muted">No budgets configured.</p> :
              db.budgets.map((b) => {
                const st = budgetStatus(b, db.transactions, db.categories)
                return (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <span className="text-base-muted">{b.name}</span>
                    <span className="tabular"><span className="font-semibold">{money(st.spent)}</span> / {money(st.budget.amount)} · <span className={st.usedPct > 100 ? 'text-negative' : st.usedPct > 90 ? 'text-warning' : 'text-positive'}>{Math.round(st.usedPct)}%</span></span>
                  </div>
                )
              })}
          </div>
          <button onClick={exportCSV} className="btn-secondary mt-4 w-full text-xs"><Download className="h-4 w-4" /> Export {target.key} transactions as CSV</button>
        </div>
      </div>
    </div>
  )
}
