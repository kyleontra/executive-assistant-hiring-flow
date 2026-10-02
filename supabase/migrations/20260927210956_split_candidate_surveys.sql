alter table public.candidate_profiles
  add column job_industry_preferences text not null default '' check (char_length(job_industry_preferences) <= 2000),
  add column desired_positions text not null default '' check (char_length(desired_positions) <= 2000),
  add column career_survey_completed_at timestamptz,
  add column monthly_income_goal_zar numeric(12,2) check (monthly_income_goal_zar > 0 and monthly_income_goal_zar <= 10000000),
  add column employment_preference text not null default '' check (employment_preference in ('', 'full_time', 'part_time', 'contractor', 'open_to_all'));

comment on column public.candidate_profiles.monthly_income_goal_zar is 'Candidate monthly income goal in South African rand (ZAR); separate from legacy USD hourly rates.';
comment on column public.candidate_profiles.career_survey_completed_at is 'First onboarding survey saved; preferences_completed_at is set only after the second survey.';
