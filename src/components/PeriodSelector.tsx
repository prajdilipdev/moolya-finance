import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar } from 'lucide-react'
import { usePeriod, PERIOD_OPTIONS } from '@/context/PeriodContext'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/format'

export function PeriodSelector() {
  const { key, setKey, custom, setCustom } = usePeriod()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = PERIOD_OPTIONS.find((o) => o.value === key)?.label || 'Custom'

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-secondary !py-2 text-sm" aria-expanded={open}>
        <Calendar className="h-4 w-4" />
        {key === 'custom' ? `${custom.start} → ${custom.end}` : current}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border bg-card p-2 shadow-xl"
          >
            <div className="grid grid-cols-2 gap-1">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => {
                    setKey(o.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                    key === o.value ? 'bg-accent-soft text-accent' : 'text-base hover:bg-base/5'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {key === 'custom' && (
              <div className="mt-2 space-y-2 border-t pt-2">
                <div className="flex items-center gap-2">
                  <input type="date" value={custom.start} max={todayISO()} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="input !py-1.5 text-xs" />
                  <span className="text-base-muted">→</span>
                  <input type="date" value={custom.end} max={todayISO()} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="input !py-1.5 text-xs" />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

