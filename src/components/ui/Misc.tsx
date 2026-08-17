import React from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'
import { AnimatePresence, motion } from 'framer-motion'

export function Badge({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: 'neutral' | 'positive' | 'negative' | 'accent' | 'warning' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-base/5 text-base-muted',
    positive: 'bg-positive-soft text-positive',
    negative: 'bg-negative-soft text-negative',
    accent: 'bg-accent-soft text-accent',
    warning: 'bg-warning-soft text-warning',
    info: 'bg-info-soft text-info',
  }
  return <span className={cn('chip', tones[tone], className)}>{children}</span>
}

export function Progress({ value, tone = 'accent', className }: { value: number; tone?: 'accent' | 'positive' | 'warning' | 'negative' | 'info'; className?: string }) {
  const v = Math.max(0, Math.min(100, value))
  const colors = {
    accent: 'bg-accent',
    positive: 'bg-positive',
    warning: 'bg-warning',
    negative: 'bg-negative',
    info: 'bg-info',
  }
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-base/10', className)}>
      <div className={cn('h-full rounded-full transition-all duration-500 ease-out', colors[tone])} style={{ width: `${v}%` }} />
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function EmptyState({
  icon = 'Sparkles',
  title,
  description,
  action,
  className,
}: {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('card flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border bg-card-muted">
        <Icon name={icon} className="h-5 w-5 text-muted" />
      </div>
      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-base-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'neutral',
  sub,
  delay = 0,
}: {
  label: string
  value: string
  icon: string
  tone?: 'neutral' | 'positive' | 'negative' | 'accent'
  sub?: React.ReactNode
  delay?: number
}) {
  const toneClasses = {
    neutral: 'text-base',
    positive: 'text-positive',
    negative: 'text-negative',
    accent: 'text-accent',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="card card-hover min-w-0 p-4"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-base-muted">{label}</span>
        <span className={cn('shrink-0 rounded-[9px] p-1.5', tone === 'positive' ? 'bg-positive-soft' : tone === 'negative' ? 'bg-negative-soft' : tone === 'accent' ? 'bg-accent-soft' : 'bg-card-muted')}>
          <Icon name={icon} className={cn('h-4 w-4', toneClasses[tone])} />
        </span>
      </div>
      <div className={cn('tabular mt-2 truncate text-xl font-extrabold tracking-tight sm:text-2xl', toneClasses[tone])}>{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-base-muted">{sub}</div>}
    </motion.div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    // flex (not inline-flex) + overflow-x-auto so a wide option set (e.g.
    // Settings' 5 tabs) scrolls horizontally on a narrow phone instead of
    // overflowing the page or getting clipped by a parent container.
    <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-[11px] bg-card-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-[8px] font-semibold transition-all duration-150',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'bg-card text-base shadow-[0_1px_3px_rgba(15,23,42,0.12)]' : 'text-base-muted hover:text-base'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}
