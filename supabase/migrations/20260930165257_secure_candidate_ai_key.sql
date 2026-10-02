create schema if not exists hirefromsa_private;
revoke all on schema hirefromsa_private from public, anon, authenticated;
grant usage on schema hirefromsa_private to service_role;

create function hirefromsa_private.candidate_export_key()
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required'; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = 'hirefromsa_candidate_export_openai' limit 1);
end;
$$;

create function hirefromsa_private.save_candidate_export_key(new_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required'; end if;
  if new_key !~ '^sk-[A-Za-z0-9_-]{20,300}$' then raise exception 'Invalid key'; end if;
  perform pg_advisory_xact_lock(772436912);
  select id into secret_id from vault.secrets where name = 'hirefromsa_candidate_export_openai';
  if secret_id is null then
    perform vault.create_secret(new_key, 'hirefromsa_candidate_export_openai', 'OpenAI key for private candidate resume spreadsheet generation');
  else
    perform vault.update_secret(secret_id, new_key);
  end if;
end;
$$;
revoke all on function hirefromsa_private.candidate_export_key() from public, anon, authenticated;
revoke all on function hirefromsa_private.save_candidate_export_key(text) from public, anon, authenticated;
grant execute on function hirefromsa_private.candidate_export_key() to service_role;
grant execute on function hirefromsa_private.save_candidate_export_key(text) to service_role;

-- PostgREST exposes only these service-only wrappers. The private functions
-- constrain access to the single candidate export secret, never arbitrary Vault data.
create function public.candidate_export_key()
returns text language sql security invoker set search_path = '' as $$
  select hirefromsa_private.candidate_export_key();
$$;
create function public.save_candidate_export_key(new_key text)
returns void language sql security invoker set search_path = '' as $$
  select hirefromsa_private.save_candidate_export_key(new_key);
$$;
revoke all on function public.candidate_export_key() from public, anon, authenticated;
revoke all on function public.save_candidate_export_key(text) from public, anon, authenticated;
grant execute on function public.candidate_export_key() to service_role;
grant execute on function public.save_candidate_export_key(text) to service_role;
