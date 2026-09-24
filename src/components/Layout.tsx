import { MoolyaLogo } from './MoolyaLogo'
import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, List, WalletCards, CalendarClock, Receipt, Target, Scale, PieChart,
  FileBarChart, Upload, Settings, Search, LogOut, Wallet, Plus, LayoutGrid,
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

// Pages with their own tab; anything else lights up the "More" tab instead.
const MOBILE_PINNED_PATHS = ['/', '/transactions', '/analytics']

const SUBTITLES: Record<string, string> = {
  Dashboard: 'Your money at a glance',
  Transactions: 'Every entry, searchable',
  Income: 'Money coming in',
  Expenses: 'Money going out',
  Analytics: 'Trends and breakdowns',
  Reports: 'Monthly and annual summaries',
  Budgets: 'Limits and how you are tracking',
  Recurring: 'Automatic income and expenses',
  'Bills & Subscriptions': 'What is due and when',
  Goals: 'What you are saving towards',
  'Debts & EMI': 'Loans and repayments',
  Import: 'Bring in statements and lists',
  Settings: 'Profile, data and preferences',
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-[11px] px-3 py-2 text-[13.5px] font-medium transition-colors duration-150',
          isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-base-muted hover:bg-base/[0.04] hover:text-base'
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-accent' : 'text-muted group-hover:text-base')} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/** App-style tile used in the mobile "More" sheet. */
function MenuTile({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-[16px] border px-2 py-3 text-center text-[12px] font-semibold leading-tight transition-transform active:scale-[0.96]',
          isActive ? 'border-accent/30 bg-accent-soft text-accent' : 'bg-card-muted/60 text-[hsl(var(--base))]'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-[11px]', isActive ? 'bg-accent text-white' : 'bg-card text-accent shadow-card')}>
            <item.icon className="h-[18px] w-[18px]" />
          </span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function TabLink({ item }: { item: { to: string; label: string; icon: React.ComponentType<{ className?: string }> } }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn('flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors', isActive ? 'text-accent' : 'text-base-muted')
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-accent-soft')}>
            <item.icon className="h-[19px] w-[19px]" />
          </span>
          <span className="text-[10.5px] font-semibold">{item.label}</span>
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

  const userName = db.profile?.name || auth.user?.email || 'You'

  const userCard = (onSignOut: () => void) =>
    auth.enabled && auth.user ? (
      <div className="flex items-center gap-2.5 rounded-[14px] bg-card-muted/70 p-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
          {initials(userName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{db.profile?.name || 'Signed in'}</div>
          <div className="truncate text-[11px] text-base-muted" title={auth.user.email}>{auth.user.email}</div>
        </div>
        <button
          onClick={onSignOut}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-base-muted hover:bg-base/5 hover:text-base"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    ) : null

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r bg-card lg:flex">
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <MoolyaLogo className="h-9 w-9 rounded-[10px] shadow-card" />
          <div className="min-w-0">
            <div className="text-[16px] font-extrabold leading-tight tracking-tight">Moolya</div>
            <div className="text-[11px] font-medium text-base-muted">Personal Finance</div>
          </div>
        </div>

        <div className="px-3 pb-3">
          <button onClick={() => setQuickAdd(true)} className="btn-primary w-full">
            <Plus className="h-4 w-4" /> Add transaction
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => <NavItemLink key={item.to} item={item} />)}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-0.5 border-t px-3 py-3">
          {PINNED.map((item) => <NavItemLink key={item.to} item={item} />)}
          <div className="pt-2">{userCard(() => auth.signOut())}</div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b bg-[hsl(var(--bg)/0.85)] pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16 sm:px-6">
            <MoolyaLogo className="h-8 w-8 shrink-0 rounded-[9px] lg:hidden" />
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-bold leading-tight tracking-tight sm:text-lg">{pageTitle}</h1>
              <p className="hidden truncate text-xs text-base-muted sm:block">{SUBTITLES[pageTitle]}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setPalette(true)}
                aria-label="Search"
                className="btn-secondary !min-h-[40px] !px-2.5 text-base-muted sm:!px-3"
              >
                <Search className="h-4 w-4" />
                <span className="hidden text-xs sm:inline">Search</span>
                <kbd className="hidden rounded-md bg-card-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted md:inline">⌘K</kbd>
              </button>
              <PeriodSelector />
              <button onClick={() => setQuickAdd(true)} className="btn-primary hidden !min-h-[40px] text-xs md:inline-flex lg:hidden">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-5 sm:px-6 sm:pt-6 lg:pb-12">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>

      {/* Mobile: floating tab bar with a raised Add button */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-20 flex items-center rounded-[22px] border bg-card/90 px-1.5 shadow-lift backdrop-blur-xl lg:hidden"
      >
        {MOBILE.slice(0, 2).map((item) => <TabLink key={item.to} item={item} />)}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => setQuickAdd(true)}
            aria-label="Add transaction"
            className="-mt-9 flex h-[58px] w-[58px] items-center justify-center rounded-[20px] bg-accent text-white shadow-[0_10px_24px_-8px_hsl(var(--accent)/0.7)] ring-4 ring-[hsl(var(--bg))] transition-transform active:scale-95"
          >
            <Plus className="h-7 w-7" strokeWidth={2.4} />
          </button>
        </div>
        {MOBILE.slice(2).map((item) => <TabLink key={item.to} item={item} />)}
        {/* Everything else has no other entry point on phones — the full
            sidebar is lg-only — so "More" opens every page as a tile grid. */}
        <button
          onClick={() => setMobileMenu(true)}
          aria-label="More pages"
          aria-expanded={mobileMenu}
          className={cn('flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5', inMenuGroup ? 'text-accent' : 'text-base-muted')}
        >
          <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', inMenuGroup && 'bg-accent-soft')}>
            <LayoutGrid className="h-[19px] w-[19px]" />
          </span>
          <span className="text-[10.5px] font-semibold">More</span>
        </button>
      </nav>

      {/* Global Quick Add */}
      <Modal open={quickAdd} onClose={() => setQuickAdd(false)} title="Add transaction" size="lg">
        <QuickAdd autoFocus onDone={() => setQuickAdd(false)} defaultType={quickAddDefaultType} />
      </Modal>

      {/* Mobile "More" sheet */}
      <Modal open={mobileMenu} onClose={() => setMobileMenu(false)} title="All pages" size="sm">
        <div className="space-y-5">
          {[...NAV_GROUPS, { label: 'More', items: PINNED }].map((group) => (
            <div key={group.label}>
              <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</div>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map((item) => (
                  <MenuTile key={item.to} item={item} onNavigate={() => setMobileMenu(false)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5">{userCard(() => { setMobileMenu(false); auth.signOut() })}</div>
      </Modal>

      <Onboarding />
      <CommandPalette open={palette} onClose={() => setPalette(false)} onOpenQuickAdd={() => setQuickAdd(true)} />
    </div>
  )
}
