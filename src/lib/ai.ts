import { supabase } from './supabase'
import { ParsedTransaction, Category, TransactionType } from './types'
import { defaultCategories } from './categories'

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
// Built-in categories are merged in so the model can pick one (e.g. Snacks) even
// if this user's list predates it — materializeInto creates it on save.
function categoryTree(categories: Category[]): { name: string; subs: string[] }[] {
  const tree = new Map<string, Set<string>>()
  for (const list of [defaultCategories(), categories]) {
    for (const parent of list.filter((c) => !c.parentId)) {
      const subs = tree.get(parent.name) ?? new Set<string>()
      list.filter((c) => c.parentId === parent.id).forEach((c) => subs.add(c.name))
      tree.set(parent.name, subs)
    }
  }
  return [...tree].map(([name, subs]) => ({ name, subs: [...subs] }))
}

/**
 * Returns parsed transactions, or null when AI is unavailable, not deployed,
 * or produced nothing usable. Never throws — callers fall back to local parsing.
 */
export async function parseWithAI(
  text: string,
  categories: Category[],
  /** Set when the user picked Expense or Income — the model must use it. */
  type?: TransactionType
): Promise<ParsedTransaction[] | null> {
  if (!supabase) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return null

  try {
    const { data, error } = await supabase.functions.invoke('parse-transaction', {
      body: { text, categories: categoryTree(categories), type },
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
