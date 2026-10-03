export function identityApproved(profile) {
  return profile?.verification_status === 'verified' || profile?.verification_bypass === true;
}
export function onboardingStage(profile, progress = {}) {
  if (!profile?.resume_path) return 'resume';
  if (!identityApproved(profile)) {
    const identitySubmitted = Boolean(progress.identity_video_uploaded_at)
      && (profile?.verification_status !== 'rejected' || !progress.contract_accepted_at);
    if (!identitySubmitted) return 'verification';
    if (!progress.identity_completed_at) return 'identity';
    if (!progress.platform_completed_at) return 'platform';
    if (!progress.contract_accepted_at || profile?.verification_status !== 'pending') return 'contract';
    return 'waiting';
  }
  if (profile.onboarding_preferences_required && !profile.preferences_completed_at) return 'preferences';
  // Legacy approved candidates may not have gone through the pre-contract flow.
  if (!progress.platform_completed_at && !progress.contract_accepted_at) return 'platform';
  if (!progress.intro_completed_at) return 'intro';
  if (!progress.intro_path && !progress.intro_skipped_at) return 'recording';
  return 'complete';
}
export async function validIntroFile(file) {
  if (!(file instanceof Blob) || !file.size || file.size > 25 * 1024 * 1024) return false;
  const type = file.type.split(';')[0].toLowerCase();
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (type === 'video/webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (type === 'video/mp4') return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  return false;
}

// Rejected submissions need newly uploaded photos, not a reference cached by a browser.
export function pendingPhotoReview(profile, progress = {}) {
  const reference = String(progress.review_reference || '');
  if (!/^SA-[A-Z0-9]{8}$/.test(reference)) return '';
  if (profile?.verification_status === 'rejected') {
    const photosAt = Date.parse(progress.identity_photos_uploaded_at || '');
    const videoAt = Date.parse(progress.identity_video_uploaded_at || '') || 0;
    if (!(photosAt > videoAt)) return '';
  }
  return reference;
}
