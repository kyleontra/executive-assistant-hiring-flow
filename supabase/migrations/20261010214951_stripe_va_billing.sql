create table public.va_payment_invoices (
  id uuid primary key default gen_random_uuid(),
  employer_user_id uuid not null references auth.users(id),
  candidate_id uuid not null references public.candidate_profiles(user_id),
  candidate_name text not null,
  description text not null check (char_length(description) between 1 and 300),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  hours numeric(6,2) not null check (hours > 0 and hours <= 744),
  rate_minor integer not null check (rate_minor > 0 and rate_minor <= 100000),
  amount_minor integer not null check (amount_minor between 100 and 10000000),
  currency text not null check (currency in ('usd','zar','gbp','eur')),
  status text not null default 'open' check (status in ('open','processing','paid','partially_refunded','refunded')),
  livemode boolean not null,
  checkout_session_id text unique,
  payment_intent_id text unique,
  checkout_generation integer not null default 1,
  checkout_locked_until timestamptz,
  created_by uuid not null references public.master_accounts(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  check (amount_minor = round(hours * rate_minor))
);
create index va_payment_invoices_owner on public.va_payment_invoices(employer_user_id,created_at desc);
alter table public.va_payment_invoices enable row level security;
revoke all on public.va_payment_invoices from public,anon,authenticated;
grant all on public.va_payment_invoices to service_role;
create or replace function public.claim_va_checkout(invoice_id uuid,owner_id uuid,expected_session text)
returns table(generation integer)
language sql security invoker set search_path = '' as $$
  update public.va_payment_invoices
  set checkout_locked_until = now() + interval '90 seconds',
      checkout_generation = checkout_generation + case when checkout_session_id is null then 0 else 1 end,
      checkout_session_id = null
  where id = invoice_id and employer_user_id = owner_id and status = 'open'
    and checkout_session_id is not distinct from expected_session
    and (checkout_locked_until is null or checkout_locked_until < now())
  returning checkout_generation;
$$;
revoke all on function public.claim_va_checkout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_va_checkout(uuid,uuid,text) to service_role;
comment on table public.va_payment_invoices is 'Employer payments for VA services. Paid means collected by Stripe, not disbursed to a VA.';
