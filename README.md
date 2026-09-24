# Moolya · Private Personal Finance

A premium, single-user personal finance **command center** built for one person managing their own money every day.

**Type it → Understand it → Confirm it → Save it → Recalculate everything automatically.**

- Natural-language **Quick Add**: `200rs pav bhaji`, `25k salary`, `2k groceries`, `1200rs electricity bill`
- Bulk **Import** that understands dates, `+`/`-`/`E`/`I` marks, `#Category`, `@Payment`, Indian formats (`2k`, `1.5 lakh`, `1,00,000`)
- One **central transaction system + deterministic calculation engine** — every transaction propagates to budgets, savings, cash flow, charts, reports & insights automatically
- Budgets (+ forecasting, warnings, daily limit), recurring income/expenses, bills, subscriptions, savings goals, debts/EMI
- Analytics charts, monthly/annual reports, full JSON backup/restore, CSV export
- Command palette (`Ctrl/⌘ K`), dark/light/system themes, fully responsive (sidebar + mobile bottom nav)
- **User-friendly structure**: grouped navigation, global Quick Add (top bar + mobile FAB), one-time onboarding, and a setup checklist

---

## Navigation & structure

Sidebar is grouped so it's easy to scan:

- **Overview** — Dashboard · Transactions · Income · Expenses · Analytics · Reports
- **Manage** — Budgets · Recurring · Bills & Subscriptions · Goals · Debts & EMI
- **Pinned** — Import · Settings

**Quick Add is always one tap away:** a button in the sidebar and top bar on desktop, and a raised floating action button in the center of the mobile bottom nav. It opens a modal so you can log a transaction from any screen.

**Onboarding:** On first run you'll get a short, skippable 3-step setup (your name + currency → optional monthly income → optional monthly budget). Everything's optional.

**Setup checklist:** The Dashboard shows a friendly checklist until you've set up the essentials (income, budget, a goal, a bill) — or you can dismiss it.

---

## Tech stack

- **Vite + React 18 + TypeScript** (Next.js-style SPA)
- **Tailwind CSS** design system (deep navy / emerald / blue / coral, Plus Jakarta Sans)
- **Framer Motion** micro-interactions, **Recharts** charts, **Lucide** icons, **Zod**-compatible typed models
- **Supabase Auth** (optional) for email/password sign-in; schema with full **Row Level Security** ready for cloud sync
- Local-first data layer with **localStorage** — works instantly with zero backend

---

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
npm run preview
```

Out of the box the app runs **entirely locally** (data saved in your browser's localStorage) and comes pre-loaded with realistic sample data so you can try every feature immediately. Reset to fresh sample data any time under **Settings → Data**.

### What I kept deliberately simple for a single user
Because this is your private tool (not a multi-tenant SaaS), you don't need a running database to use it. The Supabase setup below is entirely **optional** — add it when you want a real email/password login in front of the app.

---

## Supabase login (optional)

Email/password sign-in that locks the app to you. **Your financial records still live in localStorage** — the account controls who can open the app, not where the data is stored. Cloud sync is the next step, not this one.

Because this is a Vite SPA and not Next.js, there is no server, no `@supabase/ssr`, no cookie middleware and no `NEXT_PUBLIC_*`: `@supabase/supabase-js` runs in the browser, the session lives in localStorage and refreshes itself.

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Authentication → Providers**, enable **Email**.
3. Copy `.env.example` to `.env` in the project root and fill in your project URL and publishable key (**Project Settings → API Keys**):

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

4. `npm run dev`, hit **Create account**, confirm the email Supabase sends, then sign in.
5. **Now go back to Authentication → Sign In / Providers and turn off "Allow new users to sign up".** Otherwise anyone who finds your deployed URL can register.

Leave `.env` out and the app behaves exactly as before: no login, fully offline.

Later, for cloud sync: run **`supabase/schema.sql`** in the SQL editor (all tables + RLS policies + profile-on-signup trigger) and point the data layer at Supabase — see **Architecture** below.

> 🔐 **Security model:** Every table stores `user_id` and RLS enforces ownership with policies like `using (user_id = auth.uid())`. The publishable/anon key is *meant* to be public; RLS is what protects your rows.
>
> ⚠️ **Anything prefixed `VITE_` is compiled into the JavaScript bundle and is publicly readable.** Never put a Supabase secret key (`sb_secret_…` / `service_role`), an OpenAI key, or any other private secret behind a `VITE_` variable — a secret key bypasses RLS completely. Those belong in an edge function the browser calls.

**Auth files**

| File | Role |
|---|---|
| `src/lib/supabase.ts` | Browser client + friendly error messages; exports `null` when unconfigured |
| `src/context/AuthContext.tsx` | Session state, `signIn` / `signUp` / `signOut` / `resetPassword` |
| `src/components/AuthGate.tsx` | The login screen; renders children straight through when auth is off |

---

## Architecture

```
Quick Add ─┐
Manual ────┼─► Parser / Validator ─► Transactions ─┬─► Income / Expenses
Import ────┤      (local first, AI optional)       ├─► Budgets (usage, forecast, daily limit)
Recurring ─┘                                        ├─► Savings / Goals
                                                     ├─► Recurring / Bills / Subs / Debts
                                                     ├─► Cash flow & Forecasts
                                                     └─► Charts / Reports / Insights
