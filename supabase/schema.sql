-- =============================================================================
-- Moolya · Private Personal Finance — Supabase schema + Row Level Security
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- This is safe to run repeatedly.
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key default auth.uid(),
  name text not null default 'You',
  email text,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  theme text not null default 'system',
  onboarded boolean not null default false,
  monthly_income numeric,
  initial_balance numeric,
  created_at timestamptz not null default now()
);
-- Safe on a table that already exists from an earlier run of this file —
-- `create table if not exists` above is a no-op once the table exists, so
-- new columns must be added here for anyone who applied the schema before
-- initial_balance was introduced.
alter table public.profiles add column if not exists initial_balance numeric;
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own" on public.profiles for delete using (id = auth.uid());

-- ---------- CATEGORIES ----------
create table if not exists public.categories (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  name text not null,
  type text not null check (type in ('income','expense')),
  parent_id text references public.categories(id) on delete cascade,
  icon text default 'Tag',
  system boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_user on public.categories(user_id);
alter table public.categories enable row level security;
drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_select_own" on public.categories for select using (user_id = auth.uid());
create policy "categories_insert_own" on public.categories for insert with check (user_id = auth.uid());
create policy "categories_update_own" on public.categories for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_delete_own" on public.categories for delete using (user_id = auth.uid());

-- ---------- PAYMENT METHODS ----------
create table if not exists public.payment_methods (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  name text not null,
  icon text default 'Banknote',
  system boolean default false,
  created_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
drop policy if exists "payment_methods_select_own" on public.payment_methods;
drop policy if exists "payment_methods_insert_own" on public.payment_methods;
drop policy if exists "payment_methods_update_own" on public.payment_methods;
drop policy if exists "payment_methods_delete_own" on public.payment_methods;
create policy "payment_methods_select_own" on public.payment_methods for select using (user_id = auth.uid());
create policy "payment_methods_insert_own" on public.payment_methods for insert with check (user_id = auth.uid());
create policy "payment_methods_update_own" on public.payment_methods for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "payment_methods_delete_own" on public.payment_methods for delete using (user_id = auth.uid());

-- ---------- TRANSACTIONS (central) ----------
create table if not exists public.transactions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  type text not null check (type in ('income','expense')),
  amount numeric not null check (amount >= 0),
  currency text not null default 'INR',
  description text not null,
  category_id text references public.categories(id) on delete set null,
  subcategory_id text references public.categories(id) on delete set null,
  merchant text,
  payment_method_id text references public.payment_methods(id) on delete set null,
  transaction_date date not null default current_date,
  notes text,
  source text not null default 'manual'
    check (source in ('manual','quick_entry','ai_parser','import','recurring')),
  parser_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tx_user_date on public.transactions(user_id, transaction_date desc);
create index if not exists idx_tx_user_type on public.transactions(user_id, type);
alter table public.transactions enable row level security;
drop policy if exists "tx_select_own" on public.transactions;
drop policy if exists "tx_insert_own" on public.transactions;
drop policy if exists "tx_update_own" on public.transactions;
drop policy if exists "tx_delete_own" on public.transactions;
create policy "tx_select_own" on public.transactions for select using (user_id = auth.uid());
create policy "tx_insert_own" on public.transactions for insert with check (user_id = auth.uid());
create policy "tx_update_own" on public.transactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tx_delete_own" on public.transactions for delete using (user_id = auth.uid());

-- ---------- BUDGETS ----------
create table if not exists public.budgets (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  name text not null,
  type text not null check (type in ('overall','category')),
  category_id text references public.categories(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  period text not null default 'monthly' check (period in ('monthly','weekly','yearly','custom')),
  start_date date,
  end_date date,
  rollover boolean default false,
  created_at timestamptz not null default now()
);
alter table public.budgets enable row level security;
drop policy if exists "budgets_select_own" on public.budgets;
drop policy if exists "budgets_insert_own" on public.budgets;
drop policy if exists "budgets_update_own" on public.budgets;
drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_select_own" on public.budgets for select using (user_id = auth.uid());
create policy "budgets_insert_own" on public.budgets for insert with check (user_id = auth.uid());
create policy "budgets_update_own" on public.budgets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets_delete_own" on public.budgets for delete using (user_id = auth.uid());

-- ---------- RECURRING ----------
create table if not exists public.recurring (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  name text not null,
  type text not null check (type in ('income','expense')),
  amount numeric not null check (amount >= 0),
  category_id text references public.categories(id) on delete set null,
  subcategory_id text references public.categories(id) on delete set null,
  frequency text not null check (frequency in ('daily','weekly','biweekly','monthly','quarterly','halfyearly','yearly','custom')),
  start_date date not null default current_date,
  next_due_date date,
  end_date date,
  payment_method_id text references public.payment_methods(id) on delete set null,
  auto_create boolean default false,
  reminder boolean default true,
  notes text,
  active boolean default true,
  created_at timestamptz not null default now()
);
alter table public.recurring enable row level security;
drop policy if exists "recurring_select_own" on public.recurring;
drop policy if exists "recurring_insert_own" on public.recurring;
drop policy if exists "recurring_update_own" on public.recurring;
drop policy if exists "recurring_delete_own" on public.recurring;
create policy "recurring_select_own" on public.recurring for select using (user_id = auth.uid());
create policy "recurring_insert_own" on public.recurring for insert with check (user_id = auth.uid());
create policy "recurring_update_own" on public.recurring for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recurring_delete_own" on public.recurring for delete using (user_id = auth.uid());

-- ---------- BILLS ----------
create table if not exists public.bills (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  name text not null,
  amount numeric not null check (amount >= 0),
  due_date date not null,
  recurrence text not null default 'monthly',
  category_id text references public.categories(id) on delete set null,
  payment_method_id text references public.payment_methods(id) on delete set null,
  paid boolean default false,
  reminder boolean default true,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.bills enable row level security;
drop policy if exists "bills_select_own" on public.bills;
drop policy if exists "bills_insert_own" on public.bills;
drop policy if exists "bills_update_own" on public.bills;
drop policy if exists "bills_delete_own" on public.bills;
create policy "bills_select_own" on public.bills for select using (user_id = auth.uid());
create policy "bills_insert_own" on public.bills for insert with check (user_id = auth.uid());
create policy "bills_update_own" on public.bills for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "bills_delete_own" on public.bills for delete using (user_id = auth.uid());

-- ---------- SUBSCRIPTIONS ----------
create table if not exists public.subscriptions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  name text not null,
  amount numeric not null check (amount >= 0),
  frequency text not null default 'monthly' check (frequency in ('monthly','yearly')),
  category_id text references public.categories(id) on delete set null,
  payment_method_id text references public.payment_methods(id) on delete set null,
  active boolean default true,
  next_billing date,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_select_own" on public.subscriptions;
drop policy if exists "subscriptions_insert_own" on public.subscriptions;
drop policy if exists "subscriptions_update_own" on public.subscriptions;
drop policy if exists "subscriptions_delete_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions for select using (user_id = auth.uid());
create policy "subscriptions_insert_own" on public.subscriptions for insert with check (user_id = auth.uid());
create policy "subscriptions_update_own" on public.subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subscriptions_delete_own" on public.subscriptions for delete using (user_id = auth.uid());

-- ---------- GOALS ----------
create table if not exists public.goals (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  name text not null,
  target_amount numeric not null check (target_amount >= 0),
  current_amount numeric not null default 0,
  target_date date,
  monthly_contribution numeric,
  icon text default 'PiggyBank',
  created_at timestamptz not null default now()
);
alter table public.goals enable row level security;
drop policy if exists "goals_select_own" on public.goals;
drop policy if exists "goals_insert_own" on public.goals;
drop policy if exists "goals_update_own" on public.goals;
drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_select_own" on public.goals for select using (user_id = auth.uid());
create policy "goals_insert_own" on public.goals for insert with check (user_id = auth.uid());
create policy "goals_update_own" on public.goals for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "goals_delete_own" on public.goals for delete using (user_id = auth.uid());

-- ---------- DEBTS ----------
create table if not exists public.debts (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  name text not null,
  original_balance numeric not null check (original_balance >= 0),
  current_balance numeric not null check (current_balance >= 0),
  interest_rate numeric,
  min_payment numeric,
  due_date date,
  frequency text not null default 'monthly',
  payment_amount numeric not null default 0,
  category_id text references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.debts enable row level security;
drop policy if exists "debts_select_own" on public.debts;
drop policy if exists "debts_insert_own" on public.debts;
drop policy if exists "debts_update_own" on public.debts;
drop policy if exists "debts_delete_own" on public.debts;
create policy "debts_select_own" on public.debts for select using (user_id = auth.uid());
create policy "debts_insert_own" on public.debts for insert with check (user_id = auth.uid());
create policy "debts_update_own" on public.debts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "debts_delete_own" on public.debts for delete using (user_id = auth.uid());

-- ---------- USER CATEGORY RULES (Quick Add learning) ----------
create table if not exists public.user_category_rules (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  keyword text not null,
  category_id text references public.categories(id) on delete cascade,
  subcategory_id text references public.categories(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.user_category_rules enable row level security;
drop policy if exists "rules_select_own" on public.user_category_rules;
drop policy if exists "rules_insert_own" on public.user_category_rules;
drop policy if exists "rules_update_own" on public.user_category_rules;
drop policy if exists "rules_delete_own" on public.user_category_rules;
create policy "rules_select_own" on public.user_category_rules for select using (user_id = auth.uid());
create policy "rules_insert_own" on public.user_category_rules for insert with check (user_id = auth.uid());
create policy "rules_update_own" on public.user_category_rules for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "rules_delete_own" on public.user_category_rules for delete using (user_id = auth.uid());

-- ---------- Helper: auto-create profile on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'You'), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
