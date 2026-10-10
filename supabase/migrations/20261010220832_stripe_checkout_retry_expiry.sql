alter table public.va_payment_invoices add column checkout_expires_at bigint;
alter table public.va_payment_invoices add column checkout_origin text;
drop function public.claim_va_checkout(uuid,uuid,text);
create function public.claim_va_checkout(invoice_id uuid,owner_id uuid,expected_session text,return_origin text)
returns table(generation integer,expires_at bigint,origin text)
language sql security invoker set search_path = '' as $$
  update public.va_payment_invoices
  set checkout_locked_until = now() + interval '90 seconds',
      checkout_generation = checkout_generation + case when checkout_session_id is not null or checkout_expires_at <= extract(epoch from now()) then 1 else 0 end,
      checkout_expires_at = case when checkout_session_id is not null or checkout_expires_at is null or checkout_expires_at <= extract(epoch from now()) then floor(extract(epoch from now()))::bigint + 3600 else checkout_expires_at end,
      checkout_origin = case when checkout_session_id is not null or checkout_origin is null or checkout_expires_at <= extract(epoch from now()) then return_origin else checkout_origin end,
      checkout_session_id = null
  where id = invoice_id and employer_user_id = owner_id and status = 'open'
    and checkout_session_id is not distinct from expected_session
    and (checkout_locked_until is null or checkout_locked_until < now())
    and return_origin in ('https://www.hirefromsa.com','https://hirefromsa.com','http://127.0.0.1:5173','http://localhost:5173')
  returning checkout_generation,checkout_expires_at,checkout_origin;
$$;
revoke all on function public.claim_va_checkout(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_va_checkout(uuid,uuid,text,text) to service_role;
