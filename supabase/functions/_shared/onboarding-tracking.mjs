export const ONBOARDING_STEPS = [
  ['account', 'Account created'], ['email', 'Email confirmed'], ['welcome', 'Welcome video'],
  ['resume', 'Resume'], ['photo', 'Professional photo'], ['id_photos', 'ID photos'],
  ['id_video', 'ID video'], ['identity', 'Verification guide'], ['platform', 'Platform guide'],
  ['contract', 'Contract'], ['next_steps', 'Next steps video'], ['review', 'Identity approval'], ['career', 'Ideal jobs and industries'],
  ['preferences', 'Income, employment and availability'], ['intro', 'Intro video guide'], ['recording', 'Introduction video'],
];

export function trackingSummary(user, profile = {}, progress = {}, tracked = []) {
  const evidence = {
    account: user.created_at, email: user.email_confirmed_at,
    welcome: tracked.find(row => row.step === 'welcome')?.completed_at,
    next_steps: tracked.find(row => row.step === 'next_steps')?.completed_at,
    resume: profile.resume_path, photo: profile.profile_photo_path,
    id_photos: progress.identity_photos_uploaded_at, id_video: progress.identity_video_uploaded_at,
    identity: progress.identity_completed_at, platform: progress.platform_completed_at,
    contract: progress.contract_accepted_at,
    review: profile.verification_status === 'verified' || profile.verification_bypass,
    career: profile.career_survey_completed_at, preferences: profile.preferences_completed_at,
    intro: progress.intro_completed_at || tracked.find(row => row.step === 'intro')?.completed_at, recording: progress.intro_path || progress.intro_skipped_at,
  };
  const timestamps = { ...evidence, resume: null, photo: null, review: null, recording: progress.intro_consent_at || progress.intro_skipped_at };
  const steps = ONBOARDING_STEPS.map(([id, label]) => {
    const row = tracked.find(item => item.step === id) || {};
    const complete = Boolean(evidence[id]);
    const skipped = id === 'recording' && Boolean(progress.intro_skipped_at) && !progress.intro_path;
    const status = skipped ? 'skipped' : complete ? 'complete' : id === 'review' && profile.verification_status === 'rejected' ? 'needs_update' : row.first_seen_at ? 'started' : 'not_started';
    return { id, label, status, firstSeenAt: row.first_seen_at || null, lastSeenAt: row.last_seen_at || null,
      completedAt: complete ? row.completed_at || timestamps[id] || null : null, errors: row.error_count || 0 };
  });
  const dates = [user.created_at, profile.updated_at, progress.updated_at, ...tracked.map(row => row.last_seen_at)].filter(Boolean).sort();
  return { id: user.id, name: profile.full_name || user.user_metadata?.full_name || [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || user.email,
    email: user.email, verificationStatus: profile.verification_status || 'draft', steps,
    completed: steps.filter(step => ['complete', 'skipped'].includes(step.status)).length,
    lastActivityAt: dates.at(-1) || null, errors: steps.reduce((sum, step) => sum + step.errors, 0) };
}
