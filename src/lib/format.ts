import type { Frequency } from './types'

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function money(amount: number, currency = 'INR'): string {
  const symbol = currencySymbol(currency)
  const val = Math.abs(amount)
  return `${amount < 0 ? '-' : ''}${symbol}${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: val % 1 === 0 ? 0 : 2,
  }).format(val)}`
}

export function moneySigned(amount: number, currency = 'INR'): string {
  return (amount < 0 ? '−' : '+') + money(Math.abs(amount), currency)
}

export function currencySymbol(currency: string): string {
  switch ((currency || 'INR').toUpperCase()) {
    case 'INR':
      return '₹'
    case 'USD':
      return '$'
    case 'EUR':
      return '€'
    case 'GBP':
      return '£'
    default:
      return (currency || 'INR').toUpperCase() + ' '
  }
}

export function pct(part: number, total: number): number {
  if (!total || total <= 0) return 0
  return (part / total) * 100
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

// Calendar-aware month arithmetic. The day of month is clamped so that
// "31 Jan" + 1 month lands on the last day of February instead of rolling over.
export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return toISODate(target)
}

// Month key (yyyy-mm) in local time. Never use Date#toISOString for this —
// it converts to UTC and shifts the month for timezones ahead of UTC (e.g. IST).
export function monthKey(d: Date): string {
  return toISODate(d).slice(0, 7)
}

// Monday of the week containing `iso`.
export function startOfWeek(iso: string): string {
  const d = parseISODate(iso)
  const dow = (d.getDay() + 6) % 7
  return addDays(iso, -dow)
}

// Last day of the month containing `iso`.
export function endOfMonth(iso: string): string {
  const d = parseISODate(iso)
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

// Advance a date by one period of the given frequency, keeping calendar months
// intact (a monthly item due on the 5th stays on the 5th).
export function advanceByFrequency(iso: string, frequency: Frequency): string {
  switch (frequency) {
    case 'daily':
      return addDays(iso, 1)
    case 'weekly':
      return addDays(iso, 7)
    case 'biweekly':
      return addDays(iso, 14)
    case 'monthly':
      return addMonths(iso, 1)
    case 'quarterly':
      return addMonths(iso, 3)
    case 'halfyearly':
      return addMonths(iso, 6)
    case 'yearly':
      return addMonths(iso, 12)
    default:
      return addMonths(iso, 1)
  }
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const parts = iso.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return iso
}

export function formatDateShort(iso: string): string {
  if (!iso) return '—'
  const parts = iso.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`
  }
  return iso
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function daysBetween(a: string, b: string): number {
  const x = parseISODate(a).getTime()
  const y = parseISODate(b).getTime()
  return Math.round((y - x) / 86400000)
}

export function initials(name: string): string {
  return (name || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
