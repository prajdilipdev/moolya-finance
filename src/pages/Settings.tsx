import React, { useRef, useState } from 'react'
import { Download, Upload, Trash2, Plus, RefreshCw, Sun, Moon, Monitor, Save, Check, ShieldCheck, LogOut } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { importJSON } from '@/lib/store'
import { downloadFile } from '@/lib/format'
import { Segmented, Field } from '@/components/ui/Misc'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'

export function Settings() {
  const { db, updateProfile, setTheme, upsertCategory, deleteCategory, upsertPaymentMethod, addRule, deleteRule, resetAll, backupJSON, replaceDB } = useApp()
  const auth = useAuth()
  const [tab, setTab] = useState('account')
  const fileRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState(false)
  const [ruleKw, setRuleKw] = useState('')
  const [ruleCat, setRuleCat] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const p = db.profile

  const flash = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const doRestore = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const ndb = importJSON(String(reader.result))
        replaceDB(ndb)
        alert('Backup restored successfully.')
      } catch {
        alert('Could not restore backup: invalid file.')
      }
    }
    reader.readAsText(file)
  }

  const tabs = [
    { value: 'account', label: 'Account' },
    { value: 'preferences', label: 'Preferences' },
    { value: 'categories', label: 'Categories' },
    { value: 'ai', label: 'AI & Parser' },
    { value: 'data', label: 'Data' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-sm text-base-muted">Manage your preferences and data</p>
      </div>
      <Segmented options={tabs} value={tab} onChange={setTab} />

      {tab === 'account' && (
        <div className="max-w-lg space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Account</h3>
            <div className="space-y-3">
              <Field label="Name"><input defaultValue={p?.name} onChange={(e) => updateProfile({ name: e.target.value })} className="input" /></Field>
              <Field label="Email"><input defaultValue={p?.email} onChange={(e) => updateProfile({ email: e.target.value })} className="input" /></Field>
              <button onClick={flash} className="btn-primary"><Save className="h-4 w-4" /> Save changes {saved && <Check className="h-4 w-4" />}</button>
            </div>
          </div>
          {auth.enabled && auth.user && (
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-bold">Sign-in</h3>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{auth.user.email}</div>
                  <div className="text-xs text-base-muted">Signed in with Supabase</div>
                </div>
                <button onClick={() => auth.signOut()} className="btn-secondary text-xs"><LogOut className="h-4 w-4" /> Sign out</button>
              </div>
            </div>
          )}
          <div className="card flex items-center justify-between p-5">
            <div>
              <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-positive" /> Private by default</div>
              <p className="text-sm text-base-muted">
                {auth.enabled
                  ? 'Your account controls who can open the app. Your financial records themselves are stored locally on this device.'
                  : 'Your financial data is stored locally on this device (and optionally in your own Supabase account).'}
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'preferences' && (
        <div className="max-w-lg space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Preferences</h3>
            <div className="space-y-3">
              <Field label="Currency">
                <select defaultValue={p?.currency || 'INR'} onChange={(e) => updateProfile({ currency: e.target.value })} className="input">
                  {['INR', 'USD', 'EUR', 'GBP'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Timezone">
                <select defaultValue={p?.timezone || 'Asia/Kolkata'} onChange={(e) => updateProfile({ timezone: e.target.value })} className="input">
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </Field>
              <Field label="Theme">
                <div className="flex gap-2">
                  {([['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']] as const).map(([val, Ico, label]) => (
                    <button key={val} onClick={() => { setTheme(val); updateProfile({ theme: val }) }} className={cn('btn flex-1', (p?.theme || 'system') === val ? 'bg-accent-soft text-accent' : 'bg-base/5 text-base-muted')}>
                      <Ico className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Categories</h3>
            <div className="mb-3 flex gap-2">
              <input placeholder="New category name" id="newCat" className="input flex-1" />
              <button onClick={() => { const el = document.getElementById('newCat') as HTMLInputElement; if (el.value.trim()) { upsertCategory({ name: el.value.trim(), type: 'expense', parentId: null, icon: 'Tag', system: false }); el.value = '' } }} className="btn-primary"><Plus className="h-4 w-4" /> Add</button>
            </div>
            <div className="space-y-1">
              {db.categories.filter((c) => !c.parentId && c.type === 'expense').map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-base/5">
                  <span className="flex items-center gap-2 text-sm"><Icon name={c.icon} className="h-4 w-4 text-base-muted" /> {c.name} {c.system && <span className="text-[10px] text-base-muted">system</span>}</span>
                  {!c.system && <button onClick={() => deleteCategory(c.id)} className="rounded p-1 text-base-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Payment methods</h3>
            <div className="mb-3 flex gap-2">
              <input placeholder="New method" id="newPm" className="input flex-1" />
              <button onClick={() => { const el = document.getElementById('newPm') as HTMLInputElement; if (el.value.trim()) { upsertPaymentMethod({ name: el.value.trim(), icon: 'Banknote', system: false }); el.value = '' } }} className="btn-primary"><Plus className="h-4 w-4" /> Add</button>
            </div>
            <div className="space-y-1">
              {db.paymentMethods.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-base/5">
                  <span className="flex items-center gap-2 text-sm"><Icon name={m.icon} className="h-4 w-4 text-base-muted" /> {m.name} {m.system && <span className="text-[10px] text-base-muted">default</span>}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5 lg:col-span-2">
            <h3 className="mb-1 text-sm font-bold">Your categorization rules</h3>
            <p className="mb-3 text-xs text-base-muted">Teach Quick Add: when a description contains a keyword, always use this category.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              <input placeholder="Keyword e.g. chai" id="ruleKw" className="input flex-1 min-w-[120px]" />
              <select id="ruleCat" className="input w-auto">
                {db.categories.filter((c) => !c.parentId && c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => { const k = (document.getElementById('ruleKw') as HTMLInputElement); const c = (document.getElementById('ruleCat') as HTMLSelectElement); if (k.value.trim()) { addRule({ keyword: k.value.trim(), categoryId: c.value, subcategoryId: null }); k.value = '' } }} className="btn-primary"><Plus className="h-4 w-4" /> Add rule</button>
            </div>
            <div className="space-y-1">
              {db.userCategoryRules.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-base/5">
                  <span className="text-sm"><span className="font-semibold">“{r.keyword}”</span> → {db.categories.find((c) => c.id === r.categoryId)?.name}</span>
                  <button onClick={() => deleteRule(r.id)} className="rounded p-1 text-base-muted hover:text-negative"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {db.userCategoryRules.length === 0 && <p className="text-sm text-base-muted">No custom rules yet.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="max-w-lg card p-5">
          <h3 className="mb-2 text-sm font-bold">AI &amp; Smart Parser</h3>
          <p className="mb-4 text-sm text-base-muted">
            Aavishkar uses a fast local parser by default for common formats (e.g. <code className="rounded bg-base/5 px-1">200rs pav bhaji</code>, <code className="rounded bg-base/5 px-1">25k salary</code>). For complex sentences it can use your own AI provider — configured server-side only.
          </p>
          <div className="space-y-2 rounded-xl bg-base/5 p-4 text-sm">
            <div><code className="font-mono text-xs">AI_PROVIDER=openai</code></div>
            <div><code className="font-mono text-xs">AI_MODEL=gpt-4o-mini</code></div>
            <div><code className="font-mono text-xs">AI_API_KEY=••••</code></div>
          </div>
          <p className="mt-3 text-xs text-base-muted">Keys are never exposed to the browser. The parser abstraction makes swapping providers easy. AI output is validated by a strict schema before it reaches the database.</p>
        </div>
      )}

      {tab === 'data' && (
        <div className="max-w-lg space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold">Backup &amp; restore</h3>
            <div className="space-y-2">
              <button onClick={() => downloadFile('aavishkar-backup.json', backupJSON(), 'application/json')} className="btn-secondary w-full"><Download className="h-4 w-4" /> Export full backup (JSON)</button>
              <button onClick={() => fileRef.current?.click()} className="btn-secondary w-full"><Upload className="h-4 w-4" /> Restore from backup</button>
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && doRestore(e.target.files[0])} />
            </div>
          </div>
          <div className="card border-negative/30 p-5">
            <h3 className="mb-2 text-sm font-bold text-negative">Danger zone</h3>
            {!confirmReset ? (
              <button onClick={() => setConfirmReset(true)} className="btn w-full bg-negative-soft text-negative"><RefreshCw className="h-4 w-4" /> Reset to sample data</button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-base-muted">This replaces all your data with sample data. Continue?</p>
                <div className="flex gap-2">
                  <button onClick={() => { resetAll(); setConfirmReset(false) }} className="btn bg-negative text-white"><Trash2 className="h-4 w-4" /> Yes, reset</button>
                  <button onClick={() => setConfirmReset(false)} className="btn-ghost">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
