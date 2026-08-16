import React, { createContext, useContext, useState } from 'react'
import { PeriodKey, DateRange, rangeForPeriod } from '@/lib/calc'

interface PeriodCtx {
  key: PeriodKey
  range: DateRange
  setKey: (k: PeriodKey) => void
  custom: { start: string; end: string }
  setCustom: (c: { start: string; end: string }) => void
}

const Ctx = createContext<PeriodCtx | null>(null)

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<PeriodKey>('thisMonth')
  const [custom, setCustom] = useState<{ start: string; end: string }>(() => {
    const r = rangeForPeriod('thisMonth')
    return { start: r.start, end: r.end }
  })

  const range: DateRange = key === 'custom' ? { start: custom.start, end: custom.end } : rangeForPeriod(key)

  return <Ctx.Provider value={{ key, range, setKey, custom, setCustom }}>{children}</Ctx.Provider>
}

export function usePeriod(): PeriodCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePeriod must be used within PeriodProvider')
  return ctx
}

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'lastWeek', label: 'Last Week' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'lastYear', label: 'Last Year' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
]
