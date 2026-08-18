alter table public.candidate_profiles
  add column if not exists resume_path text not null default '' check (char_length(resume_path) <= 500);

alter table public.candidate_profiles
  add column if not exists resume_file_name text not null default '' check (char_length(resume_file_name) <= 255);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-resumes',
  'candidate-resumes',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.candidate_profiles.resume_path is 'Private Supabase Storage path for the candidate resume.';
comment on column public.candidate_profiles.resume_file_name is 'Original display name for the candidate resume.';
