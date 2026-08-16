import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Loader2, Check, X, Calculator, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { parseBlock, parseLine, tryCalculator } from '@/lib/parser'
import { isAIAvailable, parseWithAI } from '@/lib/ai'
import { ParsedTransaction } from '@/lib/types'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

const EXAMPLES = ['200rs pav bhaji', '25k salary', '500 petrol', '30rs pani poori']

export function QuickAdd({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { db, addParsedTransactions } = useApp()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [stage, setStage] = useState<'idle' | 'parsing' | 'success'>('idle')
  const [results, setResults] = useState<ParsedTransaction[]>([])
  const [errors, setErrors] = useState<{ line: string; reason: string }[]>([])
  const [errorFlash, setErrorFlash] = useState(false)
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
      }, onDone ? 600 : 1200)
      return () => clearTimeout(t)
    }
  }, [stage, onDone])

  const executeSave = (toSave: ParsedTransaction[]) => {
    addParsedTransactions(toSave, 'quick_entry')
    const inc = toSave.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0)
    const exp = toSave.filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0)
    const last = toSave[toSave.length - 1]

    toast({
      title:
        toSave.length > 1
          ? `${toSave.length} transactions added!`
          : `${last?.type === 'income' ? 'Income' : 'Expense'} added!`,
      message:
        toSave.length > 1
          ? `Income ${money(inc)} · Expenses ${money(exp)}`
          : `${money(last?.amount || 0)} · ${last?.description || ''} (${last?.category || 'Other'})`,
      tone: 'success',
    })
    setStage('success')
  }

  /**
   * The local parser runs first and handles every documented format instantly
   * and offline. AI is only consulted when it can actually add something.
   * Directly saves on Enter for frictionless 1-click addition.
   */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || stage === 'parsing') return

    const { parsed, errors: errs } = parseBlock(text, db)
    const lowConfidence = parsed.length > 0 && parsed.every((p) => p.confidence < 0.6)
    const worthAsking = isAIAvailable() && (parsed.length === 0 || lowConfidence)

    if (parsed.length === 0 && !worthAsking) {
      setErrorFlash(true)
      setErrors(errs)
      setTimeout(() => setErrorFlash(false), 600)
      return
    }

    setErrors(errs)
    setStage('parsing')

    if (worthAsking) {
      const ai = await parseWithAI(text, db.categories)
      if (ai && ai.length > 0) {
        setResults(ai)
        executeSave(ai)
        return
      }
      if (parsed.length === 0) {
        // AI unavailable or unhelpful, and the local parser found nothing either.
        setStage('idle')
        setErrorFlash(true)
        setErrors(errs)
        setTimeout(() => setErrorFlash(false), 600)
        return
      }
    }

    if (parsed.length > 0) {
      setResults(parsed)
      executeSave(parsed)
      return
    }
  }

  const handleCalc = () => {
    if (!calc) return
    const parsed = parseLine(`${calc.value}rs`, { categories: db.categories, rules: db.userCategoryRules })
    if (!parsed) return
    const toSave = [{ ...parsed, description: `Calc: ${calc.expression}`, category: 'Other', subcategory: null }]
    setResults(toSave)
    executeSave(toSave)
  }

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
                if (stage === 'success') setStage('idle')
              }}
              placeholder={'What did you spend or earn? (e.g. 200rs pav bhaji)'}
              className="w-full bg-transparent text-[15px] font-medium placeholder:text-muted/70 focus:outline-none"
              aria-label="Quick add transaction"
              autoComplete="off"
            />
            {text ? (
              <>
                <kbd className="hidden shrink-0 rounded-md border bg-card-muted px-2 py-1 text-[10px] font-semibold text-muted sm:inline-flex">
                  Enter ↵ to Add
                </kbd>
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="shrink-0 rounded-lg p-1 text-muted hover:bg-base/5 hover:text-base"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="hidden shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent sm:inline-flex">
                Instant Add
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

      {/* Immediate parsing & success status banner */}
      <AnimatePresence>
        {(stage === 'parsing' || stage === 'success') && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-soft"
          >
            {stage === 'parsing' && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span className="text-sm text-base-muted font-medium">Adding transaction…</span>
              </div>
            )}
            {stage === 'success' && (
              <div className="flex items-center gap-3 px-5 py-3.5 text-positive font-semibold text-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-positive-soft text-positive">
                  <Check className="h-4 w-4" />
                </div>
                <span>
                  Saved {results.length} transaction{results.length > 1 ? 's' : ''}! Available Balance updated.
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
