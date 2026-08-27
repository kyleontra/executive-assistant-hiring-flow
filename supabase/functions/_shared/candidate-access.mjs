// These values come from the private profile record, never request metadata.
// "pending" is set only after the server accepts the ID photos and video.
export function candidateAccess(profile = {}) {
  const resumeRequired = !profile?.resume_path;
  const verificationComplete = Boolean(profile?.verification_bypass)
    || profile?.verification_status === 'verified'
    || (profile?.verification_status === 'pending' && Boolean(profile?.profile_photo_path));
  return { resumeRequired, verificationComplete, applicationReady: !resumeRequired && verificationComplete };
}
