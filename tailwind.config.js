/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Satoshi', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        base: {
          DEFAULT: 'hsl(var(--base) / <alpha-value>)',
          muted: 'hsl(var(--base-muted) / <alpha-value>)',
          ['muted-dim']: 'hsl(var(--muted) / <alpha-value>)',
        },
        bg: 'hsl(var(--bg) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        'card-muted': 'hsl(var(--card-muted) / <alpha-value>)',
        line: 'hsl(var(--line) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-strong': 'hsl(var(--accent-strong) / <alpha-value>)',
        'accent-soft': 'hsl(var(--accent-soft) / <alpha-value>)',
        positive: 'hsl(var(--positive) / <alpha-value>)',
        'positive-soft': 'hsl(var(--positive-soft) / <alpha-value>)',
        negative: 'hsl(var(--negative) / <alpha-value>)',
        'negative-soft': 'hsl(var(--negative-soft) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        'warning-soft': 'hsl(var(--warning-soft) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
        'info-soft': 'hsl(var(--info-soft) / <alpha-value>)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12)',
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.03)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(6px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: 0, transform: 'scale(0.96)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.25s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
}
