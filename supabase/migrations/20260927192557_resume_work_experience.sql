alter table public.candidate_profiles
  add column resume_experience jsonb not null default '[]'::jsonb
  check (jsonb_typeof(resume_experience) = 'array' and jsonb_array_length(resume_experience) <= 20);

comment on column public.candidate_profiles.resume_experience is
  'Work history parsed from the contact-redacted resume; separate from candidate-entered experience.';
