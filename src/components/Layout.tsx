import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, List, WalletCards, CalendarClock, Receipt, Target, Scale, PieChart,
  FileBarChart, Upload, Settings, Sparkles, Command as CommandIcon, LogOut, Wallet, Plus, Menu,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
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
]

// Every page reachable from the mobile bottom bar / Menu drawer, used to
// decide whether the current route falls outside the 3 pinned tabs (so the
// Menu tab can show itself as active instead of looking unrelated to the page).
const MOBILE_PINNED_PATHS = ['/', '/transactions', '/analytics']

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          // py-2.5 (not desktop's tighter py-2) so this stays a comfortable
          // tap target in the mobile drawer, which is the only place
          // onNavigate is passed — the desktop sidebar never sets it.
          'group relative flex items-center gap-3 rounded-[11px] px-3 text-[13px] font-medium transition-colors duration-150',
          onNavigate ? 'py-2.5' : 'py-2',
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
  const auth = useAuth()
  const [palette, setPalette] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
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
    setMobileMenu(false)
  }, [loc.pathname])

  const inMenuGroup = !MOBILE_PINNED_PATHS.some((p) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p)))

  // Quick Add has no idea which page it was opened from otherwise, and
  // ambiguous text (no explicit income/expense wording) used to silently
  // default to expense even when opened from the Income page.
  const quickAddDefaultType = loc.pathname.startsWith('/income')
    ? 'income'
    : loc.pathname.startsWith('/expenses')
      ? 'expense'
      : undefined

  const pageTitle =
    [...NAV_GROUPS.flatMap((g) => g.items), ...PINNED].find((n) =>
      n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)
    )?.label || 'Dashboard'

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r bg-card lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[linear-gradient(135deg,#050A07,#0F2B1D)] text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
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
          {auth.enabled && auth.user && (
            <div className="mt-1 flex items-center gap-2 border-t pt-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">
                {initials(db.profile?.name || auth.user.email || 'U')}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-base-muted" title={auth.user.email}>
                {auth.user.email}
              </span>
              <button
                onClick={() => auth.signOut()}
                className="shrink-0 rounded-lg p-1.5 text-base-muted hover:bg-base/5 hover:text-base"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-[hsl(var(--bg)/0.82)] px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#050A07,#0F2B1D)] text-emerald-400 border border-emerald-500/20">
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
            className={({ isActive }) => cn('flex min-w-[52px] flex-col items-center gap-0.5 px-4 py-2.5', isActive ? 'text-accent' : 'text-base-muted')}
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
            className={({ isActive }) => cn('flex min-w-[52px] flex-col items-center gap-0.5 px-4 py-2.5', isActive ? 'text-accent' : 'text-base-muted')}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-semibold">{item.label}</span>
          </NavLink>
        ))}
        {/* Everything else (Income, Expenses, Reports, Budgets, Recurring,
            Bills, Goals, Debts, Import, Settings) has no other on-screen
            entry point on mobile — the sidebar with the full nav is lg:only,
            and the command palette's command list doesn't cover every page
            either. Without this, those pages are only reachable by typing
            a URL directly. */}
        <button
          onClick={() => setMobileMenu(true)}
          aria-label="More"
          aria-expanded={mobileMenu}
          className={cn('flex min-w-[52px] flex-col items-center gap-0.5 px-4 py-2.5', inMenuGroup ? 'text-accent' : 'text-base-muted')}
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Menu</span>
        </button>
      </nav>

      {/* Global Quick Add modal */}
      <Modal open={quickAdd} onClose={() => setQuickAdd(false)} size="lg">
        <QuickAdd autoFocus onDone={() => setQuickAdd(false)} defaultType={quickAddDefaultType} />
      </Modal>

      {/* Mobile "everything else" nav drawer */}
      <Modal open={mobileMenu} onClose={() => setMobileMenu(false)} title="Menu" size="sm">
        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItemLink key={item.to} item={item} onNavigate={() => setMobileMenu(false)} />
                ))}
              </div>
            </div>
          ))}
          <div>
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">More</div>
            <div className="space-y-0.5">
              {PINNED.map((item) => (
                <NavItemLink key={item.to} item={item} onNavigate={() => setMobileMenu(false)} />
              ))}
            </div>
          </div>
        </nav>
        {auth.enabled && auth.user && (
          <div className="mt-4 flex items-center gap-2 border-t pt-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
              {initials(db.profile?.name || auth.user.email || 'U')}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-base-muted" title={auth.user.email}>
              {auth.user.email}
            </span>
            <button
              onClick={() => { setMobileMenu(false); auth.signOut() }}
              className="shrink-0 rounded-lg p-2 text-base-muted hover:bg-base/5 hover:text-base"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </Modal>

      <Onboarding />
      <CommandPalette open={palette} onClose={() => setPalette(false)} onOpenQuickAdd={() => setQuickAdd(true)} />
    </div>
  )
}
