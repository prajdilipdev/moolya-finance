import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client.
 *
 * This app is a Vite SPA with no server, so there is no `@supabase/ssr`
 * cookie/middleware layer — the session lives in localStorage and is refreshed
 * by the client itself.
 *
 * Auth is optional: with no env vars the app keeps working entirely offline,
 * exactly as it did before, and `supabase` is null.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && publishableKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, publishableKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Turns Supabase's terse auth errors into something worth reading. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'That email and password combination did not match.'
  if (m.includes('email not confirmed')) return 'Check your inbox and confirm your email address first.'
  if (m.includes('user already registered')) return 'An account already exists for this email — sign in instead.'
  if (m.includes('password should be')) return 'Password must be at least 6 characters.'
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'Sign-ups are disabled for this project. Create the account from the Supabase dashboard.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts — wait a minute and try again.'
  if (m.includes('failed to fetch')) return 'Could not reach Supabase. Check your connection and the project URL.'
  return message
}
