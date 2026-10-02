create function public.saved_candidate_spreadsheet_rows(candidate_ids uuid[])
returns table(user_id uuid, result jsonb, generation_id uuid, generated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select distinct on (g.user_id) g.user_id, g.result, g.id, g.generated_at
  from public.candidate_spreadsheet_generations g
  where g.user_id = any(candidate_ids) and g.status = 'complete'
  order by g.user_id, g.generated_at desc, g.created_at desc, g.id;
$$;
revoke all on function public.saved_candidate_spreadsheet_rows(uuid[]) from public, anon, authenticated;
grant execute on function public.saved_candidate_spreadsheet_rows(uuid[]) to service_role;
create index candidate_spreadsheet_latest_complete on public.candidate_spreadsheet_generations(user_id, generated_at desc) where status = 'complete';
