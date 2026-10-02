alter table public.candidate_profiles
  add column portfolio_links text[] not null default '{}'
  constraint candidate_profiles_portfolio_links_limit check (cardinality(portfolio_links) <= 5);

comment on column public.candidate_profiles.portfolio_links is
  'Optional portfolio and work sample URLs, shown on the candidate public profile.';
