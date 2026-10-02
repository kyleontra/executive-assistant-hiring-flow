-- Private username accounts. No email, public registration, or client table access.
create table public.master_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username)),
  password_hash text not null,
  password_salt text not null,
  employer_id uuid not null references public.hirer_workspaces(id),
  can_review boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.master_sessions (
  token_hash text primary key,
  account_id uuid not null references public.master_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index master_sessions_account_idx on public.master_sessions(account_id);
create table public.master_login_limits (
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.master_accounts enable row level security;
alter table public.master_sessions enable row level security;
alter table public.master_login_limits enable row level security;
revoke all on public.master_accounts, public.master_sessions, public.master_login_limits from public, anon, authenticated;
grant all on public.master_accounts, public.master_sessions, public.master_login_limits to service_role;

-- Atomic attempt reservation prevents concurrent requests bypassing the limit.
create function public.reserve_master_login() returns boolean
language plpgsql security invoker set search_path = '' as $$
declare attempts_used integer;
begin
  insert into public.master_login_limits as limits (bucket, window_start, attempts)
  values ('master', now(), 1)
  on conflict (bucket) do update set
    window_start = case when limits.window_start < now() - interval '15 minutes' then now() else limits.window_start end,
    attempts = case when limits.window_start < now() - interval '15 minutes' then 1 else limits.attempts + 1 end
  returning attempts into attempts_used;
  return attempts_used <= 10;
end;
$$;
revoke all on function public.reserve_master_login() from public, anon, authenticated;
grant execute on function public.reserve_master_login() to service_role;
