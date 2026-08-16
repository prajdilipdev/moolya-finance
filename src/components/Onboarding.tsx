import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowRight, ArrowLeft, Check, Wallet, TrendingUp } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Modal } from './ui/Modal'
import { Field } from './ui/Misc'
import { todayISO, addMonths } from '@/lib/format'

/**
 * Short, skippable first-run setup: name + currency, then optional monthly
 * income and budget. Pure UX — no feature logic changed.
 */
export function Onboarding() {
  const { db, updateProfile, upsertRecurring, upsertBudget } = useApp()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: db.profile?.name && db.profile?.name !== 'You' ? db.profile?.name : '',
    currency: db.profile?.currency || 'INR',
    monthlyIncome: '',
    monthlyBudget: '',
  })

  // Show only on first run
  if (db.profile?.onboarded) return null
  const show = !db.profile || db.profile.onboarded === false
  if (!show) return null

  const finish = (skip = false) => {
    const income = parseFloat(form.monthlyIncome)
    const budget = parseFloat(form.monthlyBudget)
    if (income > 0) {
      // Without an explicit category this falls back to the first category in
      // the list, which is an *expense* one.
      const incomeCat = db.categories.find((c) => c.name === 'Income' && !c.parentId)
      const salaryCat = db.categories.find((c) => c.name === 'Salary' && c.parentId === incomeCat?.id)
      upsertRecurring({
        name: 'Monthly Income',
        type: 'income',
        amount: income,
        categoryId: incomeCat?.id,
        subcategoryId: salaryCat?.id || null,
        frequency: 'monthly',
        startDate: todayISO(),
        nextDueDate: addMonths(todayISO(), 1),
        autoCreate: true,
        reminder: true,
        active: true,
      })
    }
    if (budget > 0) {
      upsertBudget({
        name: 'Overall',
        type: 'overall',
        categoryId: null,
        amount: budget,
        period: 'monthly',
        rollover: false,
      })
    }
    updateProfile({
      name: (form.name.trim() || 'You'),
      currency: form.currency,
      monthlyIncome: income > 0 ? income : null,
      onboarded: true,
    })
  }

  const title = ['Welcome to Aavishkar', 'Set your monthly income', 'Set a monthly budget'][Math.min(step, 2)]

  return (
    <Modal open onClose={() => finish(true)} title={title} size="sm">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18 }}
        >
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
                <Sparkles className="h-6 w-6 text-accent" />
              </div>
              <p className="text-sm text-base-muted">
                Your private personal finance command center. Type a transaction in plain English and we'll take care of the rest.
              </p>
              <div className="space-y-3">
                <Field label="What should we call you?">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input"
                    placeholder="Your name"
                    autoFocus
                  />
                </Field>
                <Field label="Currency">
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="input">
                    {['INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft">
                <TrendingUp className="h-6 w-6 text-positive" />
              </div>
              <p className="text-sm text-base-muted">
                Optional — add your regular monthly income (e.g. salary) and we'll set up a recurring income for you.
              </p>
              <Field label="Monthly income">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{form.currency === 'INR' ? '₹' : ''}</span>
                  <input
                    type="number"
                    min={0}
                    value={form.monthlyIncome}
                    onChange={(e) => setForm({ ...form, monthlyIncome: e.target.value })}
                    className="input pl-8"
                    placeholder="e.g. 25000"
                    inputMode="numeric"
                  />
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info-soft">
                <Wallet className="h-6 w-6 text-info" />
              </div>
              <p className="text-sm text-base-muted">
                Optional — set an overall monthly budget so we can track how much you're spending.
              </p>
              <Field label="Monthly budget">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{form.currency === 'INR' ? '₹' : ''}</span>
                  <input
                    type="number"
                    min={0}
                    value={form.monthlyBudget}
                    onChange={(e) => setForm({ ...form, monthlyBudget: e.target.value })}
                    className="input pl-8"
                    placeholder="e.g. 40000"
                    inputMode="numeric"
                  />
                </div>
              </Field>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i === step ? 'h-1.5 w-4 rounded-full bg-accent transition-all' : 'h-1.5 w-1.5 rounded-full bg-base/15'} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => finish(true)} className="btn-ghost text-xs">Skip</button>
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="btn-secondary !py-2 text-xs"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
          )}
          {step < 2 ? (
            <button onClick={() => setStep((s) => s + 1)} className="btn-primary !py-2 text-xs">Next <ArrowRight className="h-3.5 w-3.5" /></button>
          ) : (
            <button onClick={() => finish()} className="btn-primary !py-2 text-xs"><Check className="h-3.5 w-3.5" /> Start</button>
          )}
        </div>
      </div>
    </Modal>
  )
}
