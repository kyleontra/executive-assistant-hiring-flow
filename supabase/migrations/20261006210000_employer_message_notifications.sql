-- Where to email a hirer when a VA messages them. Hirer accounts fill this in when they open
-- their workspace; the master account's address is set by hand.
alter table public.hirer_workspaces add column if not exists notify_email text;
alter table public.master_accounts add column if not exists notify_email text;
