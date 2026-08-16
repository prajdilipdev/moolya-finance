import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Loader2, Check, Pencil, X, Calculator, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { parseBlock, parseLine, tryCalculator } from '@/lib/parser'
import { ParsedTransaction } from '@/lib/types'
import { money, todayISO } from '@/lib/format'
import { Modal } from './ui/Modal'
import { Icon } from './ui/Icon'
import { cn } from '@/lib/utils'

const EXAMPLES = ['200rs pav bhaji', '25k salary', '500 petrol', '30rs pani poori']

export function QuickAdd({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { db, addParsedTransactions } = useApp()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [stage, setStage] = useState<'idle' | 'parsing' | 'review' | 'success'>('idle')
  const [results, setResults] = useState<ParsedTransaction[]>([])
  const [errors, setErrors] = useState<{ line: string; reason: string }[]>([])
  const [errorFlash, setErrorFlash] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const calc = tryCalculator(text)

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [autoFocus])

  useEffect(() => {
    if (stage === 'success') {
      const t = setTimeout(() => {
        setStage('idle')
        setText('')
        setResults([])
        setErrors([])
        onDone?.()
      }, onDone ? 900 : 1600)
      return () => clearTimeout(t)
    }
  }, [stage])

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || stage === 'parsing') return
    const { parsed, errors: errs } = parseBlock(text, db)
    if (parsed.length === 0) {
      setErrorFlash(true)
      setErrors(errs)
      setTimeout(() => setErrorFlash(false), 600)
      return
    }
    setResults(parsed)
    setErrors(errs)
    setStage('parsing')
    setTimeout(() => setStage('review'), 380)
  }

  const handleCalc = () => {
    if (!calc) return
    const parsed = parseLine(`${calc.value}rs`, { categories: db.categories, rules: db.userCategoryRules })
    if (!parsed) return
    setResults([{ ...parsed, description: `Calc: ${calc.expression}`, category: 'Other', subcategory: null }])
    setStage('review')
  }

  const confirmAll = () => {
    setStage('parsing')
    setTimeout(() => {
      addParsedTransactions(results, 'quick_entry')
      const inc = results.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0)
      const exp = results.filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0)
      const last = results[results.length - 1]
      toast({
        title: results.length > 1 ? `${results.length} transactions recorded` : `${last?.type === 'income' ? 'Income' : 'Expense'} added`,
        message: results.length > 1
          ? `Income ${money(inc)} · Expenses ${money(exp)}`
          : `${money(last?.amount || 0)} · ${last?.category || ''} ${last?.subcategory ? '→ ' + last.subcategory : ''}`,
        tone: 'success',
      })
      setStage('success')
    }, 350)
  }

  const saveEdited = (edited: ParsedTransaction) => {
    if (editingIndex === null) return
    const next = [...results]
    next[editingIndex] = edited
    setResults(next)
    setEditingIndex(null)
  }

  const total = results.reduce((s, r) => s + r.amount, 0)
  const incomeCount = results.filter((r) => r.type === 'income').length
  const expenseTotal = results.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const incomeTotal = results.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="relative">
      <form onSubmit={handleSubmit}>
          <div
          className={cn(
            'group relative overflow-hidden rounded-[16px] border bg-card transition-all duration-200',
            'shadow-[0_1px_2px_rgba(15,23,42,0.03)] focus-within:shadow-[0_8px_28px_-12px_rgba(16,185,129,0.35)]',
            'focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10',
            errorFlash && 'border-negative shadow-[0_0_0_3px_rgba(224,82,82,0.15)]'
          )}
        >
          <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft">
              <Sparkles className="h-4 w-4 text-accent" />
            </span>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (stage === 'review' || stage === 'success') setStage('idle')
              }}
              placeholder={'What did you spend or earn?'}
              className="w-full bg-transparent text-[15px] font-medium placeholder:text-muted/70 focus:outline-none"
              aria-label="Quick add transaction"
              autoComplete="off"
            />
            {text ? (
              <>
                <kbd className="hidden shrink-0 rounded-md border bg-card-muted px-2 py-1 text-[10px] font-semibold text-muted sm:inline-flex">Enter ↵</kbd>
                <button type="button" onClick={() => setText('')} className="shrink-0 rounded-lg p-1 text-muted hover:bg-base/5 hover:text-base">
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="hidden shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent sm:inline-flex">
                Smart add
              </span>
            )}
          </div>
          {stage === 'idle' && !text && (
            <div className="flex flex-wrap gap-2 px-4 pb-3 sm:px-5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setText(ex)
                    inputRef.current?.focus()
                  }}
                  className="rounded-full bg-base/5 px-3 py-1 text-xs font-medium text-base-muted transition-colors hover:bg-accent-soft hover:text-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
          {calc && stage === 'idle' && text.trim() && (
            <div className="flex items-center gap-2 border-t bg-warning-soft/50 px-4 py-2.5 sm:px-5">
              <Calculator className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium text-warning">
                = {money(calc.value)} <span className="opacity-70">·</span>
              </span>
              <button type="button" onClick={handleCalc} className="btn-secondary ml-auto !py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add {money(calc.value)} as Expense
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Review panel */}
      <AnimatePresence>
        {(stage === 'review' || stage === 'parsing' || stage === 'success') && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-soft"
          >
            {stage === 'parsing' && (
              <div className="flex items-center gap-3 px-5 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span className="text-sm text-base-muted">Analyzing &amp; categorizing…</span>
              </div>
            )}
            {stage === 'success' && (
              <div className="flex items-center gap-3 px-5 py-4 text-positive">
                <Check className="h-5 w-5" />
                <span className="text-sm font-semibold">Saved {results.length} transaction{results.length > 1 ? 's' : ''}. Finances updated.</span>
              </div>
            )}
            {stage === 'review' && (
              <div>
                <div className="border-b px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">
                      {results.length} transaction{results.length > 1 ? 's' : ''} detected
                    </span>
                    {errors.length > 0 && (
                      <span className="text-xs text-warning">{errors.length} line{errors.length > 1 ? 's' : ''} unparsed</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-base-muted">
                    {incomeTotal > 0 && <>Income {money(incomeTotal)}</>}
                    {incomeTotal > 0 && expenseTotal > 0 && <span className="mx-1">·</span>}
                    {expenseTotal > 0 && <>Expenses {money(expenseTotal)}</>}
                    <span className="mx-1">·</span>Total {money(total)}
                  </div>
                </div>
                <ul className="divide-y divide-line px-2">
                  {results.map((r, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', r.type === 'income' ? 'bg-positive-soft' : 'bg-negative-soft')}>
                        {r.type === 'income' ? <ArrowUpRight className="h-4 w-4 text-positive" /> : <ArrowDownRight className="h-4 w-4 text-negative" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{r.description}</div>
                        <div className="text-xs text-base-muted">
                          {r.category}
                          {r.subcategory ? ` → ${r.subcategory}` : ''}
                          {r.confidence < 0.6 && <span className="ml-1 text-warning">(uncertain)</span>}
                        </div>
                      </div>
                      <span className={cn('tabular text-sm font-bold', r.type === 'income' ? 'text-positive' : 'text-base')}>{money(r.amount)}</span>
                      <button onClick={() => setEditingIndex(i)} className="rounded-lg p-1.5 text-base-muted hover:bg-base/5" aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                {errors.length > 0 && (
                  <div className="border-t border-warning/30 bg-warning-soft/40 px-5 py-2.5">
                    {errors.map((e, i) => (
                      <div key={i} className="text-xs text-warning">
                        <span className="font-semibold">Line:</span> “{e.line}” — {e.reason}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                  <button onClick={() => setStage('idle')} className="btn-ghost !py-2 text-sm">
                    Cancel
                  </button>
                  <button onClick={confirmAll} className="btn-primary !py-2 text-sm">
                    <Check className="h-4 w-4" /> Add {results.length > 1 ? 'All' : 'Transaction'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {editingIndex !== null && (
        <EditParsedModal
          parsed={results[editingIndex]}
          onClose={() => setEditingIndex(null)}
          onSave={saveEdited}
        />
      )}
    </div>
  )
}

function EditParsedModal({ parsed, onClose, onSave }: { parsed: ParsedTransaction; onClose: () => void; onSave: (p: ParsedTransaction) => void }) {
  const { db } = useApp()
  const [form, setForm] = useState<ParsedTransaction>({ ...parsed })
  const parentCats = db.categories.filter((c) => !c.parentId && c.type === form.type)
  const subCats = db.categories.filter((c) => c.parentId === catIdByName(db.categories, form.category, form.type))

  function catIdByName(cats: typeof db.categories, name: string, type: 'income' | 'expense') {
    return cats.find((c) => c.name === name && !c.parentId && c.type === type)?.id
  }

  return (
    <Modal open onClose={onClose} title="Edit transaction" size="sm">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setForm({ ...form, type: 'expense' })} className={cn('btn', form.type === 'expense' ? 'bg-negative-soft text-negative' : 'bg-base/5 text-base-muted')}>Expense</button>
          <button onClick={() => setForm({ ...form, type: 'income' })} className={cn('btn', form.type === 'income' ? 'bg-positive-soft text-positive' : 'bg-base/5 text-base-muted')}>Income</button>
        </div>
        <div>
          <label className="label">Amount (₹)</label>
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Description</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: null })}
              className="input"
            >
              {parentCats.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Subcategory</label>
            <select value={form.subcategory || ''} onChange={(e) => setForm({ ...form, subcategory: e.target.value || null })} className="input">
              <option value="">None</option>
              {subCats.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" value={form.date || todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave(form)} className="btn-primary">Save</button>
      </div>
    </Modal>
  )
}
