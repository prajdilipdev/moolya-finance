import React, { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Centered dialog on tablet/desktop; on phones it becomes a bottom sheet
 * (grab handle, rounded top, safe-area padding) so it sits under the thumb.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Stop the page behind the sheet from scrolling on touch devices.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col rounded-t-[26px] border border-b-0 bg-card shadow-lift sm:max-h-[85vh] sm:rounded-[22px] sm:border-b',
              widths[size]
            )}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            {/* Grab handle — phones only */}
            <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-base/15" />
            </div>
            {title && (
              <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-2 sm:border-b sm:py-4">
                <h3 className="text-[17px] font-bold tracking-tight">{title}</h3>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-base/5 text-base-muted transition-colors hover:bg-base/10 hover:text-base"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
            )}
            <div className={cn('flex-1 overflow-y-auto overscroll-contain px-5 pb-5', title ? 'pt-1 sm:pt-4' : 'pt-4', !footer && 'pb-[calc(env(safe-area-inset-bottom)+20px)] sm:pb-5')}>
              {children}
            </div>
            {footer && (
              <div className="flex flex-col-reverse gap-2 border-t px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 sm:flex-row sm:justify-end sm:pb-4 [&>*]:w-full sm:[&>*]:w-auto">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
