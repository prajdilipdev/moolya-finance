# AI Handoff — Aavishkar Personal Finance

> Written by an outgoing Claude session as its context window filled up. Verified
> against the actual repository (git log, git status, and direct file reads) at
> the time of writing — not reconstructed from conversation memory alone.
>
> **If anything in this document conflicts with the actual code, the code wins.**
> This is a snapshot, not a source of truth.

---

## 1. Project overview

**What it is:** "Aavishkar" — a private, single-user personal finance / expense
tracker web app, oriented at Indian users (₹ INR, UPI narration parsing, Indian
bank statement formats, "2k"/"1.5 lakh" style amount shorthand). Local-first by
design: it works fully offline with zero backend, and Supabase (auth + Postgres
+ an Edge Function) is an optional layer bolted on top, not a requirement.

**Tech stack:**
- Vite 5 + React 18 + TypeScript (strict), React Router v6, Tailwind CSS 3
- Framer Motion (animation), Recharts (charts), Lucide (icons)
- `@supabase/supabase-js` v2 for auth + Postgres (client-side)
- `pdfjs-dist` + `xlsx` for bank-statement PDF/Excel/CSV parsing (Import page only)
- One Supabase **Edge Function** (Deno runtime, not part of the npm build) at
  `supabase/functions/parse-transaction/index.ts`, using `npm:@supabase/server`
  for auth, calling OpenRouter for an optional AI parsing fallback

**Run it:**
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run preview
```

**Architecture, in one paragraph:** There is exactly one piece of app state — a
`DB` object (`src/lib/types.ts`) holding `profile`, `transactions`, `categories`,
`budgets`, `recurring`, `bills`, `subscriptions`, `goals`, `debts`,
`paymentMethods`, `userCategoryRules`. It lives in `localStorage` under the key
`aavishkar.finance.v1` (`src/lib/store.ts`) and is loaded/saved there
unconditionally. `src/context/AppContext.tsx` is the **only** place that
mutates it — every page/component calls an action on `useApp()` (e.g.
`addTransactions`, `upsertBudget`), never touches `localStorage` or Supabase
directly. When a user is signed in, every mutation in `AppContext.tsx` also
fires an async, best-effort, fire-and-forget call into
`src/lib/supabaseSync.ts` (`.catch(console.error)`, never awaited, never blocks
the UI) that mirrors the same write into Postgres. `src/lib/calc.ts` is the
single source of truth for every derived number (totals, budget status,
insights, forecasts) — pages never compute money math themselves.

**Auth:** `src/context/AuthContext.tsx` wraps Supabase Auth (email/password).
`src/components/AuthGate.tsx` renders a login screen and blocks the entire app
behind it **only if** `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are
set in `.env` (`isSupabaseConfigured` in `src/lib/supabase.ts`). With no env
vars, `AuthGate` is a pass-through and the app runs exactly as it did before
auth existed — this fallback is load-bearing and intentional, do not remove it.

**Conventions actually in force in this codebase** (verified from source, not
assumed):
- **IDs are not UUIDs.** Every locally-created record gets an ID from
  `uid(prefix)` in `src/lib/format.ts` — a random string like `tx_1a2b3c4d`,
  `cat_...`, `b_...`, `r_...`, `bill_...`, `sub_...`, `g_...`, `d_...`,
  `rule_...`, `pm_...`, `u_...`. **`supabase/schema.sql` was deliberately
  written with `id text primary key`, not `uuid`**, to match. If you ever see
  a suggestion to "fix" a table's `id` column to `uuid`, that would break
  every foreign-key reference and every local ID — don't do it.
- **Money is always stored as INR.** Every parser path (free text, CSV,
  Markdown/TSV table, bank PDF/Excel) converts foreign-currency amounts to INR
  *at parse time* using a hardcoded rate table (`FX_RATES_TO_INR` in
  `src/lib/parser.ts`) and tags the original amount into the description
  string (e.g. `"Domain Renewal ($21)"`). `Transaction.currency` is
  effectively always `'INR'` after parsing. `src/lib/calc.ts` has zero
  currency-awareness — it just sums `t.amount` — so if you ever add a new
  entry point that creates transactions, it MUST convert to INR before
  calling `addTransactions`/`addParsedTransactions`, or totals will be silently
  wrong.
