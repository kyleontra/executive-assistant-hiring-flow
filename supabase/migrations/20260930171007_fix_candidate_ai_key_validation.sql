-- PostgreSQL repetition bounds cannot exceed 255. Validate length separately.
create or replace function hirefromsa_private.save_candidate_export_key(new_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required'; end if;
  if new_key is null or length(new_key) < 23 or length(new_key) > 303 or new_key !~ '^sk-[A-Za-z0-9_-]+$' then raise exception 'Invalid key'; end if;
  perform pg_advisory_xact_lock(772436912);
  select id into secret_id from vault.secrets where name = 'hirefromsa_candidate_export_openai';
  if secret_id is null then
    perform vault.create_secret(new_key, 'hirefromsa_candidate_export_openai', 'OpenAI key for private candidate resume spreadsheet generation');
  else
    perform vault.update_secret(secret_id, new_key);
  end if;
end;
$$;
revoke all on function hirefromsa_private.save_candidate_export_key(text) from public, anon, authenticated;
grant execute on function hirefromsa_private.save_candidate_export_key(text) to service_role;
