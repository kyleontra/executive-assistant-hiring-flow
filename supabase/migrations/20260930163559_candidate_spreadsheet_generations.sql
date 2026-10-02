create table public.candidate_spreadsheet_generations (
  id uuid primary key,
  user_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  fingerprint text not null check (length(fingerprint) = 64),
  prompt text not null check (length(prompt) between 1 and 6000),
  model text not null,
  status text not null default 'pending' check (status in ('pending','complete','failed')),
  result jsonb,
  response_id text,
  usage jsonb,
  error text not null default '',
  created_at timestamptz not null default now(),
  generated_at timestamptz,
  constraint candidate_spreadsheet_complete_result check (status <> 'complete' or (result is not null and generated_at is not null))
);
create unique index candidate_spreadsheet_active_source on public.candidate_spreadsheet_generations(user_id,fingerprint) where status in ('pending','complete');
alter table public.candidate_spreadsheet_generations enable row level security;
revoke all on public.candidate_spreadsheet_generations from public, anon, authenticated;
grant select, insert, update on public.candidate_spreadsheet_generations to service_role;
comment on table public.candidate_spreadsheet_generations is 'Private resume spreadsheet generations. Accessible only through authenticated admin-review actions.';