- **No comments unless they explain a non-obvious "why".** This repo (my own
  contributions, at least) follows that discipline; keep doing it.
- **Tailwind only** — no CSS modules, no styled-components. Design tokens are
  CSS custom properties in `src/index.css` (`--bg`, `--accent`, etc.),
  consumed via `tailwind.config.js`'s `colors` block using
  `hsl(var(--x) / <alpha-value>)`.
- **Commit messages** in this repo end with `Co-Authored-By: Claude Opus 5
  <noreply@anthropic.com>` on commits I authored. Keep that trailer on your
  own commits if you're another Claude session.

---

## 2. What was accomplished (this session, by me)

**Important scope note:** this repository has 27 commits total. I authored
**9** of them. The other 18 (roughly the middle third of `git log`, from
`361e0fc` "Add Vercel configuration" through `15140b9` "Comprehensive
site-wide audit") were made by the user or another process **between my
turns** — I did not write that code, and I have only partially audited it (see
§5 and §6 for exactly which parts). Don't assume I've reviewed everything in
the repo just because I've been working in it all session.

### Commits I made, in order, all pushed to `origin/main`:

1. **`9475f72`** — Initial push of the whole app + a first pass of engine bug
   fixes (date/timezone bugs in `calc.ts`/`format.ts`, category-loss bug in
   the parser, recurring auto-create engine, CSV import parsing). This was the
   very first commit in the repo's history.
2. **`ba43773`** — Added Supabase email/password login: `AuthContext.tsx`,
   `AuthGate.tsx`, `src/lib/supabase.ts`.
3. **`547d413`** — Added an optional AI fallback for Quick Add: the Edge
   Function at `supabase/functions/parse-transaction/index.ts` and the client
   caller `src/lib/ai.ts`. The local regex/keyword parser (`parser.ts`) always
   runs first; AI is only consulted when it parsed nothing or every result was
   under 0.6 confidence, and its output is strictly validated server-side
   (categories must exist in the caller's own category list — the model can't
   invent one).
4. **`9dfd736`** — Reworked the Edge Function's auth to use `@supabase/server`'s
   `withSupabase({ auth: 'user' })`, which verifies the caller's JWT locally
   against the project's JWKS instead of round-tripping to the Auth server.
5. **`74a205e`** — **Fixed four real bugs in the cloud-sync layer** (which
   someone/something else had built in the interim, commit `7d89ddb` — I did
   not write the original sync implementation, only audited and fixed it):
   - Recurring auto-create transactions were materialized locally but never
     pushed to Supabase, so every subsequent cloud fetch would re-materialize
     the same transaction — silent, repeated double-counting of income/expense
     for anyone using recurring auto-create while signed in. Fixed via
     `runRecurringAndSync()` in `AppContext.tsx`.
   - `profile.initialBalance` (the bank-statement-derived opening balance) had
     no column in `profiles` and was dropped by the sync mappers — lost on the
     next cloud fetch. Added `initial_balance` to `schema.sql` (with an
     idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for anyone who'd
     already run the schema) and wired it through `mapProfileFromDb`/`ToDb`.
   - Shared-device privacy leak: a second Supabase account signing in after a
     first account already synced would see the first account's leftover
     `localStorage` and upload it into the second account's cloud tables.
     Fixed with a `lastCloudUser` marker (`getLastCloudUser`/`setLastCloudUser`
     in `store.ts`).
   - `addParsedTransactions` silently dropped duplicates but returned `void`,
     so Quick Add/Import success messages could overstate what was actually
     saved. Now returns `{ added, skipped }`.
6. **`bfb3a12`** — Fixed several money-correctness bugs found via a full
   feature audit (I spawned an Explore subagent for part of this, then
   personally re-verified every finding against the actual code before
   fixing anything — see §5 for the one finding I could **not** independently
   verify):
   - Dashboard's headline "Available Balance" was computed from the
     *currently-selected period's* income/expenses (default: this month)
     instead of all-time totals, even though the correct number
     (`allTotals.balance`) was already computed one line away and unused.
   - CSV and Markdown/TSV table imports read a foreign-currency amount's
     digits but stored them tagged as INR (no conversion) — added
     `parseAmountToINR()` in `parser.ts`, applied in both importers.
   - `looksLikeTable()` false-positives (ordinary text with a stray
     tab/pipe) had no fallback and silently reported zero transactions;
     `parseBlock()` now falls through to the free-text parser when the table
     parser yields zero rows.
   - Quick Add's instant-save-on-Enter (a change made outside my session, in
     `e9067e6`) removed the old review step, so a low-confidence parse now
     writes straight to the ledger with no warning. Added a warning-toned
     toast for low-confidence saves instead of reverting the instant-save UX.
   - Three bugs in `bankParser.ts`: a numeric (not string) negative XLSX
     amount wasn't sign-detected; the PDF amount-column matcher's own comment
     said "x >= 370" but never actually checked `x`, so a decimal-shaped
     token anywhere in a row (including narration text) could overwrite the
     real amount; new-transaction-block detection required the date to be a
     single PDF text run, so some PDF generators' split date runs got
     silently folded into the previous transaction.
   - Bank-statement balance reconciliation was dead code for actual file
     uploads: `parsePdfStatement`/`parseExcelOrCsvStatement` computed but
     discarded opening/closing balance; only the pasted-Markdown-table path
     worked. Wired through all three `Import.tsx` call sites, reset between
     imports, and — this had never existed at all — added an actual
     reconciliation check (opening + income − expenses vs. the statement's
     own closing balance) with a warning banner when they don't match.
   - `bankParser.ts` had a hard dependency on `pdfjs-dist` + `xlsx` (~800KB)
     purely to reuse `cleanNarration()`, a pure string function — and because
     `parser.ts` imports that function and `parser.ts` is used by QuickAdd
     (which sits on the Dashboard, the first page loaded), that 800KB shipped
     to every single visitor. Extracted `cleanNarration()` into
     `src/lib/narration.ts` (zero heavy deps), lazy-loaded the `/import` route
     in `App.tsx`, gave `recharts` its own Vite chunk. Initial JS payload
     dropped from ~591KB to ~328KB gzipped; restored
     `chunkSizeWarningLimit` to Vite's default (it had been raised to 1000,
     which was hiding the regression rather than fixing it).
