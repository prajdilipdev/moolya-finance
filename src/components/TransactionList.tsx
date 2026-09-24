import React, { useRef } from 'react'
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
  selectionActive = false,
}: {
  t: Transaction
  db: DB
  onEdit?: (t: Transaction) => void
  onDelete?: (t: Transaction) => void
  selected?: boolean
  onSelect?: (id: string, checked: boolean) => void
  compact?: boolean
  /** Some row is selected — on phones, taps then toggle selection instead of opening edit. */
  selectionActive?: boolean
}) {
  const cat = db.categories.find((c) => c.id === t.categoryId)
  const sub = t.subcategoryId ? db.categories.find((c) => c.id === t.subcategoryId) : null
  const col = categoryColorPair(cat?.name)

  // Phones: tap = edit (or toggle while selecting), long-press = start selecting.
  // Desktop keeps the explicit checkbox and hover buttons.
  const isPhone = () => window.matchMedia('(max-width: 639px)').matches
  const pressTimer = useRef<number>()
  const longPressed = useRef(false)
  const startPress = () => {
    if (!onSelect || !isPhone()) return
    longPressed.current = false
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      navigator.vibrate?.(15)
      onSelect(t.id, !selected)
    }, 450)
  }
  const cancelPress = () => window.clearTimeout(pressTimer.current)
  const handleTap = (e: React.MouseEvent) => {
    if (!isPhone() || (e.target as HTMLElement).closest('button, input, a')) return
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (selectionActive && onSelect) onSelect(t.id, !selected)
    else onEdit?.(t)
  }
  const tappable = !!(onEdit || onSelect)

  return (
    <div
      onClick={tappable ? handleTap : undefined}
      onPointerDown={tappable ? startPress : undefined}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => onSelect && isPhone() && e.preventDefault()}
      className={cn(
        'group flex select-none items-center gap-3 px-3.5 py-3 transition-colors sm:select-auto sm:px-3 sm:py-2.5 sm:hover:bg-base/5',
        tappable && 'cursor-pointer active:bg-base/[0.06] sm:cursor-auto sm:active:bg-transparent',
        selected && 'bg-accent-soft/50'
      )}
    >
      {onSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => onSelect(t.id, e.target.checked)}
          className={cn('h-5 w-5 shrink-0 rounded border-base-muted accent-emerald-600 sm:block sm:h-4 sm:w-4', selectionActive ? 'block' : 'hidden')}
          aria-label={`Select ${t.description}`}
        />
      )}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] sm:h-9 sm:w-9 sm:rounded-[11px]"
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
      <span className={cn('tabular shrink-0 text-[15px] font-bold sm:text-sm', t.type === 'income' ? 'text-positive' : 'text-[hsl(var(--base))]')}>
        {t.type === 'income' ? '+' : '−'}
        {money(t.amount, t.currency)}
      </span>
      {(onEdit || onDelete) && (
        // Hover-reveal only kicks in at sm: and up (mouse-capable screens).
        // There's no persistent :hover on touch, so gating this on
        // group-hover from the base breakpoint made these buttons
        // effectively undiscoverable on a phone — always visible below sm.
        // Phones use tap-to-edit instead; desktop reveals these on hover/focus.
        <div className="hidden items-center gap-1 transition-opacity sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(t)}
              className="rounded-lg p-2 text-base-muted hover:bg-base/10 hover:text-base sm:p-1.5"
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
              className="rounded-lg p-2 text-base-muted hover:bg-negative-soft hover:text-negative transition-colors sm:p-1.5"
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
