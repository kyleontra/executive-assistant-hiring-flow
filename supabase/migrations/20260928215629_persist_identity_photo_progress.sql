alter table public.candidate_onboarding
  add column identity_photos_uploaded_at timestamptz;
comment on column public.candidate_onboarding.identity_photos_uploaded_at is
  'Server-saved ID photo progress, allowing the account to resume before the video is uploaded.';
-- Existing reviews with a submitted video already have ID photos.
update public.candidate_onboarding
set identity_photos_uploaded_at = identity_video_uploaded_at
where review_reference is not null and identity_video_uploaded_at is not null;
