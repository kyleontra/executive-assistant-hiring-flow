alter table public.candidate_profiles
  add column if not exists referral_source text not null default '' check (referral_source in ('', 'search', 'social', 'friend', 'job-board', 'other')),
  add column if not exists referral_other text not null default '' check (char_length(referral_other) <= 240),
  add column if not exists verification_bypass boolean not null default false;

update storage.buckets
set
  file_size_limit = 2097152,
  allowed_mime_types = array['text/plain']::text[]
where id = 'candidate-resumes';

comment on column public.candidate_profiles.referral_source is 'Candidate response to where they heard about Hire From SA.';
comment on column public.candidate_profiles.referral_other is 'Candidate-supplied referral detail when Other is selected.';
comment on column public.candidate_profiles.verification_bypass is 'Server-controlled flag indicating that later identity verification steps were bypassed.';
comment on column public.candidate_profiles.resume_path is 'Private Supabase Storage path for the candidate resume converted to a redacted text file.';
