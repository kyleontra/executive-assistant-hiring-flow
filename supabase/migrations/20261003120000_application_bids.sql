-- Apply v2: candidates bid on a job. Amounts are stored in the candidate's terms (what they are paid);
-- the hirer view adds the platform fee back when it reads them.
alter table public.job_applications
  add column if not exists bid_rate numeric,
  add column if not exists bid_min numeric,
  add column if not exists bid_max numeric,
  add column if not exists intro_message text;
