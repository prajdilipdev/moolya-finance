import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, PiggyBank, ArrowUpRight } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Goal } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Field, Progress, EmptyState } from '@/components/ui/Misc'
import { Icon } from '@/components/ui/Icon'
import { money, pct, todayISO, daysBetween } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Goals() {
  const { db, upsertGoal, deleteGoal, contributeGoal } = useApp()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [contributing, setContributing] = useState<Goal | null>(null)
  const [toDelete, setToDelete] = useState<Goal | null>(null)

  const totalSaved = useMemo(() => db.goals.reduce((s, g) => s + g.currentAmount, 0), [db.goals])
  const totalTarget = useMemo(() => db.goals.reduce((s, g) => s + g.targetAmount, 0), [db.goals])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Savings Goals</h2>
          <p className="text-sm text-base-muted">{money(totalSaved)} saved toward {money(totalTarget)}</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> New goal</button>
      </div>

      {db.goals.length === 0 ? (
        <EmptyState icon="Target" title="No goals yet" description="Create goals like an emergency fund, a new phone, or a vacation." action={<button onClick={() => setEditing('new')} className="btn-primary"><Plus className="h-4 w-4" /> Create goal</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {db.goals.map((g) => {
            const progress = pct(g.currentAmount, g.targetAmount)
            const remaining = Math.max(g.targetAmount - g.currentAmount, 0)
            return (
              <div key={g.id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft"><Icon name={g.icon || 'PiggyBank'} className="h-5 w-5 text-accent" /></span>
                    <div>
                      <div className="font-bold">{g.name}</div>
                      <div className="text-xs text-base-muted">{g.targetDate ? `Target ${g.targetDate}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setContributing(g)} className="rounded-lg p-2 text-accent hover:bg-accent-soft sm:p-1.5" aria-label="Contribute"><ArrowUpRight className="h-4 w-4" /></button>
                    <button onClick={() => setEditing(g)} className="rounded-lg p-2 text-base-muted hover:bg-base/5 sm:p-1.5"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setToDelete(g)} className="rounded-lg p-2 text-base-muted hover:bg-negative-soft hover:text-negative sm:p-1.5"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div className="tabular text-2xl font-extrabold">{money(g.currentAmount)}</div>
                  <div className="tabular text-sm text-base-muted">of {money(g.targetAmount)}</div>
                </div>
                <div className="mt-2"><Progress value={progress} tone={progress >= 100 ? 'positive' : 'accent'} /></div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="tabular font-semibold text-accent">{Math.round(progress)}%</span>
                  <span className="text-base-muted">{money(remaining)} to go{g.monthlyContribution ? ` · ~${Math.ceil(remaining / Math.max(g.monthlyContribution, 1))} mo` : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && <GoalModal goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={(g) => { upsertGoal(g); setEditing(null) }} />}
      {contributing && (
        <Modal open onClose={() => setContributing(null)} title={`Contribute to ${contributing.name}`} size="sm">
          <ContributeForm goal={contributing} onClose={() => setContributing(null)} onContribute={contributeGoal} />
        </Modal>
      )}
      {toDelete && (
        <Modal open onClose={() => setToDelete(null)} title="Delete Goal" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-base-muted">
              Are you sure you want to delete the savings goal <strong className="text-base">{toDelete.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setToDelete(null)} className="btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteGoal(toDelete.id)
                  setToDelete(null)
                }}
                className="btn-primary !bg-red-600 hover:!bg-red-700"
              >
                Delete Goal
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ContributeForm({ goal, onClose, onContribute }: { goal: Goal; onClose: () => void; onContribute: (id: string, amount: number) => void }) {
  const [amount, setAmount] = useState(0)
  return (
    <div className="space-y-3">
      <Field label="Amount to add (₹)"><input type="number" min={0} value={amount || ''} onChange={(e) => setAmount(+e.target.value)} className="input" autoFocus /></Field>
      <p className="text-xs text-base-muted">This updates your goal progress. It does not create a transaction.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => { if (amount > 0) { onContribute(goal.id, amount); onClose() } }} disabled={amount <= 0} className="btn-primary">Add {money(amount)}</button>
      </div>
    </div>
  )
}

function GoalModal({ goal, onClose, onSave }: { goal: Goal | null; onClose: () => void; onSave: (g: Partial<Goal>) => void }) {
  const [form, setForm] = useState({
    id: goal?.id, name: goal?.name || '', targetAmount: goal?.targetAmount || 0, currentAmount: goal?.currentAmount || 0,
    targetDate: goal?.targetDate || '', monthlyContribution: goal?.monthlyContribution || 0, icon: goal?.icon || 'PiggyBank',
  })
  return (
    <Modal open onClose={onClose} title={goal ? 'Edit goal' : 'New goal'} size="sm">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Emergency Fund" /></Field>
          <Field label="Icon">
            <select value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className="input">
              {['PiggyBank', 'Smartphone', 'Plane', 'Car', 'Home', 'Star', 'Target'].map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target (₹)"><input type="number" min={0} value={form.targetAmount || ''} onChange={(e) => setForm({ ...form, targetAmount: +e.target.value })} className="input" /></Field>
          <Field label="Saved so far (₹)"><input type="number" min={0} value={form.currentAmount || ''} onChange={(e) => setForm({ ...form, currentAmount: +e.target.value })} className="input" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target date"><input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} className="input" /></Field>
          <Field label="Monthly contribution (₹)"><input type="number" min={0} value={form.monthlyContribution || ''} onChange={(e) => setForm({ ...form, monthlyContribution: +e.target.value })} className="input" /></Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave(form)} disabled={!form.name.trim() || form.targetAmount <= 0} className="btn-primary">Save</button>
      </div>
    </Modal>
  )
}
