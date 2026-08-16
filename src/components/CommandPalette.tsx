import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Wallet, PieChart, Target, Upload, Settings, Download, ArrowRight, List } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { money, formatDateShort } from '@/lib/format'
import { Icon } from './ui/Icon'
import { categoryColor } from '@/lib/categories'
import { cn } from '@/lib/utils'

const COMMANDS = [
  { id: 'addexpense', label: 'Add expense', icon: Plus, hint: 'Go to dashboard & use Quick Add', to: '/' },
  { id: 'addincome', label: 'Add income', icon: Plus, hint: 'Go to dashboard & use Quick Add', to: '/' },
  { id: 'budgets', label: 'Open budgets', icon: Wallet, to: '/budgets' },
  { id: 'analytics', label: 'Open analytics', icon: PieChart, to: '/analytics' },
  { id: 'goal', label: 'Create a goal', icon: Target, to: '/goals' },
  { id: 'import', label: 'Import transactions', icon: Upload, to: '/import' },
  { id: 'export', label: 'Export / backup data', icon: Download, to: '/settings' },
  { id: 'settings', label: 'Open settings', icon: Settings, to: '/settings' },
]

export function CommandPalette({
  open,
  onClose,
  onOpenQuickAdd,
}: {
  open: boolean
  onClose: () => void
  onOpenQuickAdd?: () => void
}) {
  const { db } = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState('')

  useEffect(() => {
    if (open) setQ('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const filteredTxs = useMemo(() => {
    const query = q.toLowerCase().trim()
    if (!query) return []
    return db.transactions.filter((t) => t.description.toLowerCase().includes(query)).slice(0, 6)
  }, [q, db.transactions])

  const go = (cmdId: string, to: string) => {
    onClose()
    if ((cmdId === 'addexpense' || cmdId === 'addincome') && onOpenQuickAdd) {
      onOpenQuickAdd()
    } else {
      nav(to)
    }
  }

  const filteredCommands = COMMANDS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-2xl"
            initial={{ y: -10, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0, scale: 0.98 }}
          >
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Search className="h-5 w-5 text-base-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search transactions or type a command…"
                className="w-full bg-transparent text-base focus:outline-none placeholder:text-base-muted/60"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {filteredTxs.length > 0 && (
                <div className="mb-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-base-muted">Transactions</div>
              )}
              {filteredTxs.map((t) => {
                const cat = db.categories.find((c) => c.id === t.categoryId)
                return (
                  <button
                    key={t.id}
                    onClick={() => go('tx', '/transactions')}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-base/5"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ backgroundColor: categoryColor(cat?.name) + '1A', color: categoryColor(cat?.name) }}>
                      <Icon name={cat?.icon || 'Tag'} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t.description}</span>
                      <span className="block text-xs text-base-muted">{cat?.name} · {formatDateShort(t.transactionDate)}</span>
                    </span>
                    <span className={cn('tabular text-sm font-bold', t.type === 'income' ? 'text-positive' : 'text-base')}>{money(t.amount)}</span>
                  </button>
                )
              })}
              <div className={cn('mb-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-base-muted', filteredTxs.length > 0 && 'mt-2')}>
                Commands
              </div>
              {filteredCommands.map((c) => (
                <button key={c.id} onClick={() => go(c.id, c.to)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-base/5">
                  <c.icon className="h-4 w-4 text-base-muted" />
                  <span className="flex-1 text-sm font-medium">{c.label}</span>
                  <ArrowRight className="h-4 w-4 text-base-muted/50" />
                </button>
              ))}
              {filteredTxs.length === 0 && filteredCommands.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-base-muted">No results for “{q}”</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
