// These values come from the private profile record, never request metadata.
// Submission is not approval: pending candidates remain paused after signing.
export function candidateAccess(profile = {}) {
  const resumeRequired = !profile?.resume_path;
  const verificationComplete = Boolean(profile?.verification_bypass)
    || profile?.verification_status === 'verified';
  const preferencesComplete = !profile?.onboarding_preferences_required || Boolean(profile?.preferences_completed_at);
  return { resumeRequired, verificationComplete, applicationReady: !resumeRequired && verificationComplete && preferencesComplete };
}
