import React, { useMemo, useRef, useState } from 'react'
import { Upload, Sparkles, Download, Trash2, Check, RefreshCw, Copy } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { ParsedTransaction } from '@/lib/types'
import { parseBlock, looksLikeCSV } from '@/lib/parser'
import { money, todayISO, downloadFile, formatDateShort } from '@/lib/format'
import { Badge, Field } from '@/components/ui/Misc'
import { cn } from '@/lib/utils'

const SAMPLE = `August 16

- 200rs pav bhaji
- 30rs pani poori
- 500rs petrol
- 1200rs electricity bill
- 150rs chai
+ 25000rs salary
+ 5000rs freelance payment

Or use marks & categories:
- 40rs charger cable #Shopping/Electronics @UPI
+ 2k cashback #Income/Cashback`

export function Import() {
  const { db, addParsedTransactions } = useApp()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [stage, setStage] = useState<'idle' | 'review' | 'done'>('idle')
  const [rows, setRows] = useState<ParsedTransaction[]>([])
  const [errors, setErrors] = useState<{ line: string; reason: string }[]>([])
  const [skipDups, setSkipDups] = useState(true)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedDups, setSkippedDups] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const contextDate = todayISO()

  const duplicateIds = useMemo(() => {
    const key = (p: ParsedTransaction) => `${p.date}|${p.type}|${p.amount}|${(p.description || '').toLowerCase().trim()}`
    const dbKeys = new Set(db.transactions.map((t) => `${t.transactionDate}|${t.type}|${t.amount}|${t.description.toLowerCase().trim()}`))
    return rows.map((r) => dbKeys.has(key(r)))
  }, [rows, db.transactions])

  const totals = useMemo(() => {
    let income = 0, expenses = 0
    for (const r of rows) {
      if (r.type === 'income') income += r.amount
      else expenses += r.amount
    }
    return { income, expenses, net: income - expenses }
  }, [rows])

  const analyze = () => {
    const { parsed, errors: errs } = parseBlock(text, db)
    if (parsed.length === 0) {
      setErrors(errs)
      return
    }
    setRows(parsed)
    setErrors(errs)
    setStage('review')
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result || ''))
      setStage('idle')
    }
    reader.readAsText(file)
  }

  const updateRow = (i: number, patch: Partial<ParsedTransaction>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i))

  const importAll = () => {
    const toImport = rows.filter((_, i) => !(duplicateIds[i] && skipDups))
    const dup = rows.length - toImport.length
    addParsedTransactions(toImport, 'import')
    const count = toImport.length
    setImportedCount(count)
    setSkippedDups(dup)
    setStage('done')
    toast({
      title: 'Import completed',
      message: `${count} transactions added${dup ? ` · ${dup} duplicates skipped` : ''}`,
      tone: 'success',
    })
  }

  const downloadTemplate = () => {
    downloadFile('import-template.csv', 'date,type,amount,currency,description,category,subcategory,payment_method\n2026-08-16,expense,200,INR,Pav Bhaji,Food,Street Food,UPI\n2026-08-16,income,25000,INR,Salary,Income,Salary,Bank', 'text/csv')
  }

  const catLabel = (name: string) => name || '—'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Bulk Import</h2>
          <p className="text-sm text-base-muted">Paste one transaction per line — Quick Add understands all formats</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="btn-secondary text-xs"><Download className="h-4 w-4" /> Template</button>
          <button onClick={() => fileRef.current?.click()} className="btn-secondary text-xs"><Upload className="h-4 w-4" /> Upload file</button>
          <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      </div>

      {stage !== 'done' && (
        <div className="card p-5">
          <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-base-muted"><Sparkles className="h-3.5 w-3.5 text-accent" /> Paste your data</label>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setStage('idle') }}
            rows={10}
            placeholder={'200rs pav bhaji\n30rs pani poori\n- 500rs petrol\n+ 25000rs salary\n16/08/2026 - 1200rs electricity bill #Bills @UPI\n+ 2k cashback #Income/Cashback'}
            className="input font-mono text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button onClick={() => { setText(SAMPLE); setStage('idle') }} className="btn-ghost text-xs"><Copy className="h-3.5 w-3.5" /> Use sample</button>
              {looksLikeCSV(text) && <Badge tone="accent">CSV detected</Badge>}
            </div>
            <button onClick={analyze} className="btn-primary"><Sparkles className="h-4 w-4" /> Analyze &amp; preview</button>
          </div>
          {errors.length > 0 && stage === 'idle' && text.trim() && (
            <div className="mt-3 rounded-xl bg-warning-soft/60 p-3 text-sm text-warning">
              {errors.map((e, i) => <div key={i}>Line “{e.line}” — {e.reason}</div>)}
            </div>
          )}
        </div>
      )}

      {stage === 'review' && (
        <div className="card overflow-hidden">
          <div className="border-b px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{rows.length} transaction{rows.length > 1 ? 's' : ''} detected</h3>
                <p className="mt-1 text-sm text-base-muted">
                  Income {money(totals.income)} · Expenses {money(totals.expenses)} · Net <span className={cn('font-semibold', totals.net >= 0 ? 'text-positive' : 'text-negative')}>{money(totals.net)}</span>
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-base-muted">
                <input type="checkbox" checked={skipDups} onChange={(e) => setSkipDups(e.target.checked)} className="h-4 w-4" />
                Skip duplicates automatically
              </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-base/5 text-left text-[11px] font-semibold uppercase tracking-wide text-base-muted">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const dup = duplicateIds[i]
                  return (
                    <tr key={i} className="hover:bg-base/5">
                      <td className="px-3 py-2"><input type="date" value={r.date || todayISO()} onChange={(e) => updateRow(i, { date: e.target.value })} className="input !py-1 text-xs" /></td>
                      <td className="px-3 py-2">
                        <select value={r.type} onChange={(e) => updateRow(i, { type: e.target.value as 'income' | 'expense' })} className={cn('input !w-auto !py-1 text-xs font-semibold', r.type === 'income' ? 'text-positive' : 'text-negative')}>
                          <option value="expense">Expense</option><option value="income">Income</option>
                        </select>
                      </td>
                      <td className="px-3 py-2"><input type="number" min={0} value={r.amount} onChange={(e) => updateRow(i, { amount: +e.target.value })} className="input !w-24 !py-1 text-xs tabular" /></td>
                      <td className="px-3 py-2"><input value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} className="input !py-1 text-xs" /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <select value={r.category} onChange={(e) => updateRow(i, { category: e.target.value, subcategory: null })} className="input !w-auto !py-1 text-xs">
                            {db.categories.filter((c) => !c.parentId && c.type === r.type).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select value={r.paymentMethod || ''} onChange={(e) => updateRow(i, { paymentMethod: e.target.value || null })} className="input !w-auto !py-1 text-xs">
                          <option value="">None</option>
                          {db.paymentMethods.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">{dup ? <Badge tone="warning">Duplicate</Badge> : <Badge tone="positive"><Check className="h-3 w-3" /> Ready</Badge>}</td>
                      <td className="px-3 py-2"><button onClick={() => removeRow(i)} className="rounded-lg p-1 text-base-muted hover:bg-negative-soft hover:text-negative"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
            <button onClick={() => setStage('idle')} className="btn-ghost">Back</button>
            <button onClick={importAll} className="btn-primary"><Check className="h-4 w-4" /> Import {rows.length} transaction{rows.length > 1 ? 's' : ''}</button>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-positive-soft">
            <Check className="h-8 w-8 text-positive" />
          </div>
          <h3 className="text-xl font-bold">Import completed</h3>
          <p className="mt-2 text-sm text-base-muted">{importedCount} transactions added · Income {money(totals.income)} · Expenses {money(totals.expenses)} · Net {money(totals.net)}</p>
          {skippedDups > 0 && <p className="mt-1 text-xs text-warning">{skippedDups} duplicate{skippedDups > 1 ? 's' : ''} skipped</p>}
          <div className="mt-5 flex gap-2">
            <button onClick={() => { setStage('idle'); setText(''); setRows([]) }} className="btn-secondary"><RefreshCw className="h-4 w-4" /> Import more</button>
          </div>
        </div>
      )}
    </div>
  )
}
