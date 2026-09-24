// Moolya brand mark: an "M" drawn as a rising value line, crowned by a gold bindu (the coin / point of worth).
import { useId } from 'react'

export function MoolyaLogo({ className = 'h-9 w-9' }: { className?: string }) {
  // Unique gradient ids per instance: a copy inside a display:none parent
  // (e.g. the desktop sidebar on phones) would otherwise break the others.
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Moolya">
      <defs>
        <linearGradient id={`moolya-bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#052E1F" />
          <stop offset="1" stopColor="#0B4A32" />
        </linearGradient>
        <linearGradient id={`moolya-m-${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="1" stopColor="#A7F3D0" />
        </linearGradient>
        <linearGradient id={`moolya-gold-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#moolya-bg-${id})`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#34D399" strokeOpacity="0.25" />
      <path d="M8 23.5V12.5L16 20.5L24 12.5V23.5" fill="none" stroke={`url(#moolya-m-${id})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="9" r="2.4" fill={`url(#moolya-gold-${id})`} />
    </svg>
  )
}
