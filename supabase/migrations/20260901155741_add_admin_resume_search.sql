create or replace function public.search_admin_candidate_resumes(
  search_query text,
  verification_filter text default '',
  result_limit integer default 100
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  verification_status text,
  relevant_years numeric,
  summary text,
  resume_file_name text,
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
      lower(trim(left(coalesce(verification_filter, ''), 20))) as cleaned_status,
      greatest(1, least(coalesce(result_limit, 100), 200)) as limited_count
  ), query_value as (
    select
      cleaned_query,
      case when cleaned_status in ('draft', 'pending', 'verified', 'rejected') then cleaned_status else '' end as cleaned_status,
      limited_count,
      case when cleaned_query = '' then null else websearch_to_tsquery('english', cleaned_query) end as query
    from parameters
  )
  select
    profile.user_id,
    profile.full_name,
    profile.email,
    profile.verification_status,
    profile.relevant_years,
    profile.summary,
    profile.resume_file_name,
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
  where profile.resume_index_version > 0
    and profile.resume_path <> ''
    and (query_value.cleaned_status = '' or profile.verification_status = query_value.cleaned_status)
    and (query_value.query is null or profile.resume_search_vector @@ query_value.query)
  order by
    case when query_value.query is null then 0::real else ts_rank_cd(profile.resume_search_vector, query_value.query) end desc,
    greatest(profile.resume_years_experience, profile.relevant_years) desc,
    profile.resume_indexed_at desc
  limit (select limited_count from query_value);
$$;

revoke all on function public.search_admin_candidate_resumes(text, text, integer) from public, anon, authenticated;
grant execute on function public.search_admin_candidate_resumes(text, text, integer) to service_role;

comment on function public.search_admin_candidate_resumes(text, text, integer) is 'Service-role-only ranked search across all indexed candidate resumes for the private admin dashboard.';
