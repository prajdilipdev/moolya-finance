import { supabase } from './supabase'
import { ParsedTransaction, Category } from './types'

/**
 * AI fallback for Quick Add.
 *
 * The provider key lives in a Supabase Edge Function, never in this bundle —
 * a `VITE_`-prefixed key would be readable by anyone who opens the page.
 * If the function isn't deployed, every call here fails softly and the local
 * regex parser stays in charge.
 */

/** Cheap gate: AI needs a signed-in Supabase session to call the function. */
export function isAIAvailable(): boolean {
  return supabase !== null
}

/** Categories in the shape the function expects: parents with their children. */
function categoryTree(categories: Category[]): { name: string; subs: string[] }[] {
  return categories
    .filter((c) => !c.parentId)
    .map((parent) => ({
      name: parent.name,
      subs: categories.filter((c) => c.parentId === parent.id).map((c) => c.name),
    }))
}

/**
 * Returns parsed transactions, or null when AI is unavailable, not deployed,
 * or produced nothing usable. Never throws — callers fall back to local parsing.
 */
export async function parseWithAI(text: string, categories: Category[]): Promise<ParsedTransaction[] | null> {
  if (!supabase) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return null

  try {
    const { data, error } = await supabase.functions.invoke('parse-transaction', {
      body: { text, categories: categoryTree(categories) },
    })
    if (error) {
      console.warn('[ai] parse-transaction failed:', error.message)
      return null
    }
    const list = (data as { transactions?: unknown } | null)?.transactions
    if (!Array.isArray(list) || list.length === 0) return null
    return list as ParsedTransaction[]
  } catch (e) {
    console.warn('[ai] parse-transaction unreachable:', e)
    return null
  }
}
