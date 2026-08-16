import React, { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts'
import { useApp } from '@/context/AppContext'
import { usePeriod } from '@/context/PeriodContext'
import { computeTotals, filterByRange, budgetStatus, rangeForPeriod } from '@/lib/calc'
import { money, pct, startOfWeek, formatDateShort } from '@/lib/format'
import { Segmented } from '@/components/ui/Misc'

const POS = '#10B981'
const NEG = '#E05252'
const ACC = '#3B82F6'
const WARN = '#D99A24'
const GREY = '#94A3B8'
const PIE_COLORS = ['#10B981', '#3B82F6', '#D97706', '#E05252', '#7C3AED', '#0D9488', '#DB2777', '#4F46E5', '#D99A24', '#64748B', '#14B8A6', '#A855F7']

function tooltipStyle() {
  return {
    contentStyle: { borderRadius: 12, border: '1px solid hsl(var(--line))', background: 'hsl(var(--card))', fontSize: 12, boxShadow: '0 10px 30px -10px rgba(15,23,42,0.25)' },
    labelStyle: { color: GREY, fontWeight: 600 },
    itemStyle: { padding: 0 },
  }
}

export function Analytics() {
  const { db } = useApp()
  const { range, key } = usePeriod()
  const [granularity, setGranularity] = useStateGranularity(key)
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const txs = useMemo(() => filterByRange(db.transactions, range), [db.transactions, range])
  const totals = useMemo(() => computeTotals(txs), [txs])

  const series = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; income: number; expenses: number; savings: number }>()
    for (const t of txs) {
      let k: string, label: string
      if (granularity === 'daily') {
        k = t.transactionDate
        label = t.transactionDate.slice(8, 10)
      } else if (granularity === 'weekly') {
        // Bucket by the Monday of each week so weeks stay distinct.
        k = startOfWeek(t.transactionDate)
        label = formatDateShort(k)
      } else if (granularity === 'monthly') {
        k = t.transactionDate.slice(0, 7)
        label = new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' })
      } else {
        k = t.transactionDate.slice(0, 4)
        label = k
      }
      if (!buckets.has(k)) buckets.set(k, { key: k, label, income: 0, expenses: 0, savings: 0 })
      const b = buckets.get(k)!
      if (t.type === 'income') b.income += t.amount
      else b.expenses += t.amount
      b.savings = b.income - b.expenses
    }
    // Transactions are stored newest-first, so buckets must be sorted or the
    // x-axis comes out backwards.
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [txs, granularity])

  // Category breakdown
  const byCat = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>()
    for (const t of txs) {
      if (t.type !== 'expense') continue
      const c = db.categories.find((x) => x.id === t.categoryId)
      const name = c?.name || 'Other'
      const cur = map.get(name) || { name, value: 0, color: PIE_COLORS[map.size % PIE_COLORS.length] }
      cur.value += t.amount
      map.set(name, cur)
    }
    return [...map.values()].sort((a, b) => b.value - a.value)
  }, [txs, db.categories])

  const byIncomeSource = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of txs) {
      if (t.type !== 'income') continue
      const c = db.categories.find((x) => x.id === t.categoryId)
      const sub = t.subcategoryId ? db.categories.find((x) => x.id === t.subcategoryId) : null
      const name = sub?.name || c?.name || 'Income'
      map.set(name, (map.get(name) || 0) + t.amount)
    }
    return [...map.entries()].map(([name, value], i) => ({ name, value, color: PIE_COLORS[i % PIE_COLORS.length] })).sort((a, b) => b.value - a.value)
  }, [txs, db.categories])

  // Savings trend monthly
  const savingsTrend = useMemo(() => {
    const yr = rangeForPeriod('thisYear')
    const map = new Map<string, number>()
    for (const t of filterByRange(db.transactions, yr)) {
      const k = t.transactionDate.slice(0, 7)
      const diff = t.type === 'income' ? t.amount : -t.amount
      map.set(k, (map.get(k) || 0) + diff)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ label: new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' }), savings: Math.round(v) }))
  }, [db.transactions])

  // Fixed vs variable
  const fixedVariable = useMemo(() => {
    const fixedCats = new Set(['Housing', 'Rent', 'Utilities', 'Bills', 'Subscriptions', 'Debt & EMI'])
    let fixed = 0, variable = 0
    for (const t of txs) {
      if (t.type !== 'expense') continue
      const c = db.categories.find((x) => x.id === t.categoryId)
      if (c && fixedCats.has(c.name)) fixed += t.amount
      else variable += t.amount
    }
    return [
      { name: 'Fixed', value: fixed, color: ACC },
      { name: 'Variable', value: variable, color: WARN },
    ]
  }, [txs, db.categories])

  const axisColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#1e293b' : '#e2e8f0'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Analytics</h2>
          <p className="text-sm text-base-muted">Trends &amp; breakdowns for the selected period</p>
        </div>
        <Segmented
          value={granularity}
          onChange={(v) => setGranularity(v)}
          options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-sm font-bold">Income vs Expenses</h3>
          <p className="text-xs text-base-muted">Net {money(totals.savings)} this period</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                <Tooltip {...tooltipStyle()} formatter={(v: number) => money(v)} cursor={{ fill: 'hsl(var(--base) / 0.05)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill={POS} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expenses" name="Expenses" fill={NEG} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold">Expenses by Category</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} strokeWidth={0}>
                  {byCat.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle()} formatter={(v: number) => money(v)} />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: isDark ? '#cbd5e1' : '#475569' }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold">Savings Trend</h3>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={savingsTrend} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={POS} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={POS} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                <Tooltip {...tooltipStyle()} formatter={(v: number) => money(v)} />
                <Area type="monotone" dataKey="savings" name="Savings" stroke={POS} fill="url(#savGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold">Fixed vs Variable</h3>
          <div className="mt-4 flex items-center gap-6">
            <div className="h-48 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={fixedVariable} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                    {fixedVariable.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle()} formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> Fixed</span><span className="tabular font-semibold">{money(fixedVariable[0].value)} · {Math.round(pct(fixedVariable[0].value, fixedVariable[0].value + fixedVariable[1].value))}%</span></div>
              <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-warning" /> Variable</span><span className="tabular font-semibold">{money(fixedVariable[1].value)} · {Math.round(pct(fixedVariable[1].value, fixedVariable[0].value + fixedVariable[1].value))}%</span></div>
              <div className="border-t pt-2 text-xs text-base-muted">Fixed = rent, utilities, bills, subscriptions, EMIs.</div>
            </div>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-bold">Cash Flow</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                <Tooltip {...tooltipStyle()} formatter={(v: number) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="income" name="Income" stroke={POS} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke={NEG} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="savings" name="Savings" stroke={ACC} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

function useStateGranularity(key: string): [string, (v: string) => void] {
  const [g, setG] = React.useState<string>(key === 'thisYear' || key === 'lastYear' ? 'monthly' : key === 'all' ? 'yearly' : 'daily')
  return [g, setG]
}