7. **`ed16c82`** — Fixed a real bug the user found by testing in the browser
   with a screenshot: opening Quick Add from the Income page and typing plain
   text (no explicit income wording) saved it as an **expense**. Root cause:
   `detectType()` in `parser.ts` had a hardcoded `'expense'` fallback with no
   page context. Added a `fallback`/`defaultType` parameter threaded through
   `detectType` → `parseLine` → `parseBlock` → `QuickAdd` (prop) →
   `Layout.tsx` (derives it from `useLocation().pathname`: `/income` →
   `'income'`, `/expenses` → `'expense'`, else unchanged). Also switched on an
   `EXPENSE_WORDS` regex that was declared but never actually used, ahead of
   the fallback.
8. **`e66867b`** — Mobile-responsiveness pass, done as a **code audit only**
   (see §3 — I could not log in to visually test the authenticated pages):
   - `TransactionList.tsx`'s Edit/Delete buttons were `opacity-0` with
     `group-hover:opacity-100` as the *only* way to reveal them — completely
     broken on touch (no persistent `:hover`), meaning these buttons were
     invisible/untappable on a phone on both the Transactions page and the
     Income/Expenses pages' expandable list. Now visible by default below
     `sm:`, hover-hidden only at `sm:` and up; also bumped tap padding.
   - The `Segmented` tab control (`src/components/ui/Misc.tsx`) had no
     wrap/scroll handling — Settings' 5 tabs don't fit at 375px. Now scrolls
     horizontally instead of breaking layout.
   - Dashboard's headline balance + 3-column stat tiles, the shared
     `StatCard` component, and the Debts/Recurring/Reports stat grids had no
     overflow safety on real (unbounded) money numbers — CSS grid items
     default to `min-width: auto` (content size), so a large balance could
     force the grid wider than the phone screen. Added `min-w-0` on grid
     items and `truncate` on the number/label text throughout, plus a
     mobile-first font-size step-down on the tightest grids.
