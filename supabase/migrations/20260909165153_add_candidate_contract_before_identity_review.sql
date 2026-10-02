alter table public.candidate_onboarding
  add column identity_video_uploaded_at timestamptz,
  add column review_reference text,
  add column contract_accepted_at timestamptz,
  add column contract_name text,
  add column contract_version text;

alter table public.candidate_onboarding
  add constraint candidate_onboarding_review_reference_format
    check (review_reference is null or review_reference ~ '^SA-[A-Z0-9]{8}$'),
  add constraint candidate_onboarding_contract_complete
    check (
      (contract_accepted_at is null and contract_name is null and contract_version is null)
      or
      (contract_accepted_at is not null and char_length(contract_name) between 2 and 160 and char_length(contract_version) between 1 and 80)
    );

insert into public.candidate_onboarding (user_id, identity_video_uploaded_at, updated_at)
select user_id, now(), now()
from public.candidate_profiles
where verification_status = 'pending'
on conflict (user_id) do update
set identity_video_uploaded_at = coalesce(public.candidate_onboarding.identity_video_uploaded_at, excluded.identity_video_uploaded_at),
    updated_at = excluded.updated_at;

comment on column public.candidate_onboarding.identity_video_uploaded_at is 'The private ID video was stored, but the review does not enter pending status until the candidate signs the contract.';
comment on column public.candidate_onboarding.contract_accepted_at is 'Server-recorded time at which the candidate accepted the versioned candidate platform contract.';
comment on column public.candidate_onboarding.contract_name is 'Full legal name typed by the authenticated candidate when accepting the contract.';
comment on column public.candidate_onboarding.contract_version is 'Immutable application-defined version of the accepted candidate platform contract.';
comment on table public.candidate_onboarding is 'Server-owned candidate onboarding progress, versioned contract acceptance, and opt-in employer-facing introductions.';
