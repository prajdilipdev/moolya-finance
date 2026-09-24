import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Loader2, Check, X, Calculator, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { parseBlock, parseLine, tryCalculator } from '@/lib/parser'
import { isAIAvailable, parseWithAI } from '@/lib/ai'
import { ParsedTransaction, TransactionType } from '@/lib/types'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

const EXAMPLES = ['200rs pav bhaji', '25k salary', '500 petrol', '30rs pani poori']

type Mode = 'auto' | TransactionType

/**
 * When the user explicitly picks Expense or Income, that choice wins over
 * anything the text suggests. A category from the other side (e.g. "gift"
 * guessed as Income/Gifts while Expense is selected) no longer fits, so it
 * falls back to that side's catch-all.
 */
/**
 * Free models occasionally invent a label ("70rs sandwich" → "Sandip purchase").
 * If the AI description shares no word with what was typed, keep the local
 * parser's description — the category and amount from the AI still apply.
 */
function keepUserWording(ai: ParsedTransaction[], local: ParsedTransaction[]): ParsedTransaction[] {
  if (ai.length !== local.length) return ai
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? [])
  return ai.map((p, i) => {
    const typed = words(local[i].description)
    const overlap = [...words(p.description)].some((w) => [...typed].some((t) => t.startsWith(w.slice(0, 4)) || w.startsWith(t.slice(0, 4))))
    return overlap || typed.size === 0 ? p : { ...p, description: local[i].description }
  })
}

function applyMode(p: ParsedTransaction, mode: Mode): ParsedTransaction {
  if (mode === 'auto') return p
  if (mode === 'expense' && p.category === 'Income') return { ...p, type: 'expense', category: 'Other', subcategory: null }
  if (mode === 'income' && p.category !== 'Income') return { ...p, type: 'income', category: 'Income', subcategory: 'Other Income' }
  return { ...p, type: mode }
}

export function QuickAdd({
  autoFocus = false,
  onDone,
  defaultType,
}: {
  autoFocus?: boolean
  onDone?: () => void
  /** What to assume when typed text has no explicit income/expense signal — e.g. opened from the Income page. */
  defaultType?: TransactionType
}) {
  const { db, addParsedTransactions } = useApp()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>(defaultType ?? 'auto')
  const [stage, setStage] = useState<'idle' | 'parsing' | 'success'>('idle')
  const [savedCount, setSavedCount] = useState(0)
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
        setSavedCount(0)
        setErrors([])
        onDone?.()
      }, onDone ? 600 : 1200)
      return () => clearTimeout(t)
    }
  }, [stage, onDone])

  const executeSave = (toSave: ParsedTransaction[]) => {
    const { added, skipped } = addParsedTransactions(toSave, 'quick_entry')

    if (added === 0) {
      // Everything in this batch already existed — nothing was actually saved.
      setStage('idle')
      toast({
        title: skipped > 1 ? 'Already added' : 'Already added',
        message: `${skipped > 1 ? 'These transactions match' : 'This matches'} something already in your ledger for the same date, amount and description.`,
        tone: 'warning',
      })
      return
    }

    const inc = toSave.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0)
    const exp = toSave.filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0)
    const last = toSave[toSave.length - 1]
    // Instant-save skips the review step, so a badly-guessed amount/category
    // now writes straight to the ledger with nothing to catch it. Since this
    // is only ever called with what's about to be (or was just) saved, flag
    // it here rather than saving it silently.
    const uncertain = toSave.some((p) => p.confidence < 0.6)

    toast({
      title: added > 1 ? `${added} transactions added!` : `${last?.type === 'income' ? 'Income' : 'Expense'} added!`,
      message:
        added > 1
          ? `Income ${money(inc)} · Expenses ${money(exp)}${skipped ? ` · ${skipped} duplicate${skipped > 1 ? 's' : ''} skipped` : ''}${uncertain ? ' · Wasn’t fully sure — check Transactions' : ''}`
          : uncertain
            ? `Wasn't fully sure about this one — ${money(last?.amount || 0)} · ${last?.description || ''} (${last?.category || 'Other'}). Check Transactions if that's wrong.`
            : `${money(last?.amount || 0)} · ${last?.description || ''} (${last?.category || 'Other'})`,
      tone: uncertain ? 'warning' : 'success',
    })
    setSavedCount(added)
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

    const forced = mode === 'auto' ? undefined : mode
    const local = parseBlock(text, db, undefined, forced ?? defaultType)
    const errs = local.errors
    const parsed = local.parsed.map((p) => applyMode(p, mode))
    // Low confidence includes anything the keyword rules couldn't place
    // ("Other"), so unknown items like "dabeli" get categorised by the AI.
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
      const ai = await parseWithAI(text, db.categories, forced)
      if (ai && ai.length > 0) {
        executeSave(keepUserWording(ai, parsed).map((p) => applyMode(p, mode)))
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
      executeSave(parsed)
      return
    }
  }

  const handleCalc = () => {
    if (!calc) return
    const parsed = parseLine(`${calc.value}rs`, { categories: db.categories, rules: db.userCategoryRules, defaultType: mode === 'auto' ? defaultType : mode })
    if (!parsed) return
    const toSave = [applyMode({ ...parsed, description: `Calc: ${calc.expression}`, category: 'Other', subcategory: null }, mode)]
    executeSave(toSave)
  }

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-2">
        <div role="radiogroup" aria-label="Transaction type" className="inline-flex rounded-full border bg-card p-0.5">
          {([
            ['auto', 'Auto', Sparkles, 'text-accent'],
            ['expense', 'Expense', ArrowDownRight, 'text-negative'],
            ['income', 'Income', ArrowUpRight, 'text-positive'],
          ] as const).map(([value, label, Icon, tone]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => {
                setMode(value)
                inputRef.current?.focus()
              }}
              className={cn(
                'inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
                mode === value ? 'bg-base/10 text-[hsl(var(--base))]' : 'text-base-muted hover:text-[hsl(var(--base))]'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', mode === value ? tone : '')} />
              {label}
            </button>
          ))}
        </div>
        <span className="hidden text-[11px] text-base-muted sm:inline">
          {mode === 'auto' ? 'Detects income or expense from what you type' : `Everything you add goes to ${mode === 'income' ? 'Income' : 'Expenses'}`}
        </span>
      </div>
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
              placeholder={mode === 'income' ? 'What did you earn? (e.g. 25k salary)' : mode === 'expense' ? 'What did you spend on? (e.g. 20rs pani poori)' : 'What did you spend or earn? (e.g. 200rs pav bhaji)'}
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
                <Plus className="h-3.5 w-3.5" /> Add {money(calc.value)} as {mode === 'income' ? 'Income' : 'Expense'}
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
                  Saved {savedCount} transaction{savedCount > 1 ? 's' : ''}! Available Balance updated.
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
