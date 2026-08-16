import React from 'react'
import { Transaction, DB } from '@/lib/types'
import { money, formatDateShort } from '@/lib/format'
import { Icon } from './ui/Icon'
import { categoryColorPair } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Trash2, Pencil } from 'lucide-react'

export function TransactionRow({
  t,
  db,
  onEdit,
  onDelete,
  selected,
  onSelect,
  compact = false,
}: {
  t: Transaction
  db: DB
  onEdit?: (t: Transaction) => void
  onDelete?: (t: Transaction) => void
  selected?: boolean
  onSelect?: (id: string, checked: boolean) => void
  compact?: boolean
}) {
  const cat = db.categories.find((c) => c.id === t.categoryId)
  const sub = t.subcategoryId ? db.categories.find((c) => c.id === t.subcategoryId) : null
  const col = categoryColorPair(cat?.name)

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-base/5',
        selected && 'bg-accent-soft/40'
      )}
    >
      {onSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => onSelect(t.id, e.target.checked)}
          className="h-4 w-4 rounded border-base-muted accent-emerald-500"
          aria-label={`Select ${t.description}`}
        />
      )}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
        style={{ backgroundColor: col.soft, color: col.hex }}
      >
        <Icon name={cat?.icon || 'Tag'} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{t.description}</span>
          {compact && t.type === 'income' ? (
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-positive" />
          ) : compact ? (
            <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-negative" />
          ) : null}
        </div>
        <div className="truncate text-xs text-base-muted">
          {cat?.name}
          {sub && sub.name !== cat?.name ? ` → ${sub.name}` : ''}
          <span className="mx-1">·</span>
          {formatDateShort(t.transactionDate)}
        </div>
      </div>
      <span className={cn('tabular shrink-0 text-sm font-bold', t.type === 'income' ? 'text-positive' : 'text-base')}>
        {t.type === 'income' ? '+' : '−'}
        {money(t.amount, t.currency)}
      </span>
      {(onEdit || onDelete) && (
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(t)}
              className="rounded-lg p-1.5 text-base-muted hover:bg-base/10 hover:text-base"
              aria-label="Edit transaction"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(t)}
              className="rounded-lg p-1.5 text-base-muted hover:bg-negative-soft hover:text-negative transition-colors"
              aria-label="Delete transaction"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
