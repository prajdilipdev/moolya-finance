import React from 'react'
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
import { Import } from '@/pages/Import'
import { Settings } from '@/pages/Settings'

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
                    <Route path="/import" element={<Import />} />
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