```

Key modules in `src/lib`:

| File | Role |
|---|---|
| `parser.ts` | Natural-language parser (amounts, ₹/rs/INR, `2k`/`1.5 lakh`, `+`/`-`/`E`/`I`, dates, `#Category`, `@Payment`, calculator) |
| `categories.ts` | Default category tree + smart keyword categorization rules |
| `calc.ts` | The **one** deterministic calculation engine (totals, budgets, insights, forecast, daily limit) |
| `store.ts` | Data layer — default **LocalStore** (localStorage) + seed data; swap for Supabase |
| `types.ts` | Typed domain model (Zod-compatible schemas mirror the SQL columns) |

The data layer is a thin interface: the UI only talks to `AppContext` (actions like `addTransactions`, `upsertBudget`). To go cloud, implement the same actions against Supabase tables — nothing in the UI changes.

---

## Quick Add — examples it understands

| You type | Result |
|---|---|
| `200rs pav bhaji` | ₹200 expense · Food → Street Food |
| `30rs pani poori` | ₹30 expense · Food → Street Food |
| `40rs phone charger cable` | ₹40 expense · Shopping → Electronics |
| `500 petrol` / `₹500 petrol` | ₹500 expense · Transportation → Fuel |
| `1200rs electricity bill` | ₹1,200 expense · Utilities → Electricity |
| `25k salary` / `25000rs salary` | ₹25,000 income · Income → Salary |
| `2k groceries` | ₹2,000 expense · Food → Groceries |
| `1.5 lakh received from client` | ₹1,50,000 income · Income → Freelance |
| `+25000 salary` / `I 25000rs salary` | Explicit income |
| `-200 food` / `E 200rs food` | Explicit expense |
| `16/08/2026 - 500rs petrol` | Dated expense |
| `- 500rs petrol #Transport @UPI` | Category + payment override |
| `200 + 30 + 40` | Calculator → `₹270` → add as expense |

When confidence is low, Quick Add shows a **Confirm/Edit** panel before saving anything.

---

## Import — smart bulk entry

Paste one transaction per line (mixed formats are fine). It detects income/expense, extracts amounts, categorizes, validates, flags duplicates, shows a live-editable preview with totals, then imports in one step.

**CSV is detected automatically** — paste (or upload) a file whose header row contains `amount` plus `date`/`type`/`description` and the columns are read directly, quoted fields included. Download a ready-made template from the Import screen. Free-text examples:

```text
August 16
- 200rs pav bhaji
- 500rs petrol
+ 25000rs salary
+ 2k cashback #Income/Cashback
- 1200rs electricity bill #Bills @UPI
16/08/2026 - 40rs charger cable
```

---

## Recurring & auto-create

Set up rent, salary, subscriptions, EMIs etc. as recurring items. On the due date:
- **Auto-create** mode writes the transaction for you. It runs when the app opens and catches up on anything that fell due while it was closed (up to 12 periods per item), skipping any occurrence that already exists so nothing is double-counted.
- **Reminder** mode leaves it to you: due items surface "Mark paid" / "Mark received" and "Skip", which advance the next due date by a real calendar period (a monthly item due on the 31st lands on the 28th/29th in February).

---

## Optional: AI fallback for Quick Add

The local parser handles every documented format instantly and offline. AI is consulted **only** when it can add something the parser couldn't: nothing parsed at all, or every result came back below 0.6 confidence. Rows that came from AI are labelled in the review panel, and you still confirm before anything is saved.

**Why this needs a server.** The app is a browser-only SPA, so an AI key in a `VITE_` variable would be published to anyone who opens devtools — and would be billed to you. The key lives in a Supabase Edge Function instead, which checks you're signed in before spending it. The browser never sees it.

The function uses `@supabase/server`'s `withSupabase({ auth: 'user' })`, which verifies the caller's JWT locally against the project JWKS — no round-trip to the Auth server per request. `SUPABASE_URL`, the API keys, and `SUPABASE_JWKS_URL` are injected automatically on Edge Functions, and `npm:@supabase/server` is imported directly, so there is nothing to install and only one secret to set:

```bash
supabase functions deploy parse-transaction
```

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Auth is enforced twice over on purpose: the platform validates the JWT before the handler runs (`verify_jwt` defaults to true — leave it on), and `auth: 'user'` re-checks the claims inside.

The model defaults to `openrouter/free` (OpenRouter's free-model router) and is overridable — set `OPENROUTER_MODEL` to any id from [openrouter.ai/models](https://openrouter.ai/models) if you want a cheaper or different one:

```bash
supabase secrets set OPENROUTER_MODEL=openrouter/free
```

Skip the deploy and nothing breaks: `parseWithAI` fails soft and the local parser stays in charge.

**What the function does with the model's output:** treats it as untrusted input. Amounts must be finite and positive, `type` is coerced to `income`/`expense`, dates must be ISO, and **categories are matched against your actual category list** — the model cannot invent one. Anything that fails validation is dropped rather than saved.

| File | Role |
|---|---|
| `supabase/functions/parse-transaction/index.ts` | Edge function: `withSupabase` auth, prompt, provider call, strict output validation |
| `src/lib/ai.ts` | Client caller; returns `null` on any failure so the local parser takes over |

---

## Backups

- **Export:** `Settings → Data` (full JSON backup) or `Reports` (monthly CSV / full JSON).
- **Restore:** `Settings → Data → Restore from backup`.
- Because data is local-first, your records live with you; cloud Supabase is the optional sync layer.

---

## Privacy note

Moolya is designed as your private tool. Financial-health and projection numbers are **application-generated indicators/estimates, not professional financial advice.**

## License

Private / personal use.
#   m o o l y a - f i n a n c e  
 