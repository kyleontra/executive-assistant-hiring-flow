-- Jobs with board_hidden stay on their hirer's dashboard but never appear on the public job board
-- or accept applications (used for sample jobs on a single hirer's account).
alter table public.hiring_jobs add column if not exists board_hidden boolean not null default false;
