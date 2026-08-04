create table if not exists public.interview_schedulers (
  id uuid primary key,
  edit_token_hash text not null,
  event_name text not null check (char_length(event_name) between 1 and 80),
  duration_minutes smallint not null check (duration_minutes in (15, 30, 45, 60)),
  timezone text not null check (char_length(timezone) between 1 and 80),
  meeting_location text not null check (char_length(meeting_location) between 1 and 180),
  availability jsonb not null check (jsonb_typeof(availability) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_bookings (
  id uuid primary key default gen_random_uuid(),
  scheduler_id uuid not null references public.interview_schedulers(id) on delete cascade,
  event_name text not null,
  duration_minutes smallint not null,
  timezone text not null,
  meeting_location text not null,
  guest_name text not null check (char_length(guest_name) between 1 and 120),
  guest_email text not null check (char_length(guest_email) between 3 and 254),
  guest_note text not null default '' check (char_length(guest_note) <= 1000),
  role_name text not null default '' check (char_length(role_name) <= 180),
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint interview_bookings_valid_range check (end_at > start_at),
  constraint interview_bookings_one_guest_per_slot unique (scheduler_id, start_at)
);

create index if not exists interview_bookings_scheduler_start_idx
  on public.interview_bookings (scheduler_id, start_at);

alter table public.interview_schedulers enable row level security;
alter table public.interview_bookings enable row level security;

revoke all on table public.interview_schedulers from anon, authenticated;
revoke all on table public.interview_bookings from anon, authenticated;
grant all on table public.interview_schedulers to service_role;
grant all on table public.interview_bookings to service_role;

comment on table public.interview_schedulers is 'Private scheduler settings accessed only through the interview-scheduler Edge Function.';
comment on table public.interview_bookings is 'Private interview bookings accessed only through the interview-scheduler Edge Function.';
