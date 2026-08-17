import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from '@/context/AppContext'
import { AuthProvider } from '@/context/AuthContext'
import { PeriodProvider } from '@/context/PeriodContext'
import { ToastProvider } from '@/context/ToastContext'
import { AuthGate } from '@/components/AuthGate'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { Income } from '@/pages/Income'
import { Expenses } from '@/pages/Expenses'
import { Budgets } from '@/pages/Budgets'
import { Recurring } from '@/pages/Recurring'
import { Bills } from '@/pages/Bills'
import { Goals } from '@/pages/Goals'
import { Debts } from '@/pages/Debts'
import { Analytics } from '@/pages/Analytics'
import { Reports } from '@/pages/Reports'
import { Settings } from '@/pages/Settings'

// Import pulls in pdfjs-dist + xlsx (via bankParser.ts) for bank-statement
// parsing — around 800KB. Loading it lazily means that only downloads for
// someone who actually opens the Import page, not on every visit.
const Import = lazy(() => import('@/pages/Import').then((m) => ({ default: m.Import })))

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate>
          <AppProvider>
            <PeriodProvider>
              <BrowserRouter>
                <Routes>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/transactions" element={<Transactions />} />
                    <Route path="/income" element={<Income />} />
                    <Route path="/expenses" element={<Expenses />} />
                    <Route path="/budgets" element={<Budgets />} />
                    <Route path="/recurring" element={<Recurring />} />
                    <Route path="/bills" element={<Bills />} />
                    <Route path="/goals" element={<Goals />} />
                    <Route path="/debts" element={<Debts />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route
                      path="/import"
                      element={
                        <Suspense fallback={<div className="flex justify-center py-16 text-sm text-base-muted">Loading…</div>}>
                          <Import />
                        </Suspense>
                      }
                    />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Dashboard />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </PeriodProvider>
          </AppProvider>
        </AuthGate>
      </ToastProvider>
    </AuthProvider>
  )
}
