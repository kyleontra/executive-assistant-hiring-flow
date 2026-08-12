create table if not exists public.hirer_workspaces (
  id uuid primary key,
  edit_token_hash text not null,
  company_name text not null default 'Your company' check (char_length(company_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hiring_jobs (
  id text primary key,
  employer_id uuid not null references public.hirer_workspaces(id) on delete cascade,
  company_name text not null check (char_length(company_name) between 1 and 120),
  title text not null check (char_length(title) between 1 and 180),
  arrangement text not null default 'Remote' check (char_length(arrangement) between 1 and 40),
  employment_type text not null default 'Full-time' check (char_length(employment_type) between 1 and 60),
  location text not null default 'South Africa' check (char_length(location) between 1 and 120),
  pay_min numeric(8,2) not null check (pay_min >= 0),
  pay_max numeric(8,2) not null check (pay_max >= pay_min),
  description text not null check (char_length(description) between 1 and 10000),
  responsibilities jsonb not null default '[]'::jsonb check (jsonb_typeof(responsibilities) = 'array'),
  skills jsonb not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  status text not null default 'active' check (status in ('draft', 'active', 'closed')),
  promoted boolean not null default false,
  promotion_budget numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_profiles (
  user_id uuid primary key,
  email text not null check (char_length(email) between 3 and 254),
  full_name text not null check (char_length(full_name) between 1 and 160),
  calendar_link text not null default '' check (char_length(calendar_link) <= 500),
  experience jsonb not null default '[]'::jsonb check (jsonb_typeof(experience) = 'array'),
  relevant_years numeric(5,1) not null default 0 check (relevant_years >= 0 and relevant_years <= 80),
  summary text not null default '' check (char_length(summary) <= 1000),
  profile_photo_path text not null default '' check (char_length(profile_photo_path) <= 500),
  verification_status text not null default 'draft' check (verification_status in ('draft', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.hiring_jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  status text not null default 'new' check (status in ('new', 'shortlisted', 'interviewing', 'rejected', 'hired')),
  match_score smallint not null default 0 check (match_score between 0 and 100),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_applications_job_candidate_unique unique (job_id, candidate_id)
);

alter table public.candidate_message_threads
  add column if not exists candidate_id uuid;

alter table public.candidate_message_threads
  add column if not exists application_id uuid references public.job_applications(id) on delete set null;

create index if not exists hiring_jobs_employer_status_idx
  on public.hiring_jobs (employer_id, status, created_at desc);

create index if not exists job_applications_job_status_idx
  on public.job_applications (job_id, status, submitted_at desc);

create index if not exists job_applications_candidate_idx
  on public.job_applications (candidate_id, submitted_at desc);

create index if not exists candidate_message_threads_candidate_idx
  on public.candidate_message_threads (candidate_id, updated_at desc);

alter table public.hirer_workspaces enable row level security;
alter table public.hiring_jobs enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.job_applications enable row level security;

revoke all on table public.hirer_workspaces from anon, authenticated;
revoke all on table public.hiring_jobs from anon, authenticated;
revoke all on table public.candidate_profiles from anon, authenticated;
revoke all on table public.job_applications from anon, authenticated;
grant all on table public.hirer_workspaces to service_role;
grant all on table public.hiring_jobs to service_role;
grant all on table public.candidate_profiles to service_role;
grant all on table public.job_applications to service_role;

create policy "Block direct hirer workspace access"
  on public.hirer_workspaces for all to anon, authenticated
  using (false) with check (false);

create policy "Block direct hiring job access"
  on public.hiring_jobs for all to anon, authenticated
  using (false) with check (false);

create policy "Block direct candidate profile access"
  on public.candidate_profiles for all to anon, authenticated
  using (false) with check (false);

create policy "Block direct job application access"
  on public.job_applications for all to anon, authenticated
  using (false) with check (false);

comment on table public.hirer_workspaces is 'Private hirer workspaces accessed through the hiring-platform Edge Function.';
comment on table public.hiring_jobs is 'Server-backed jobs exposed through the hiring-platform Edge Function.';
comment on table public.candidate_profiles is 'Private candidate profiles owned through Supabase Auth and accessed through Edge Functions.';
comment on table public.job_applications is 'Server-backed job applications shared between candidates and hirers through Edge Functions.';

insert into public.hirer_workspaces (id, edit_token_hash, company_name)
values ('00000000-0000-4000-8000-000000000001', repeat('0', 64), 'Hire From SA partners')
on conflict (id) do nothing;

insert into public.hiring_jobs (
  id, employer_id, company_name, title, arrangement, employment_type, location,
  pay_min, pay_max, description, responsibilities, skills, questions, status
) values
  (
    'aster', '00000000-0000-4000-8000-000000000001', 'Aster & Co.', 'Executive Assistant to CEO', 'Remote', 'Full-time', 'South Africa',
    10, 14,
    'Aster & Co. is looking for an experienced Executive Assistant to keep the CEO organised and help the leadership team move quickly.',
    '["Manage a complex CEO calendar and protect focus time","Prepare meeting briefs, notes, and follow-up actions","Coordinate domestic and international travel","Handle professional communication with clients and partners"]'::jsonb,
    '["Calendar management","Executive support","Travel coordination","Google Workspace"]'::jsonb,
    '[{"text":"Tell us about the most complex executive calendar you have managed.","type":"text","options":[]},{"text":"How do you keep an executive’s priorities and follow-ups on track?","type":"text","options":[]},{"text":"Which working schedule can you reliably support?","type":"multiple-choice","options":["US Eastern business hours","South African business hours","Flexible overlap with both"]}]'::jsonb,
    'active'
  ),
  (
    'bright', '00000000-0000-4000-8000-000000000001', 'BrightHouse', 'Senior Executive Assistant', 'Hybrid', 'Full-time', 'Cape Town',
    12, 16,
    'Support two founders at a growing professional-services company. Keep decisions, meetings, and key relationships moving forward.',
    '["Coordinate leadership schedules and off-sites","Own travel, expenses, and meeting logistics","Track company priorities and follow-ups","Support internal communications"]'::jsonb,
    '["Microsoft Office","Project coordination","Expense management","Written communication"]'::jsonb,
    '[{"text":"Tell us about the most complex executive calendar you have managed.","type":"text","options":[]},{"text":"How do you keep an executive’s priorities and follow-ups on track?","type":"text","options":[]},{"text":"Which working schedule can you reliably support?","type":"multiple-choice","options":["US Eastern business hours","South African business hours","Flexible overlap with both"]}]'::jsonb,
    'active'
  ),
  (
    'harbor', '00000000-0000-4000-8000-000000000001', 'Harbor Health', 'Executive Assistant — Operations', 'Remote', 'Contract', 'South Africa',
    11, 15,
    'Support an operations lead during a period of growth with structured, varied work focused on making the team more efficient.',
    '["Maintain operational calendars and reporting deadlines","Schedule stakeholder meetings","Create simple process documents","Manage the shared inbox"]'::jsonb,
    '["Inbox management","Notion","Meeting coordination","Process documentation"]'::jsonb,
    '[{"text":"Tell us about the most complex executive calendar you have managed.","type":"text","options":[]},{"text":"How do you keep an executive’s priorities and follow-ups on track?","type":"text","options":[]},{"text":"Which working schedule can you reliably support?","type":"multiple-choice","options":["US Eastern business hours","South African business hours","Flexible overlap with both"]}]'::jsonb,
    'active'
  ),
  (
    'mosaic', '00000000-0000-4000-8000-000000000001', 'Mosaic Studio', 'Part-time Executive Assistant', 'Remote', 'Part-time', 'South Africa',
    9, 12,
    'Support a creative director with administrative organisation, client follow-up, and weekly planning.',
    '["Organise the weekly schedule","Prepare client meeting notes","Follow up on actions and invoices","Keep files and contacts current"]'::jsonb,
    '["Calendar management","Client communication","Attention to detail","Asana"]'::jsonb,
    '[{"text":"Tell us about the most complex executive calendar you have managed.","type":"text","options":[]},{"text":"How do you keep an executive’s priorities and follow-ups on track?","type":"text","options":[]},{"text":"Which working schedule can you reliably support?","type":"multiple-choice","options":["US Eastern business hours","South African business hours","Flexible overlap with both"]}]'::jsonb,
    'active'
  )
on conflict (id) do nothing;
