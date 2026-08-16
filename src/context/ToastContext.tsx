import React, { createContext, useCallback, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'warning' | 'error' | 'info'
interface Toast {
  id: number
  title: string
  message?: string
  tone: ToastTone
}

interface ToastCtx {
  toast: (opts: { title: string; message?: string; tone?: ToastTone }) => void
}

const Ctx = createContext<ToastCtx | null>(null)

let counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (opts: { title: string; message?: string; tone?: ToastTone }) => {
      const id = ++counter
      const tone = opts.tone || 'info'
      setToasts((t) => [...t, { id, title: opts.title, message: opts.message, tone }])
      window.setTimeout(() => remove(id), 3600)
    },
    [remove]
  )

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-positive" />,
    warning: <AlertTriangle className="h-5 w-5 text-warning" />,
    error: <XCircle className="h-5 w-5 text-negative" />,
    info: <Info className="h-5 w-5 text-info" />,
  }

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4 sm:items-end sm:pr-5">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[14px] border bg-card p-3.5 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.25)]"
            >
              <span className="mt-0.5 shrink-0">{icons[t.tone]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.message && <div className="mt-0.5 text-xs leading-snug text-base-muted">{t.message}</div>}
              </div>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 rounded-lg p-1 text-muted hover:bg-base/5 hover:text-base"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
