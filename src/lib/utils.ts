import { useEffect, useState } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// `text-base` here is the ink *colour* token (see tailwind.config.js), not
// the 16px size — without this, cn('text-sm', 'text-base') dropped text-sm.
const twMerge = extendTailwindMerge({
  override: {
    classGroups: {
      'font-size': [{ text: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', (v: string) => /^\[\d/.test(v)] }],
    },
  },
  extend: {
    classGroups: {
      'text-color': [{ text: ['base', 'base-muted', 'base-muted-dim'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** True below Tailwind's `sm` breakpoint; updates on resize/rotation. */
export function useIsPhone(): boolean {
  const query = '(max-width: 639px)'
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const h = () => setPhone(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  return phone
}
