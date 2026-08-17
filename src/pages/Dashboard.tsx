import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ArrowDownRight, Wallet, PiggyBank, TrendingDown, Sparkles, ChevronRight, AlertTriangle, CalendarClock } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { usePeriod } from '@/context/PeriodContext'
import { QuickAdd } from '@/components/QuickAdd'
import { SetupChecklist } from '@/components/SetupChecklist'
import { TransactionRow } from '@/components/TransactionList'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { StatCard, Progress, Badge } from '@/components/ui/Misc'
import { Icon } from '@/components/ui/Icon'
import { computeTotals, filterByRange, overallBudgetFor, budgetStatus, computeInsights, buildForecast, forecastTotal, dailyLimit } from '@/lib/calc'
import { money, greeting, todayISO, formatDate, monthKey } from '@/lib/format'

export function Dashboard() {
  const { db } = useApp()
  const { range } = usePeriod()
  const initialBalance = db.profile?.initialBalance || 0
  const txs = useMemo(() => filterByRange(db.transactions, range), [db.transactions, range])
  const totals = useMemo(() => computeTotals(txs, initialBalance), [txs, initialBalance])
  const allTotals = useMemo(() => computeTotals(db.transactions, initialBalance), [db.transactions, initialBalance])
  const budget = useMemo(() => overallBudgetFor(db), [db])
  const insights = useMemo(() => computeInsights(db, range), [db, range])
  const forecast = useMemo(() => buildForecast(db), [db])
  const forecastNet = useMemo(() => forecastTotal(forecast), [forecast])
  const limit = useMemo(() => dailyLimit(budget, range), [budget, range])

  const today = todayISO()
  const todayTotals = useMemo(() => computeTotals(db.transactions.filter((t) => t.transactionDate === today)), [db.transactions, today])
  const todayTxs = useMemo(
    () => db.transactions.filter((t) => t.transactionDate === today).slice(0, 5),
    [db.transactions, today]
  )

  const recent = useMemo(() => [...db.transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).slice(0, 7), [db.transactions])

  // Largest expense in period
  const largestExp = useMemo(() => txs.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0], [txs])
  const largestInc = useMemo(() => txs.filter((t) => t.type === 'income').sort((a, b) => b.amount - a.amount)[0], [txs])
  const avgDaily = txs.length ? totals.expenses / Math.max(new Set(txs.map((t) => t.transactionDate)).size, 1) : 0

  const monthlyForChart = useMemo(() => {
    const year = new Date().getFullYear()
    // Keys must be built in local time — toISOString() would shift every month
    // back by one for timezones ahead of UTC (IST included).
    const buckets = Array.from({ length: 12 }, (_, i) => ({
      key: monthKey(new Date(year, i, 1)),
      month: new Date(year, i, 1).toLocaleString('en-US', { month: 'short' }),
      income: 0,
      expenses: 0,
    }))
    const byKey = new Map(buckets.map((b) => [b.key, b]))
    for (const t of db.transactions) {
      const b = byKey.get(t.transactionDate.slice(0, 7))
      if (!b) continue
      if (t.type === 'income') b.income += t.amount
      else b.expenses += t.amount
    }
    return buckets
  }, [db.transactions])

  const maxChart = Math.max(...monthlyForChart.flatMap((m) => [m.income, m.expenses]), 1)

  return (
    <div className="space-y-6">
      {/* Greeting + balance */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{greeting()}, {db.profile?.name || 'there'} 👋</h2>
            <p className="mt-0.5 text-sm text-base-muted">Your financial overview</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Badge tone={allTotals.savings >= 0 ? 'positive' : 'negative'}>
              <PiggyBank className="h-3 w-3" /> Savings rate {Math.round(totals.savingsRate)}%
            </Badge>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card relative mt-4 overflow-hidden border-emerald-500/20 bg-[linear-gradient(145deg,#060C09,#0E1D16)] p-6 text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.15)]"
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25"
            style={{ background: 'radial-gradient(circle, #10B981 0%, transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #059669 0%, transparent 70%)' }}
          />
          <div className="relative flex items-center justify-between">
            <span className="text-sm font-medium text-white/70">Available Balance</span>
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold backdrop-blur">
              {db.profile?.currency || 'INR'} · All time
            </span>
          </div>
          <div className="relative mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
            <AnimatedNumber value={allTotals.balance} currency={db.profile?.currency} />
          </div>
          <div className="relative mt-4 text-xs font-medium text-white/50">
            {formatDate(range.start)}{range.start !== range.end ? ` – ${formatDate(range.end)}` : ''}
          </div>
          <div className="relative mt-2 grid grid-cols-3 gap-3">
            <div className="rounded-[13px] bg-white/[0.07] p-3 ring-1 ring-white/10">
              <div className="flex items-center gap-1 text-xs text-white/60"><ArrowUpRight className="h-3.5 w-3.5 text-emerald-300" /> Income</div>
              <div className="tabular mt-1 text-lg font-bold text-emerald-300"><AnimatedNumber value={totals.income} /></div>
            </div>
            <div className="rounded-[13px] bg-white/[0.07] p-3 ring-1 ring-white/10">
              <div className="flex items-center gap-1 text-xs text-white/60"><ArrowDownRight className="h-3.5 w-3.5 text-red-300" /> Expenses</div>
              <div className="tabular mt-1 text-lg font-bold text-red-300"><AnimatedNumber value={totals.expenses} /></div>
            </div>
            <div className="rounded-[13px] bg-white/[0.07] p-3 ring-1 ring-white/10">
              <div className="flex items-center gap-1 text-xs text-white/60"><PiggyBank className="h-3.5 w-3.5 text-sky-300" /> Savings</div>
              <div className="tabular mt-1 text-lg font-bold text-sky-300"><AnimatedNumber value={totals.savings} /></div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Quick Add */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold">Quick Add</h3>
        </div>
        <QuickAdd />
      </section>

      {/* Setup checklist */}
      <SetupChecklist />

      {/* Today */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold"><CalendarClock className="h-4 w-4 text-accent" /> Today</h3>
          <span className="text-xs text-base-muted">{formatDate(today)}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-[13px] border bg-card-muted/70 p-3">
            <div className="text-xs font-medium text-base-muted">Expenses</div>
            <div className="tabular mt-1 text-xl font-bold text-negative"><AnimatedNumber value={todayTotals.expenses} /></div>
          </div>
          <div className="rounded-[13px] border bg-card-muted/70 p-3">
            <div className="text-xs font-medium text-base-muted">Income</div>
            <div className="tabular mt-1 text-xl font-bold text-positive"><AnimatedNumber value={todayTotals.income} /></div>
          </div>
          <div className="rounded-[13px] border bg-card-muted/70 p-3">
            <div className="text-xs font-medium text-base-muted">Net</div>
            <div className="tabular mt-1 text-xl font-bold text-accent"><AnimatedNumber value={todayTotals.income - todayTotals.expenses} /></div>
          </div>
        </div>
        {todayTxs.length > 0 ? (
          <div className="mt-3 divide-y divide-line">
            {todayTxs.map((t) => (
              <TransactionRow key={t.id} t={t} db={db} compact />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-base-muted">No transactions today yet. Add one above with Quick Add.</p>
        )}
      </motion.section>

      {/* Metric cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Budget Used" value={`${Math.round(budget?.usedPct || 0)}%`} icon="WalletCards" tone={budget && budget.usedPct > 90 ? 'negative' : budget && budget.usedPct > 75 ? 'accent' : 'neutral'} sub={budget ? `${money(budget.remaining)} remaining of ${money(budget.budget.amount)}` : 'No overall budget'} delay={0.05} />
        <StatCard label="Avg Daily Spend" value={money(avgDaily)} icon="CalendarClock" sub={`${new Set(txs.map((t) => t.transactionDate)).size} active days`} delay={0.1} />
        <StatCard label="Expense Ratio" value={`${Math.round(totals.expenseRatio)}%`} icon="TrendingDown" tone={totals.expenseRatio > 80 ? 'negative' : 'neutral'} sub="of income" delay={0.15} />
        <StatCard label="Transactions" value={String(txs.length)} icon="List" sub="in period" delay={0.2} />
      </section>

      {/* Daily limit + forecast */}
      <section className="grid gap-4 lg:grid-cols-2">
        {budget && (
          <div className="card p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Wallet className="h-4 w-4 text-accent" /> Daily Spending Limit</h3>
            <div className="tabular mt-3 text-3xl font-extrabold">{money(limit.perDay)}<span className="text-base text-base-muted">/day</span></div>
            <p className="mt-1 text-xs text-base-muted">Remaining budget {money(Math.max(budget.remaining, 0))} across {limit.daysLeft} days. A calculated guideline, not financial advice.</p>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-base-muted"><span>Overall budget</span><span>{Math.round(budget.usedPct)}% used</span></div>
              <Progress value={budget.usedPct} tone={budget.usedPct > 90 ? 'negative' : budget.usedPct > 75 ? 'warning' : 'accent'} />
            </div>
          </div>
        )}
        <div className="card p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold"><TrendingDown className="h-4 w-4 text-accent" /> Cash Flow Forecast</h3>
          <div className="mt-3 space-y-1.5">
            {forecast.map((l, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-base-muted">
                  {l.projected && <Badge tone="accent" className="!px-1.5 !text-[9px]">EST</Badge>}
                  {l.label}
                </span>
                <span className={cnTone(l.amount)}>{l.amount >= 0 ? '+' : ''}{money(l.amount)}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t pt-2">
              <span className="text-sm font-bold">Projected balance</span>
              <span className={cnTone(forecastNet)}>{money(forecastNet)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-base-muted">Projections are estimates from recurring items, bills &amp; subscriptions.</p>
        </div>
      </section>

      {/* Budgets overview */}
      {db.budgets.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Budget Status</h3>
            <Link to="/budgets" className="flex items-center text-xs font-semibold text-accent hover:underline">Manage <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="mt-4 space-y-4">
            {db.budgets.slice(0, 5).map((b) => {
              const st = budgetStatus(b, db.transactions, db.categories)
              return (
                <div key={b.id}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon name={db.categories.find((c) => c.id === b.categoryId)?.icon || 'Wallet'} className="h-4 w-4 text-base-muted" />
                      {b.name}
                      {st.usedPct >= 100 && <AlertTriangle className="h-3.5 w-3.5 text-negative" />}
                    </span>
                    <span className="tabular text-xs text-base-muted">{money(st.spent)} / {money(st.budget.amount)} · {Math.round(st.usedPct)}%</span>
                  </div>
                  <Progress value={st.usedPct} tone={st.usedPct > 90 ? 'negative' : st.usedPct > 75 ? 'warning' : 'positive'} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Recent + insights */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Recent Transactions</h3>
            <Link to="/transactions" className="flex items-center text-xs font-semibold text-accent hover:underline">View all <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
          {recent.length > 0 ? (
            <div className="mt-2 divide-y divide-line">
              {recent.map((t) => <TransactionRow key={t.id} t={t} db={db} compact />)}
            </div>
          ) : (
            <p className="mt-3 text-sm text-base-muted">No transactions yet. Use Quick Add above to start.</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
            <div>
              <div className="text-xs text-base-muted">Largest expense</div>
              {largestExp ? (
                <div className="font-semibold">{largestExp.description} · <span className="tabular">{money(largestExp.amount)}</span></div>
              ) : <div className="text-base-muted">—</div>}
            </div>
            <div>
              <div className="text-xs text-base-muted">Largest income source</div>
              {largestInc ? (
                <div className="font-semibold">{largestInc.description} · <span className="tabular">{money(largestInc.amount)}</span></div>
              ) : <div className="text-base-muted">—</div>}
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-bold">Insights</h3>
          <div className="mt-3 space-y-3">
            {insights.slice(0, 5).map((ins, i) => (
              <div key={i} className="flex gap-2.5 rounded-xl bg-base/5 p-3 text-sm">
                <Icon name={ins.kind === 'positive' ? 'CheckCircle2' : ins.kind === 'warning' ? 'AlertTriangle' : 'Info'} className={cnToneIcon(ins.kind)} />
                <span className="text-sm leading-snug text-base-muted">{ins.text}</span>
              </div>
            ))}
            {insights.length === 0 && <p className="text-sm text-base-muted">Add more transactions to see smart insights.</p>}
          </div>
        </div>
      </section>

      {/* Yearly chart */}
      <section className="card p-5">
        <h3 className="text-sm font-bold">Income vs Expenses · This Year</h3>
        <div className="mt-4 flex h-48 items-end gap-1.5 sm:gap-3">
          {monthlyForChart.map((m, i) => (
            <div key={i} className="group flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end justify-center gap-1">
                <div className="w-1/3 rounded-t bg-positive/70 transition-all group-hover:bg-positive" style={{ height: `${(m.income / maxChart) * 100}%`, minHeight: m.income ? 4 : 0 }} title={`${m.month} income ${money(m.income)}`} />
                <div className="w-1/3 rounded-t bg-negative/70 transition-all group-hover:bg-negative" style={{ height: `${(m.expenses / maxChart) * 100}%`, minHeight: m.expenses ? 4 : 0 }} title={`${m.month} expenses ${money(m.expenses)}`} />
              </div>
              <span className="text-[10px] text-base-muted">{m.month}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-base-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-positive/70" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-negative/70" /> Expenses</span>
        </div>
      </section>
    </div>
  )
}

function cnTone(amount: number) {
  return `tabular font-semibold ${amount >= 0 ? 'text-positive' : 'text-negative'}`
}
function cnToneIcon(kind: string) {
  return `h-4 w-4 shrink-0 mt-0.5 ${kind === 'positive' ? 'text-positive' : kind === 'warning' ? 'text-warning' : 'text-accent'}`
}
