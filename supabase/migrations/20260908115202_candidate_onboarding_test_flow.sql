create table public.candidate_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  identity_completed_at timestamptz,
  platform_completed_at timestamptz,
  intro_completed_at timestamptz,
  intro_path text,
  intro_consent_at timestamptz,
  intro_skipped_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint intro_requires_consent check (intro_path is null or intro_consent_at is not null),
  constraint intro_owned_path check (intro_path is null or intro_path like user_id::text || '/%')
);
alter table public.candidate_onboarding enable row level security;
revoke all on public.candidate_onboarding from anon, authenticated;
grant all on public.candidate_onboarding to service_role;
comment on table public.candidate_onboarding is 'Server-owned candidate guide progress and opt-in employer-facing introductions. No agreement acceptance is collected during this test.';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-introductions', 'candidate-introductions', false, 26214400, array['video/mp4','video/webm']);
