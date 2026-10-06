-- Server-only, immutable first-role claim for concurrent Google OAuth callbacks.
create table if not exists public.google_account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_role text not null check (account_role in ('candidate', 'employer')),
  created_at timestamptz not null default now()
);
alter table public.google_account_roles enable row level security;
revoke all on public.google_account_roles from public, anon, authenticated;
grant select, insert on public.google_account_roles to service_role;
