alter table public.candidate_profiles
  add column if not exists share_slug text;

update public.candidate_profiles
set share_slug = replace(gen_random_uuid()::text, '-', '')
where share_slug is null
   or share_slug !~ '^[0-9a-f]{32}$';

alter table public.candidate_profiles
  alter column share_slug set default replace(gen_random_uuid()::text, '-', ''),
  alter column share_slug set not null;

create unique index if not exists candidate_profiles_share_slug_unique
  on public.candidate_profiles (share_slug);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidate_profiles_share_slug_format'
      and conrelid = 'public.candidate_profiles'::regclass
  ) then
    alter table public.candidate_profiles
      add constraint candidate_profiles_share_slug_format
      check (share_slug ~ '^[0-9a-f]{32}$');
  end if;
end
$$;

comment on column public.candidate_profiles.share_slug is
  'Unpredictable stable identifier used for the candidate share page. It is not an authentication credential.';
