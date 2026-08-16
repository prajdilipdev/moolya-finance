import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, authErrorMessage } from '@/lib/supabase'

interface AuthContextValue {
  /** False when no Supabase env vars are set — the app then runs offline with no login. */
  enabled: boolean
  /** True until the stored session has been read; render nothing app-level until then. */
  loading: boolean
  session: Session | null
  user: User | null
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, name?: string) => Promise<{ error?: string; needsConfirmation?: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error?: string }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    // Fires on sign-in, sign-out, token refresh and cross-tab changes.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? { error: authErrorMessage(error.message) } : {}
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(async (email, password, name) => {
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: name ? { name } : undefined },
    })
    if (error) return { error: authErrorMessage(error.message) }
    // With email confirmation on, Supabase returns a user but no session.
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
  }, [])

  const resetPassword = useCallback<AuthContextValue['resetPassword']>(async (email) => {
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    return error ? { error: authErrorMessage(error.message) } : {}
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }),
    [loading, session, signIn, signUp, signOut, resetPassword]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
