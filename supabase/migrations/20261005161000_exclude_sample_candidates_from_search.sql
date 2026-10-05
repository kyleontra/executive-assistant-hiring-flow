-- Sample applicant profiles (emails ending in @example.invalid) exist only to fill one hirer's demo
-- dashboard; they must never appear in any hirer's talent search.
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
    and profile.email not like '%@example.invalid'
    and profile.resume_index_version > 0
    and (query_value.query is null or profile.resume_search_vector @@ query_value.query)
  order by
    case when query_value.query is null then 0::real else ts_rank_cd(profile.resume_search_vector, query_value.query) end desc,
    greatest(profile.resume_years_experience, profile.relevant_years) desc,
    profile.updated_at desc
  limit (select limited_count from query_value);
$$;
