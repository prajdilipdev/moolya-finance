-- User-supplied OpenRouter keys for the parse-transaction Edge Function.
-- Write-only from the browser: users can add and delete their own keys and see
-- the last 4 characters, but the `key` column itself is never granted to
-- anon/authenticated — only the Edge Function (service role) can read it.

create table if not exists public.openrouter_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key ~ '^sk-or-[A-Za-z0-9_-]{20,200}$'),
  hint text generated always as (right(key, 4)) stored,
  created_at timestamptz not null default now()
);

create index if not exists openrouter_keys_user_idx on public.openrouter_keys (user_id, created_at desc);

alter table public.openrouter_keys enable row level security;

create policy "orkeys_select_own" on public.openrouter_keys for select using (user_id = auth.uid());
create policy "orkeys_insert_own" on public.openrouter_keys for insert with check (user_id = auth.uid());
create policy "orkeys_delete_own" on public.openrouter_keys for delete using (user_id = auth.uid());

-- Column-level lock: clients may insert a key but can only ever read back id/hint/created_at.
revoke all on public.openrouter_keys from anon, authenticated;
grant select (id, hint, created_at) on public.openrouter_keys to authenticated;
grant insert (key) on public.openrouter_keys to authenticated;
grant delete on public.openrouter_keys to authenticated;
