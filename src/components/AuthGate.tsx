import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Loader2, Mail, Lock, ArrowRight, AlertTriangle, CheckCircle2, ShieldCheck, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Field } from './ui/Misc'
import { cn } from '@/lib/utils'

type Mode = 'signin' | 'signup' | 'reset'

/**
 * Locks the app behind a Supabase email/password login.
 *
 * When Supabase isn't configured this renders nothing and the app runs
 * exactly as before — local-only, no account needed.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { enabled, loading, session } = useAuth()

  if (!enabled) return <>{children}</>

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }

  if (!session) return <AuthScreen />

  return <>{children}</>
}

function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)

    if (mode === 'reset') {
      const res = await resetPassword(email)
      if (res.error) setError(res.error)
      else setNotice(`If an account exists for ${email}, a reset link is on its way.`)
    } else if (mode === 'signup') {
      const res = await signUp(email, password, name.trim() || undefined)
      if (res.error) setError(res.error)
      else if (res.needsConfirmation) setNotice('Account created. Confirm your email address, then sign in.')
      // On success with confirmation off, the session arrives via onAuthStateChange
      // and this screen unmounts on its own.
    } else {
      const res = await signIn(email, password)
      if (res.error) setError(res.error)
    }

    setBusy(false)
  }

  const switchTo = (m: Mode) => {
    setMode(m)
    setError(null)
    setNotice(null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--bg))] px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#050A07,#0F2B1D)] text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">Aavishkar</h1>
          <p className="mt-1 text-sm text-base-muted">
            {mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Sign in to your finances'}
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-3 p-5">
          {mode === 'signup' && (
            <Field label="Name">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-muted" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input pl-9"
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            </Field>
          )}

          <Field label="Email">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-muted" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-9"
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>
          </Field>

          {mode !== 'reset' && (
            <Field label="Password">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-muted" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-9"
                  placeholder="••••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>
            </Field>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-negative-soft px-3 py-2 text-xs text-negative">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-2 rounded-xl bg-positive-soft px-3 py-2 text-xs text-positive">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <button type="submit" disabled={busy} className={cn('btn-primary w-full', busy && 'opacity-70')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </button>

          <div className="flex items-center justify-between pt-1 text-xs">
            {mode === 'signin' ? (
              <>
                <button type="button" onClick={() => switchTo('reset')} className="text-base-muted hover:text-base">
                  Forgot password?
                </button>
                <button type="button" onClick={() => switchTo('signup')} className="font-semibold text-accent hover:underline">
                  Create account
                </button>
              </>
            ) : (
              <button type="button" onClick={() => switchTo('signin')} className="font-semibold text-accent hover:underline">
                ← Back to sign in
              </button>
            )}
          </div>
        </form>

        <p className="mt-4 flex items-start justify-center gap-1.5 px-2 text-center text-[11px] leading-relaxed text-base-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />
          <span>Your finances sync to your own private Supabase database, protected by row-level security — only your account can ever read or write your records.</span>
        </p>
      </motion.div>
    </div>
  )
}
