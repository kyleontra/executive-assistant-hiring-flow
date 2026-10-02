alter table public.candidate_profiles
  add column requested_rate_min_usd numeric(7,2),
  add column requested_rate_max_usd numeric(7,2),
  add column available_hours_per_week smallint,
  add column location text;

alter table public.candidate_profiles
  add constraint candidate_profile_requested_rate_valid check (
    (requested_rate_min_usd is null and requested_rate_max_usd is null)
    or (requested_rate_min_usd > 0 and requested_rate_max_usd >= requested_rate_min_usd and requested_rate_max_usd <= 1000)
  ),
  add constraint candidate_profile_weekly_hours_valid check (
    available_hours_per_week is null or available_hours_per_week between 1 and 80
  ),
  add constraint candidate_profile_location_length check (
    location is null or char_length(location) <= 120
  );
