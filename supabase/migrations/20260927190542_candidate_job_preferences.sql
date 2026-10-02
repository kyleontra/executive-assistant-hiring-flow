alter table public.candidate_profiles
  add column ideal_job_titles text[] not null default '{}'::text[],
  add column start_availability text not null default '',
  add column preferred_job_note text not null default '',
  add column onboarding_preferences_required boolean not null default false,
  add column preferences_completed_at timestamptz;

-- Existing candidates keep their current access. Newly created profiles complete this step.
alter table public.candidate_profiles
  alter column onboarding_preferences_required set default true;

alter table public.candidate_profiles
  add constraint candidate_profile_ideal_job_titles_valid check (cardinality(ideal_job_titles) <= 5),
  add constraint candidate_profile_start_availability_valid check (start_availability in ('', 'immediately', 'two_weeks', 'one_month', 'flexible')),
  add constraint candidate_profile_preferred_job_note_length check (char_length(preferred_job_note) <= 400);
