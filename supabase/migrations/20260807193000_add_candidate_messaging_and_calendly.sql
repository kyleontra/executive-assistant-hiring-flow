alter table public.interview_schedulers
  add column if not exists calendly_url text not null default '';

alter table public.interview_schedulers
  drop constraint if exists interview_schedulers_calendly_url_length;

alter table public.interview_schedulers
  add constraint interview_schedulers_calendly_url_length
  check (char_length(calendly_url) <= 300);

create table if not exists public.candidate_message_threads (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null,
  edit_token_hash text not null,
  candidate_key text not null check (char_length(candidate_key) between 1 and 180),
  candidate_name text not null check (char_length(candidate_name) between 1 and 120),
  role_name text not null default '' check (char_length(role_name) <= 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_message_threads_employer_candidate_unique unique (employer_id, candidate_key)
);

create table if not exists public.candidate_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.candidate_message_threads(id) on delete cascade,
  sender text not null check (sender in ('employer', 'candidate')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists candidate_messages_thread_created_idx
  on public.candidate_messages (thread_id, created_at);

alter table public.candidate_message_threads enable row level security;
alter table public.candidate_messages enable row level security;

revoke all on table public.candidate_message_threads from anon, authenticated;
revoke all on table public.candidate_messages from anon, authenticated;
grant all on table public.candidate_message_threads to service_role;
grant all on table public.candidate_messages to service_role;

create policy "Block direct message thread access"
  on public.candidate_message_threads
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "Block direct candidate message access"
  on public.candidate_messages
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.candidate_message_threads is 'Private employer candidate threads accessed only through the candidate-messages Edge Function.';
comment on table public.candidate_messages is 'Private candidate messages accessed only through the candidate-messages Edge Function.';