9. **`fe50856`** — Switched the app-wide typeface from Google Fonts' "Plus
   Jakarta Sans" to Fontshare's "Satoshi". Because `body { @apply font-sans }`
   in `src/index.css` is the only place font-family is set (verified via
   grep — nothing else in `src/` references a font family), this was a
   two-file change: `index.html` (new `<link>`, weights
   300/400/500/700/900) and `tailwind.config.js` (`fontFamily.sans`).
   **Verified in-browser**, not just built: `getComputedStyle(document.body)`
   returns `"Satoshi, Inter, system-ui, sans-serif"` and the Font Loading API
   reports the 400/700/900 weight files as `status: "loaded"`.

**Everything above is pushed.** `git status` is clean and `origin/main` is
exactly even with local `HEAD` (`git rev-list --left-right --count
origin/main...HEAD` → `0	0`) as of this writing.

---

## 3. Current state

**What's verified vs. what's assumed — read this carefully before trusting
any "it works" claim in this document or in git history:**

- ✅ **`npm run build` succeeds cleanly** as of the last commit (`tsc -b &&
  vite build`, zero type errors, zero build warnings other than the expected
  chunk-size note for `vendor-bank` — see §4).
- ✅ **The login screen** (`AuthGate.tsx`'s unauthenticated view) has been
  visually/programmatically checked multiple times in the in-app preview
  browser at both desktop and 375×812 mobile viewports: no horizontal
  overflow, no new console errors, correct copy, Satoshi font confirmed
  loaded via the Font Loading API.
- ✅ **Offline mode** (no `.env` / Supabase not configured) was verified
  early in the session: the app renders and functions with `AuthGate` as a
  pass-through.
- ❌ **Nothing behind the login wall has been visually verified by me, at
  all, in this entire session.** I am not permitted to create accounts or
  enter passwords (a hard safety rule, not a technical limitation), and this
  repo's `.env` has real Supabase credentials configured, so `AuthGate` shows
  a real login screen every time I open the preview. Every fix described in
  §2 for authenticated-only behavior (cloud sync, recurring auto-create
  pushing to Supabase, the reconciliation banner, the Income-page Quick Add
  fix's actual save behavior, the mobile touch-target fixes on the
  Transactions list) is verified by **code reading + `tsc` type-checking +
  build success only**, not by seeing it run. The one exception: the user
  personally tested the Quick-Add-on-Income-page bug in their own real
  browser session and sent a screenshot — that's the only piece of
  ground-truth authenticated-app feedback I have.
- ❓ **Whether the Supabase Edge Function is actually deployed** — I wrote
  `supabase/functions/parse-transaction/index.ts` and documented the deploy
  commands in the README, but I have no evidence it was ever run. If it
  isn't deployed, Quick Add's AI fallback fails closed silently (the local
  parser is always tried first and is the only thing most users will ever
  see) — this is safe-by-design, not broken, but the *feature* may simply not
  exist in production yet.
- ❓ **Whether Vercel (or anything else) is deployed and auto-updating from
  GitHub pushes.** `vercel.json` exists (SPA rewrite rule only) but there's no
  `.vercel/` link in this checkout and no Vercel CLI installed in this
  environment. I asked the user directly ("is Vercel already watching this
  GitHub repo, or do you deploy some other way?") and **never got an
  answer** — this is still an open question, not a settled fact. Don't
  assume pushes to `main` are live anywhere without confirming this first.
- ❓ **Whether the two credentials the user pasted into chat earlier this
  session were rotated.** An OpenRouter key (`sk-or-v1-...`) and a Supabase
  secret key (`sb_secret_...`, partially masked the second time) were both
  typed into the chat by the user at different points. Neither was ever
  written to any file by me — I checked the built `dist/` bundle specifically
  to confirm no secret values leaked into client code — but the values
  themselves are compromised by having been in a chat transcript, and I
  explicitly told the user to rotate both. I have no confirmation this
  happened.

**Dev server:** `npm run dev` → Vite on `http://localhost:5173`. No custom
server config beyond what's in `vite.config.ts` (host: true, allowedHosts:
true — fine for the sandboxed preview browser, reconsider before using
`allowedHosts: true` on a real exposed dev server).

**Known build warning (expected, not a bug):** `vendor-bank`
(`pdfjs-dist` + `xlsx`, 811.84 kB / 256.23 kB gzip) exceeds Vite's 500kB
chunk-size warning. This is intentional — that chunk is lazy-loaded only when
`/import` is visited (see `App.tsx`'s `lazy()` import), and every chunk in the
*initial* page load is under the 500kB threshold. If this warning ever grows
to include a chunk in the initial load, that's a real regression to
investigate — don't just raise the limit again (see §4, this was explicitly
called out as an anti-pattern to avoid repeating).

---

## 4. Important decisions (and why — don't casually reverse these)

- **`AuthGate` must remain a pass-through when Supabase isn't configured.**
  This is the load-bearing design decision that keeps the app usable
  fully-offline. Any change to auth flow must preserve "no `.env` → no login
  wall, exact same offline behavior as before auth existed."
- **The AI parsing fallback is opt-in and fails closed.** The local
  regex/keyword parser in `parser.ts` always runs first and handles the
  documented formats instantly offline; AI is a last resort, only consulted
  when nothing parsed or confidence was uniformly low, and its output is
  strictly validated (categories must already exist; nothing the model says
  is trusted blindly). This was an explicit design choice to keep the app
  privacy-respecting and functional without any AI provider at all. Do not
  make AI a required or first-choice path.
- **The AI provider key lives server-side only, in a Supabase Edge Function,
  never in a `VITE_` variable.** This is not a style preference — a
  `VITE_`-prefixed variable is compiled into the client bundle and is
  publicly readable by anyone who opens devtools. This was verified: I
  grepped the built `dist/` output specifically to confirm the OpenRouter key
  never appears in client code. If a future agent is asked to "make AI
  faster" or "skip the extra network hop," **do not** move the API call to
  the client — that would leak the key.
- **Local IDs are non-UUID strings (`uid(prefix)`), and `schema.sql` uses
  `id text primary key` specifically to match.** Documented in §1; repeating
  here because it's the single easiest thing for a future agent to "fix"
  without realizing it would break every foreign key and every existing
  local record.
- **Every transaction amount is normalized to INR at parse time, everywhere.**
  `calc.ts` has no currency conversion logic and never will unless someone
  deliberately redesigns the whole totals pipeline. Any new transaction entry
  point must convert to INR before the transaction is created.
- **Cloud sync is fire-and-forget, not transactional.** Every
  `cloudUpsertX(...).catch(console.error)` call in `AppContext.tsx` is
  intentionally not awaited — the local UI never blocks on the network. This
  means a flaky connection can leave local and cloud state briefly out of
  sync (resolved on the next successful sync). This was an accepted tradeoff
  for UI responsiveness, not an oversight — don't "fix" it into a blocking
  await without discussing the UX tradeoff with the user first.
- **FX rates are hardcoded, not live**, in `FX_RATES_TO_INR`
  (`src/lib/parser.ts`). This was flagged to the user as a known limitation
  that will drift over time (it already needed a manual update once this
  session, `b415e9e`, done outside my turns). I deliberately did **not**
  add a live-rate API without being asked — that's an architectural
  decision (new external dependency, new failure mode, possibly a paid API)
  that should be the user's call, not something an agent decides
  unilaterally.
- **Vite `chunkSizeWarningLimit` was restored to the default (500kB)** after
  I found it had been raised to 1000 in an earlier commit specifically to
  silence a warning caused by a real bundling bug (the whole PDF/Excel
  toolchain loading on every page). Raising the limit again to silence a
  future warning should be treated as a red flag, not a fix — investigate
  what's actually in the oversized chunk first.

---

## 5. Problems and failed approaches

- **I cannot test anything behind login.** This is the single biggest
  constraint on this session's work and will apply to the next agent too,
  unless the user is present and willing to log in themselves. Every
  authenticated-page fix in this session is verified by code review + type
  checking + build success, **not** by seeing it run. Don't claim something
  "works" post-login without either the user confirming it or a real,
  supervised login session.
- **One audit finding I could not independently verify and did not fix on
  faith:** an Explore subagent's report flagged that `Import.tsx`'s own
  separate duplicate-detection pre-check (`duplicateIds`, used only for the
  "Duplicate" badge in the review table) has no intra-batch dedup — i.e. it
  only compares against `db.transactions`, not against other rows in the
  same paste/upload. I *did* verify this claim by reading the code myself
  and confirmed it's real, but concluded it's low-impact: the actual
  save path (`addParsedTransactions` in `AppContext.tsx`) has its own,
  separate, intra-batch-safe dedup (`batchKeys` Set), so the only consequence
  is the on-screen "Duplicate" badge can be inaccurate for a same-batch
  duplicate — no data corruption. **Left unfixed deliberately** (see §6).
- **PDF line-grouping heuristic (`bankParser.ts`, rounds text-item Y-coordinate
  to the nearest 3px to merge same-line text) was flagged as fragile but left
  alone.** I didn't have a real HDFC (or any bank) PDF statement to test
  against, and blindly changing PDF text-position heuristics without a real
  sample felt riskier than leaving a known-fragile-but-currently-working
  heuristic in place. If the next agent has a real sample PDF to test
  against, this is worth revisiting.
- **Cross-format duplicate false-negative** (re-importing the same statement
  period from two different file formats — e.g. a PDF export and a CSV
  export of the same month — may not be recognized as duplicates, because
  `cleanNarration()`'s output can differ slightly between formats and the
  dedupe key includes the cleaned description). Identified, not fixed —
  fixing it would mean loosening the dedupe key, which risks new false
  positives (two different real transactions colliding). This is a genuine
  precision/recall tradeoff, not a bug with an obvious right answer — flag it
  to the user before changing the dedupe heuristic.
- **"Push it live" was asked twice** and both times I had to clarify that
  pushing to GitHub (which I'd already done) and "live" (an actual
  deployment) are two different things I can't conflate — the user has not
  yet said whether Vercel is connected to this repo. Don't assume a GitHub
  push is a production deploy in this project.
- **No failed code changes to report** — everything I attempted this session
  built and type-checked successfully on the first or second try; there's no
  abandoned branch or reverted approach to warn about.

---

## 6. Remaining work

Roughly in priority order:

1. **Get a real, logged-in verification pass.** This is the highest-value
   next step — see §7. Nothing else in this list can be confidently
   prioritized until someone actually sees the authenticated app run.
2. **Confirm deployment status** — is Vercel connected to this GitHub repo
   and auto-deploying `main`? Is the Supabase Edge Function
   (`parse-transaction`) actually deployed, and is `OPENROUTER_API_KEY` set as
   a Supabase secret? Neither is confirmed (§3).
3. **Rotate both credentials that were pasted into the chat transcript**
   this session (an OpenRouter key and a Supabase secret key) if that hasn't
   already been done — see §3 for exact context. Not code work, but
   important and unconfirmed.
4. **FX rate strategy decision** — hardcoded rates will keep drifting. Needs
   the user to decide: keep manually updating, or accept an external live-rate
   API dependency? Don't implement either without asking.
5. **Import.tsx duplicate-badge intra-batch accuracy** (§5) — low priority,
   cosmetic-only, but a quick fix if picked up: extend `duplicateIds`'s
   `useMemo` in `Import.tsx` to also check against earlier rows in `rows`
   itself, not just `db.transactions`.
6. **PDF bank-statement parser hardening** (§5) — needs real sample PDFs to
   safely improve the Y-coordinate line-grouping heuristic in
   `bankParser.ts`. Ask the user for a real (redacted/sample) statement PDF
   before touching this.
7. **SEO metadata and toast-notification consistency** — part of the
   "Comprehensive site-wide audit" commit (`15140b9`) made outside my
   session; I have not personally reviewed this area at all. Worth a look if
   the user reports anything off with page metadata or toast messages.
8. **Cross-format duplicate detection precision/recall tradeoff** (§5) — no
   clear next action; needs a product decision, not just code.

---

## 7. Exact next step

**Do this first, in order:**

1. Run `git log --oneline -5` and `git status` yourself to confirm you're
   starting from the same state this document describes (`fe50856` as
   `HEAD`, clean tree, even with `origin/main`). If it doesn't match, this
   document may be stale — trust the repo over the document.
2. Run `npm install && npm run build` to confirm the build is still clean
   before touching anything.
3. **Ask the user directly, in your first message, these two unresolved
   questions from §3** (don't guess or assume):
   - "Is this GitHub repo connected to Vercel (or another host) for
     automatic deployment, or do you deploy manually?"
   - "Have you rotated the OpenRouter API key and the Supabase secret key
     that were shared in an earlier session? If not, please do that before
     we continue — both were exposed in a chat transcript."
4. **Ask the user to log in to the running app** (`npm run dev`, or their
   live deployment if one exists) **themselves** and walk through it with
   you watching/guiding — you (the AI) still cannot create accounts or enter
   passwords. Specifically ask them to check, in order of what's least
   verified:
   - Sign in, then check Settings → Account: does the "Sign-in Account" card
     show their email, does "Sync Now" work, does sign-out actually clear the
     session (re-check `AuthGate` shows the login screen again)?
   - Open Quick Add from `/income` and `/expenses` specifically and confirm
     plain-text entries (no explicit income/expense wording) land as the
     correct type — this is the one fix (`ed16c82`) with real user
     confirmation of the *bug*, but not yet of the *fix*.
   - On mobile (or resize the browser to ~375px), open `/transactions` and
     confirm the Edit/Delete icons on each row are visible without hovering,
     and confirm `/settings` tabs scroll horizontally instead of overflowing.
   - If they have a real bank statement PDF/Excel/CSV, import it and check
     whether the new reconciliation banner (opening + income − expenses vs.
     statement closing balance) appears and is accurate.
   - Check the Dashboard headline "Available Balance" reads correctly as an
     all-time figure regardless of the selected period filter.
5. **Fix whatever that walkthrough surfaces first** — real bugs found via
   actual use outrank everything in §6's priority list.

If the user is *not* available to log in and just wants code work to
continue: pick up §6 item 5 (Import.tsx duplicate-badge fix) as the safest,
most self-contained, no-login-required task, and leave a note for the next
handoff about why the login-gated items were skipped.

---

## 8. Git / repository state

- **Branch:** `main` (only branch; no feature branches in use)
- **Latest commit:** `fe50856` — "Switch typeface to Satoshi"
- **Working tree:** clean (verified via `git status` immediately before
  writing this document)
- **Remote sync:** `origin/main` is exactly even with local `HEAD` (0 ahead,
  0 behind) — everything described in this document is already pushed to
  `https://github.com/prajdilipdev/finance-app-self.git`
- **Uncommitted changes:** none
- **Nothing dangerous to overwrite** — no stashes, no other branches, no
  detached-HEAD state, no rebase/merge in progress
- **`.env`** exists locally with real Supabase credentials but is git-ignored
  (`.gitignore` excludes `.env` and `.env.*`, explicitly allows
  `.env.example`) and confirmed **not** tracked by git
  (`git ls-files | grep '^\.env$'` → no match). Do not `git add -f` it, ever.
- **`dist/`** and `node_modules/` exist locally (build artifacts /
  dependencies) and are git-ignored — normal, not a concern.

---

## 9. User requirements (things said explicitly this session — don't relitigate)

- This is explicitly framed as the user's **own private, single-user** tool —
  not a multi-tenant SaaS. Design decisions should keep favoring "simple for
  one person" over "scalable for many."
- The user wants their **existing local data uploaded to the cloud** on
  first sign-in, not discarded — this was an explicit choice
  ("Yes — move my data to the cloud" / "Upload them to the cloud") made
  earlier in the session and is exactly what the sync-on-first-login logic
  in `AppContext.tsx` does.
- The user explicitly wants **AI as a fallback only**, with the local parser
  doing the real work — confirmed by how the feature was scoped when
  requested and never contradicted since.
- When the user reports a bug, they've been giving **real screenshots from
  their own logged-in session** (e.g. the Income page Quick Add bug) — take
  these as ground truth above anything in this document or in code-reading
  alone.
- The user asked, unprompted, for "complete" and "thorough" work multiple
  times (the original "analyze files and project completely" request, the
  cloud-sync audit, the mobile-friendly pass) — they consistently prefer a
  full audit over a narrow point-fix when asked to look at an area. Match
  that bar rather than defaulting to the smallest possible diff.
- The user has **not** asked for a live-FX-rate integration, a redesign of
  the dedupe heuristic, or a PDF-parser rewrite — these remain open questions
  in §6, not approved work. Don't start them without asking.
- Standard safety constraints applied all session and still apply: no
  creating accounts, no entering passwords, no logging into third-party
  services, no destructive git operations without explicit confirmation, no
  secrets ever written to a committed file.
