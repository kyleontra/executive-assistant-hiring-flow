-- VA job questions: time zones the VA is willing to work in, and an optional nickname clients can pronounce.
alter table public.candidate_profiles
  add column if not exists work_time_zones text[] not null default '{}',
  add column if not exists nickname text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'candidate_profiles_work_time_zones_check') then
    alter table public.candidate_profiles
      add constraint candidate_profiles_work_time_zones_check check (work_time_zones <@ array['EST', 'PST', 'SAST', 'ANY']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'candidate_profiles_nickname_length_check') then
    alter table public.candidate_profiles
      add constraint candidate_profiles_nickname_length_check check (nickname is null or char_length(nickname) <= 30);
  end if;
end $$;
