import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, List, WalletCards, CalendarClock, Receipt, Target, Scale, PieChart,
  FileBarChart, Upload, Settings, Sparkles, Command as CommandIcon, LogOut, Wallet, Plus,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { CommandPalette } from './CommandPalette'
import { PeriodSelector } from './PeriodSelector'
import { QuickAdd } from './QuickAdd'
import { Onboarding } from './Onboarding'
import { Modal } from './ui/Modal'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/transactions', label: 'Transactions', icon: List },
      { to: '/income', label: 'Income', icon: Wallet },
      { to: '/expenses', label: 'Expenses', icon: Receipt },
      { to: '/analytics', label: 'Analytics', icon: PieChart },
      { to: '/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/budgets', label: 'Budgets', icon: WalletCards },
      { to: '/recurring', label: 'Recurring', icon: CalendarClock },
      { to: '/bills', label: 'Bills & Subscriptions', icon: Receipt },
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/debts', label: 'Debts & EMI', icon: Scale },
    ],
  },
]

const PINNED: NavItem[] = [
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Activity', icon: List },
  { to: '/analytics', label: 'Insights', icon: PieChart },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-[11px] px-3 py-2 text-[13px] font-medium transition-colors duration-150',
          isActive ? 'bg-accent-soft text-accent' : 'text-base-muted hover:bg-base/5 hover:text-base'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />}
          <item.icon className={cn('h-[18px] w-[18px]', isActive ? 'text-accent' : 'text-base-muted group-hover:text-base')} />
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export function Layout() {
  const { db } = useApp()
  const [palette, setPalette] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    setQuickAdd(false)
  }, [loc.pathname])

  const pageTitle =
    [...NAV_GROUPS.flatMap((g) => g.items), ...PINNED].find((n) =>
      n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)
    )?.label || 'Dashboard'

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r bg-card lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[linear-gradient(135deg,#0B172A,#16345C)] text-emerald-300 shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[15px] font-extrabold tracking-tight text-base">Aavishkar</div>
            <div className="text-[11px] text-base-muted">Personal Finance</div>
          </div>
        </div>

        <button
          onClick={() => setQuickAdd(true)}
          className="btn-primary mx-3 mb-3 w-[calc(100%-24px)]"
        >
          <Plus className="h-4 w-4" /> Add transaction
        </button>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => <NavItemLink key={item.to} item={item} />)}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t px-3 py-2">
          <div className="space-y-0.5 pb-1">
            {PINNED.map((item) => <NavItemLink key={item.to} item={item} />)}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-[hsl(var(--bg)/0.82)] px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#0B172A,#16345C)] text-emerald-300">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <h1 className="hidden text-lg font-bold tracking-tight sm:block">{pageTitle}</h1>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setQuickAdd(true)} className="btn-primary hidden !py-2 text-xs md:inline-flex">
              <Plus className="h-4 w-4" /> Add
            </button>
            <button onClick={() => setPalette(true)} className="btn-secondary !py-2 text-xs text-base-muted">
              <CommandIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded-md bg-card-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:inline">⌘K</kbd>
            </button>
            <PeriodSelector />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>

      {/* Mobile bottom nav + FAB */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MOBILE.slice(0, 2).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn('flex flex-col items-center gap-0.5 px-4 py-2.5', isActive ? 'text-accent' : 'text-base-muted')}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-semibold">{item.label}</span>
          </NavLink>
        ))}
        {/* Center quick-add button */}
        <button
          onClick={() => setQuickAdd(true)}
          aria-label="Add transaction"
          className="relative -mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_6px_20px_-6px_rgba(16,185,129,0.6)] transition-transform active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
        {MOBILE.slice(2).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn('flex flex-col items-center gap-0.5 px-4 py-2.5', isActive ? 'text-accent' : 'text-base-muted')}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-semibold">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Global Quick Add modal */}
      <Modal open={quickAdd} onClose={() => setQuickAdd(false)} size="lg">
        <QuickAdd autoFocus onDone={() => setQuickAdd(false)} />
      </Modal>

      <Onboarding />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
