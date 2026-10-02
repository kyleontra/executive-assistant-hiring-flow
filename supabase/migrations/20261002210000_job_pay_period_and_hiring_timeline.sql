-- Job posting flow v2: store whether pay is hourly or monthly, and the hirer's hiring timeline.
alter table public.hiring_jobs
  add column if not exists pay_period text not null default 'hour',
  add column if not exists hiring_timeline text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hiring_jobs_pay_period_check') then
    alter table public.hiring_jobs
      add constraint hiring_jobs_pay_period_check check (pay_period in ('hour', 'month'));
  end if;
end $$;
