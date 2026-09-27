import { useEffect, useState } from 'react'
import { KeyRound, Plus, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'

type KeyRow = { id: string; hint: string; created_at: string }

/**
 * Write-only OpenRouter key list. The `key` column isn't granted to browser
 * roles, so once saved a key can never be read back — only its last 4 chars.
 * The parse-transaction Edge Function tries these newest first, then the
 * server's own key.
 */
export function AiKeys() {
  const { toast } = useToast()
  const [keys, setKeys] = useState<KeyRow[] | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!supabase) return setKeys([])
    const { data, error } = await supabase.from('openrouter_keys').select('id,hint,created_at').order('created_at', { ascending: false })
    setKeys(error ? [] : data)
  }
  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    const key = value.trim()
    if (!/^sk-or-[A-Za-z0-9_-]{20,200}$/.test(key)) {
      toast({ title: 'Not an OpenRouter key', message: 'Keys start with sk-or-', tone: 'warning' })
      return
    }
    if (!supabase) return
    setSaving(true)
    // No .select(): the key column isn't readable, and we don't want it back anyway.
    const { error } = await supabase.from('openrouter_keys').insert({ key })
    setSaving(false)
    if (error) {
      toast({ title: 'Key not saved', message: error.message, tone: 'error' })
      return
    }
    setValue('')
    toast({ title: 'Key saved', message: 'AI will use it from the next entry.', tone: 'success' })
    load()
  }

  const remove = async (id: string) => {
    if (!supabase) return
    const { error } = await supabase.from('openrouter_keys').delete().eq('id', id)
    if (error) toast({ title: 'Could not remove key', message: error.message, tone: 'error' })
    load()
  }

  return (
    <div className="max-w-lg card p-5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <KeyRound className="h-4 w-4 text-accent" /> OpenRouter API keys
      </h3>
      <p className="mb-4 text-sm text-base-muted">
        Quick Add uses a fast local parser first and asks AI only for harder sentences. Add your own OpenRouter keys here — the newest is tried first, and if it's rejected, out of credit or rate-limited, the next one takes over automatically.
      </p>

      <div className="mb-4 flex gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label="OpenRouter API key"
          placeholder="sk-or-v1-…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="input flex-1 font-mono"
        />
        <button onClick={add} disabled={saving || !value.trim()} className="btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>

      {keys === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-base-muted" />
      ) : keys.length === 0 ? (
        <p className="text-sm text-base-muted">No keys yet — the app's built-in key is used.</p>
      ) : (
        <div className="space-y-1">
          {keys.map((k, i) => (
            <div key={k.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-base/5">
              <span className="flex items-center gap-2 text-sm">
                <code className="font-mono text-xs">sk-or-••••{k.hint}</code>
                {i === 0 && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">in use</span>}
                <span className="text-xs text-base-muted">added {formatDate(k.created_at)}</span>
              </span>
              <button onClick={() => remove(k.id)} aria-label="Remove key" className="rounded-lg p-2 text-base-muted hover:bg-negative-soft hover:text-negative sm:p-1.5">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-base-muted">
        Keys are stored write-only: once saved, neither this page nor anyone with browser access can read them back. Only the server-side AI function uses them.
      </p>
    </div>
  )
}
