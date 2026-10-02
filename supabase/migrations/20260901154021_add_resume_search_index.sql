alter table public.candidate_profiles
  add column if not exists resume_job_titles text[] not null default '{}'::text[],
  add column if not exists resume_software text[] not null default '{}'::text[],
  add column if not exists resume_skills text[] not null default '{}'::text[],
  add column if not exists resume_industries text[] not null default '{}'::text[],
  add column if not exists resume_companies text[] not null default '{}'::text[],
  add column if not exists resume_education text[] not null default '{}'::text[],
  add column if not exists resume_certifications text[] not null default '{}'::text[],
  add column if not exists resume_languages text[] not null default '{}'::text[],
  add column if not exists resume_keywords text[] not null default '{}'::text[],
  add column if not exists resume_summary text not null default '' check (char_length(resume_summary) <= 500),
  add column if not exists resume_years_experience numeric(4,1) not null default 0 check (resume_years_experience between 0 and 50),
  add column if not exists resume_search_text text not null default '' check (char_length(resume_search_text) <= 120000),
  add column if not exists resume_index_version smallint not null default 0 check (resume_index_version >= 0),
  add column if not exists resume_indexed_at timestamptz;

alter table public.candidate_profiles
  add column if not exists resume_search_vector tsvector
  generated always as (to_tsvector('english'::regconfig, coalesce(resume_search_text, ''))) stored;

create index if not exists candidate_profiles_resume_search_idx
  on public.candidate_profiles using gin (resume_search_vector);

create or replace function public.search_candidate_resumes(search_query text, result_limit integer default 30)
returns table (
  user_id uuid,
  full_name text,
  experience jsonb,
  relevant_years numeric,
  summary text,
  profile_photo_path text,
  verification_status text,
  resume_job_titles text[],
  resume_software text[],
  resume_skills text[],
  resume_industries text[],
  resume_companies text[],
  resume_education text[],
  resume_certifications text[],
  resume_languages text[],
  resume_keywords text[],
  resume_summary text,
  resume_years_experience numeric,
  resume_indexed_at timestamptz,
  search_rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with parameters as (
    select
      trim(left(coalesce(search_query, ''), 100)) as cleaned_query,
      greatest(1, least(coalesce(result_limit, 30), 50)) as limited_count
  ), query_value as (
    select
      cleaned_query,
      limited_count,
      case when cleaned_query = '' then null else websearch_to_tsquery('english', cleaned_query) end as query
    from parameters
  )
  select
    profile.user_id,
    profile.full_name,
    profile.experience,
    profile.relevant_years,
    profile.summary,
    profile.profile_photo_path,
    profile.verification_status,
    profile.resume_job_titles,
    profile.resume_software,
    profile.resume_skills,
    profile.resume_industries,
    profile.resume_companies,
    profile.resume_education,
    profile.resume_certifications,
    profile.resume_languages,
    profile.resume_keywords,
    profile.resume_summary,
    profile.resume_years_experience,
    profile.resume_indexed_at,
    case when query_value.query is null then 0::real else ts_rank_cd(profile.resume_search_vector, query_value.query) end as search_rank
  from public.candidate_profiles as profile
  cross join query_value
  where profile.verification_status = 'verified'
    and profile.resume_index_version > 0
    and (query_value.query is null or profile.resume_search_vector @@ query_value.query)
  order by
    case when query_value.query is null then 0::real else ts_rank_cd(profile.resume_search_vector, query_value.query) end desc,
    greatest(profile.resume_years_experience, profile.relevant_years) desc,
    profile.updated_at desc
  limit (select limited_count from query_value);
$$;

revoke all on function public.search_candidate_resumes(text, integer) from public, anon, authenticated;
grant execute on function public.search_candidate_resumes(text, integer) to service_role;

comment on column public.candidate_profiles.resume_search_vector is 'Private full-text index generated from redacted resume content and extracted resume metadata.';
comment on function public.search_candidate_resumes(text, integer) is 'Service-role-only ranked search over verified, indexed candidate resumes.';
