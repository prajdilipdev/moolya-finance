import React, { useMemo, useRef, useState } from 'react'
import {
  Upload,
  Sparkles,
  Download,
  Trash2,
  Check,
  RefreshCw,
  Copy,
  FileText,
  FileSpreadsheet,
  Lock,
  Loader2,
  AlertTriangle,
  Building2,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { ParsedTransaction } from '@/lib/types'
import { parseBlock, looksLikeCSV } from '@/lib/parser'
import { parseExcelOrCsvStatement, parsePdfStatement } from '@/lib/bankParser'
import { money, todayISO, downloadFile } from '@/lib/format'
import { Badge, Segmented } from '@/components/ui/Misc'
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
  const { db, addParsedTransactions, updateProfile, cloudEnabled } = useApp()
  const { toast } = useToast()
  const [tab, setTab] = useState<'text' | 'bank'>('text')
  const [text, setText] = useState('')
  const [stage, setStage] = useState<'idle' | 'review' | 'done'>('idle')
  const [rows, setRows] = useState<ParsedTransaction[]>([])
  const [errors, setErrors] = useState<{ line: string; reason: string }[]>([])
  const [openingBalance, setOpeningBalance] = useState<number | null>(null)
  const [closingBalance, setClosingBalance] = useState<number | null>(null)
  const [skipDups, setSkipDups] = useState(true)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedDups, setSkippedDups] = useState(0)
  const [loading, setLoading] = useState(false)

  // PDF password state
  const [pendingPdfFile, setPendingPdfFile] = useState<ArrayBuffer | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [pdfPassword, setPdfPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const bankFileRef = useRef<HTMLInputElement>(null)

  const duplicateIds = useMemo(() => {
    const dedupeKey = (date: string, type: string, amount: number, desc: string): string => {
      const cleanDesc = (desc || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      return `${date}|${type}|${Math.round(amount * 100)}|${cleanDesc}`
    }
    const dbKeys = new Set(
      db.transactions.map((t) => dedupeKey(t.transactionDate, t.type, t.amount, t.description))
    )
    return rows.map((r) => dbKeys.has(dedupeKey(r.date || todayISO(), r.type, r.amount, r.description)))
  }, [rows, db.transactions])

  const totals = useMemo(() => {
    let income = 0,
      expenses = 0
    for (const r of rows) {
      if (r.type === 'income') income += r.amount
      else expenses += r.amount
    }
    return { income, expenses, net: income - expenses }
  }, [rows])

  // Opening + credits − debits should equal the statement's own closing
  // balance. A mismatch is the actual signal that a row was skipped or
  // misparsed — showing the two figures side by side without checking them
  // against each other (the previous behavior) meant that signal was
  // computed nowhere and a shortfall would go unnoticed.
  const reconciliation = useMemo(() => {
    if (openingBalance === null || closingBalance === null) return null
    const expected = Math.round((openingBalance + totals.income - totals.expenses) * 100) / 100
    const diff = Math.round((closingBalance - expected) * 100) / 100
    return { expected, diff, matches: Math.abs(diff) < 0.01 }
  }, [openingBalance, closingBalance, totals])

  const analyzeText = () => {
    const { parsed, errors: errs, openingBalance: opBal, closingBalance: clBal } = parseBlock(text, db)
    if (parsed.length === 0) {
      setErrors(errs)
      return
    }
    setRows(parsed)
    setErrors(errs)
    // Reset first — a paste with no balance columns shouldn't inherit
    // reconciliation figures left over from a previous import.
    setOpeningBalance(opBal ?? null)
    setClosingBalance(clBal ?? null)
    setStage('review')
  }

  const handleBankFile = async (file: File) => {
    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    const isExcel = /\.xlsx?$/i.test(file.name)
    const isCsv = /\.csv$/i.test(file.name)

    setLoading(true)
    setPasswordError(null)

    try {
      if (isPdf) {
        const buffer = await file.arrayBuffer()
        setPendingPdfFile(buffer)
        const res = await parsePdfStatement(buffer, null, db)
        if (res.requiresPassword) {
          setShowPasswordModal(true)
          setLoading(false)
          return
        }
        if (res.transactions.length > 0) {
          setRows(res.transactions)
          setOpeningBalance(res.openingBalance ?? null)
          setClosingBalance(res.closingBalance ?? null)
          setStage('review')
          toast({
            title: 'Statement parsed',
            message: `Extracted ${res.transactions.length} transactions from PDF`,
            tone: 'success',
          })
        } else {
          toast({
            title: 'No transactions found',
            message: 'Could not extract tabular transaction records from this PDF.',
            tone: 'warning',
          })
        }
      } else if (isExcel || isCsv) {
        const buffer = await file.arrayBuffer()
        const res = parseExcelOrCsvStatement(buffer, db)
        if (res.transactions.length > 0) {
          setRows(res.transactions)
          setOpeningBalance(res.openingBalance ?? null)
          setClosingBalance(res.closingBalance ?? null)
          setStage('review')
          toast({
            title: 'Statement parsed',
            message: `Extracted ${res.transactions.length} transactions from spreadsheet`,
            tone: 'success',
          })
        } else {
          toast({
            title: 'No transactions found',
            message: 'Could not detect table columns (Date, Narration, Debit/Credit).',
            tone: 'warning',
          })
        }
      }
    } catch (err: any) {
      toast({
        title: 'Error reading file',
        message: err?.message || 'Could not parse the bank statement file.',
        tone: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const submitPdfPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingPdfFile || !pdfPassword) return

    setLoading(true)
    setPasswordError(null)
    const res = await parsePdfStatement(pendingPdfFile, pdfPassword, db)

    if (res.requiresPassword) {
      setPasswordError('Incorrect password. Please try again.')
      setLoading(false)
      return
    }

    setShowPasswordModal(false)
    setPdfPassword('')

    if (res.transactions.length > 0) {
      setRows(res.transactions)
      setOpeningBalance(res.openingBalance ?? null)
      setClosingBalance(res.closingBalance ?? null)
      setStage('review')
      toast({
        title: 'PDF unlocked & parsed',
        message: `Extracted ${res.transactions.length} transactions successfully!`,
        tone: 'success',
      })
    } else {
      toast({
        title: 'No transactions detected',
        message: 'PDF was unlocked, but no transaction table rows were identified.',
        tone: 'warning',
      })
    }
    setLoading(false)
  }

  const updateRow = (i: number, patch: Partial<ParsedTransaction>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i))

  const importAll = () => {
    // Rows already flagged as duplicates by the review table are pre-filtered
    // here; addParsedTransactions runs its own independent dedupe check
    // against the live ledger too, so the true skipped count can be higher
    // than what the review table caught (e.g. an import run twice in a row).
    const toImport = rows.filter((_, i) => !(duplicateIds[i] && skipDups))
    const preFiltered = rows.length - toImport.length
    const { added, skipped } = addParsedTransactions(toImport, 'import')
    const totalSkipped = preFiltered + skipped

    if (openingBalance !== null && (!db.profile?.initialBalance || db.profile.initialBalance === 0)) {
      updateProfile({ initialBalance: openingBalance })
    }

    setImportedCount(added)
    setSkippedDups(totalSkipped)
    setStage('done')
    toast({
      title: 'Import completed',
      message: `${added} transaction${added === 1 ? '' : 's'} saved${cloudEnabled ? ' to your cloud database' : ''}${totalSkipped ? ` · ${totalSkipped} duplicate${totalSkipped === 1 ? '' : 's'} skipped` : ''}`,
      tone: added > 0 ? 'success' : 'warning',
    })
  }

  const downloadTemplate = () => {
    downloadFile(
      'import-template.csv',
      'date,type,amount,currency,description,category,subcategory,payment_method\n2026-08-16,expense,200,INR,Pav Bhaji,Food,Street Food,UPI\n2026-08-16,income,25000,INR,Salary,Income,Salary,Bank',
      'text/csv'
    )
  }

  const importTabs = [
    { value: 'text', label: 'Quick Text / Notes / CSV' },
    { value: 'bank', label: 'Bank Statement (PDF / Excel)' },
  ]

  const handleTextFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result || ''))
      setStage('idle')
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Import Transactions</h2>
          <p className="text-sm text-base-muted">
            Import statements from any Indian bank with auto-categorization and UPI cleaning
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="btn-secondary text-xs">
            <Download className="h-4 w-4" /> CSV Template
          </button>
        </div>
      </div>

      {stage !== 'done' && (
        <Segmented options={importTabs} value={tab} onChange={(v) => { setTab(v as 'bank' | 'text'); setStage('idle') }} />
      )}

      {/* Tab 1: Bank Statement Dropzone */}
      {stage !== 'done' && tab === 'bank' && (
        <div className="space-y-4">
          <div
            onClick={() => bankFileRef.current?.click()}
            className="card flex flex-col items-center justify-center border-dashed border-2 border-emerald-500/30 bg-emerald-500/[0.02] p-10 text-center cursor-pointer transition-all hover:border-accent hover:bg-emerald-500/[0.05]"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#050A07,#0F2B1D)] text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Building2 className="h-7 w-7" />}
            </div>
            <h3 className="text-base font-bold">Upload Bank Statement</h3>
            <p className="mt-1 text-sm text-base-muted max-w-md">
              Drag & drop or click to upload your <span className="font-semibold text-base">PDF, Excel (.xlsx, .xls), or CSV</span> statement.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg bg-card-muted px-2.5 py-1 text-xs font-medium text-base-muted">
                <FileText className="h-3.5 w-3.5 text-accent" /> PDF (Protected & Regular)
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-card-muted px-2.5 py-1 text-xs font-medium text-base-muted">
                <FileSpreadsheet className="h-3.5 w-3.5 text-accent" /> Excel &amp; CSV
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-card-muted px-2.5 py-1 text-xs font-medium text-base-muted">
                <Sparkles className="h-3.5 w-3.5 text-accent" /> Auto UPI Cleaning
              </span>
            </div>
            <input
              ref={bankFileRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleBankFile(e.target.files[0])}
            />
          </div>

          <div className="card p-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-base-muted mb-2">Supported Banks</h4>
            <p className="text-xs text-base-muted leading-relaxed">
              HDFC Bank, State Bank of India (SBI), ICICI Bank, Axis Bank, Kotak Mahindra, Bank of Baroda, Punjab National Bank, Standard Chartered, and all standard Indian UPI/NEFT statement formats.
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Free Text / Notes Parser */}
      {stage !== 'done' && tab === 'text' && (
        <div className="card p-5">
          <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-base-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> Paste your notes or SMS
          </label>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setStage('idle')
            }}
            rows={8}
            placeholder={'200rs pav bhaji\n30rs pani poori\n- 500rs petrol\n+ 25000rs salary\n16/08/2026 - 1200rs electricity bill #Bills @UPI\n+ 2k cashback #Income/Cashback'}
            className="input font-mono text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setText(SAMPLE)
                  setStage('idle')
                }}
                className="btn-ghost text-xs"
              >
                <Copy className="h-3.5 w-3.5" /> Use sample
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn-ghost text-xs"
              >
                <Upload className="h-3.5 w-3.5" /> Upload .txt / .csv
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleTextFile(e.target.files[0])}
              />
              {looksLikeCSV(text) && <Badge tone="accent">CSV detected</Badge>}
            </div>
            <button onClick={analyzeText} className="btn-primary">
              <Sparkles className="h-4 w-4" /> Analyze &amp; preview
            </button>
          </div>
          {errors.length > 0 && stage === 'idle' && text.trim() && (
            <div className="mt-3 rounded-xl bg-warning-soft/60 p-3 text-sm text-warning">
              {errors.map((e, i) => (
                <div key={i}>Line “{e.line}” — {e.reason}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stage: Review Table */}
      {stage === 'review' && (
        <div className="card overflow-hidden">
          <div className="border-b px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{rows.length} transaction{rows.length > 1 ? 's' : ''} detected</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-base-muted">
                  {openingBalance !== null && (
                    <span>
                      Opening Balance <span className="font-semibold text-base">{money(openingBalance)}</span>
                    </span>
                  )}
                  {openingBalance !== null && <span>·</span>}
                  <span>
                    Income <span className="font-semibold text-positive">+{money(totals.income)}</span>
                  </span>
                  <span>·</span>
                  <span>
                    Expenses <span className="font-semibold text-negative">−{money(totals.expenses)}</span>
                  </span>
                  <span>·</span>
                  <span>
                    {closingBalance !== null ? (
                      <>
                        Statement Closing Balance <span className="font-bold text-emerald-400">{money(closingBalance)}</span>
                      </>
                    ) : (
                      <>
                        Net{' '}
                        <span className={cn('font-semibold', totals.net >= 0 ? 'text-positive' : 'text-negative')}>
                          {money(totals.net)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                {reconciliation && !reconciliation.matches && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-warning-soft/60 px-3 py-2 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Doesn't reconcile: opening balance + income − expenses works out to {money(reconciliation.expected)}, but
                      the statement's own closing balance is {money(closingBalance!)} — a difference of {money(Math.abs(reconciliation.diff))}.
                      Some rows may have been skipped or misread; check the table below before importing.
                    </span>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-base-muted">
                <input
                  type="checkbox"
                  checked={skipDups}
                  onChange={(e) => setSkipDups(e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-500"
                />
                Skip duplicates automatically
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b bg-base/5 text-left text-[11px] font-semibold uppercase tracking-wide text-base-muted">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5">Description (Cleaned)</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Payment</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const dup = duplicateIds[i]
                  return (
                    <tr key={i} className="hover:bg-base/5">
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={r.date || todayISO()}
                          onChange={(e) => updateRow(i, { date: e.target.value })}
                          className="input !py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.type}
                          onChange={(e) => {
                            const newType = e.target.value as 'income' | 'expense'
                            const defaultCat =
                              db.categories.find((c) => !c.parentId && c.type === newType)?.name ||
                              (newType === 'income' ? 'Income' : 'Other')
                            updateRow(i, { type: newType, category: defaultCat, subcategory: null })
                          }}
                          className={cn(
                            'input !w-auto !py-1 text-xs font-semibold',
                            r.type === 'income' ? 'text-positive' : 'text-negative'
                          )}
                        >
                          <option value="expense">Expense (Debit)</option>
                          <option value="income">Income (Credit)</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={r.amount}
                          onChange={(e) => updateRow(i, { amount: +e.target.value })}
                          className="input !w-24 !py-1 text-xs tabular"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.description}
                          onChange={(e) => updateRow(i, { description: e.target.value })}
                          className="input !py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.category}
                          onChange={(e) => updateRow(i, { category: e.target.value, subcategory: null })}
                          className="input !w-auto !py-1 text-xs"
                        >
                          {db.categories
                            .filter((c) => !c.parentId && c.type === r.type)
                            .map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.paymentMethod || ''}
                          onChange={(e) => updateRow(i, { paymentMethod: e.target.value || null })}
                          className="input !w-auto !py-1 text-xs"
                        >
                          <option value="">None</option>
                          {db.paymentMethods.map((p) => (
                            <option key={p.id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {dup ? (
                          <Badge tone="warning">Duplicate</Badge>
                        ) : (
                          <Badge tone="positive">
                            <Check className="h-3 w-3" /> Ready
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeRow(i)}
                          className="rounded-lg p-1 text-base-muted hover:bg-negative-soft hover:text-negative"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
            <button onClick={() => setStage('idle')} className="btn-ghost">
              Back
            </button>
            <button onClick={importAll} className="btn-primary">
              <Check className="h-4 w-4" /> Import {rows.length} transaction{rows.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Stage: Done Screen */}
      {stage === 'done' && (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-positive-soft">
            <Check className="h-8 w-8 text-positive" />
          </div>
          <h3 className="text-xl font-bold">Statement imported successfully!</h3>
          <p className="mt-2 text-sm text-base-muted">
            {importedCount} transactions saved{cloudEnabled ? ' to your cloud database' : ''} · Income {money(totals.income)} · Expenses{' '}
            {money(totals.expenses)} · Net {money(totals.net)}
          </p>
          {skippedDups > 0 && (
            <p className="mt-1 text-xs text-warning">{skippedDups} duplicate{skippedDups > 1 ? 's' : ''} skipped</p>
          )}
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => {
                setStage('idle')
                setText('')
                setRows([])
                setOpeningBalance(null)
                setClosingBalance(null)
              }}
              className="btn-secondary"
            >
              <RefreshCw className="h-4 w-4" /> Import another statement
            </button>
          </div>
        </div>
      )}

      {/* Password Modal for Protected Bank PDFs */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-accent">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">PDF is Password-Protected</h3>
                <p className="text-xs text-base-muted">Your bank locked this statement</p>
              </div>
            </div>

            <p className="text-xs text-base-muted">
              Most Indian banks use your <span className="font-semibold text-base">Date of Birth (DDMMYYYY)</span> or{' '}
              <span className="font-semibold text-base">PAN number</span> as the password. Decryption happens 100% in your browser.
            </p>

            <form onSubmit={submitPdfPassword} className="space-y-3">
              <input
                type="password"
                required
                autoFocus
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                placeholder="Enter statement password"
                className="input"
              />

              {passwordError && (
                <div className="flex items-center gap-1.5 text-xs text-negative">
                  <AlertTriangle className="h-3.5 w-3.5" /> {passwordError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false)
                    setPdfPassword('')
                  }}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn-primary text-xs">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />} Unlock &amp; Parse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
