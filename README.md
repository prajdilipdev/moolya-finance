# Aavishkar · Private Personal Finance

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
- **Supabase** (optional) for auth + cloud PostgreSQL with full **Row Level Security**
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
Because this is your private tool (not a multi-tenant SaaS), you don't need a running database to use it. The Supabase setup below is entirely **optional** — it's there if you want cloud sync + real email/password login.

---

## Optional: Supabase (auth + cloud storage)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run **`supabase/schema.sql`** (creates all tables + RLS policies + profile-on-signup trigger).
3. In **Authentication → Providers**, enable Email/Password (and Google if you want).
4. Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Start from `.env.example`. The Supabase **anon** key is designed to be public — Row Level Security is what protects your rows.

5. Install `@supabase/supabase-js` and swap the data layer from the localStorage adapter to the Supabase adapter (see **Architecture** below).

> 🔐 **Security model:** Every table stores `user_id` and RLS enforces ownership with policies like `using (user_id = auth.uid())`.
>
> ⚠️ **Anything prefixed `VITE_` is compiled into the JavaScript bundle and is publicly readable.** Never put a Supabase `service_role` key, an OpenAI key, or any other private secret behind a `VITE_` variable. A provider key belongs in a server/edge function that the browser calls.

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

## Backups

- **Export:** `Settings → Data` (full JSON backup) or `Reports` (monthly CSV / full JSON).
- **Restore:** `Settings → Data → Restore from backup`.
- Because data is local-first, your records live with you; cloud Supabase is the optional sync layer.

---

## Privacy note

Aavishkar is designed as your private tool. Financial-health and projection numbers are **application-generated indicators/estimates, not professional financial advice.**

## License

Private / personal use.
