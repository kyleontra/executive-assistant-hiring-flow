// Approval and delivery are separate: a mail failure must remain visible and retryable.
export async function notifyApproval(admin, profile, { projectUrl, serviceKey, fetchImpl = fetch }) {
  const { data, error } = await admin.auth.admin.getUserById(profile.user_id);
  if (error || !data?.user?.email || !data.user.email_confirmed_at || data.user.app_metadata?.account_role !== 'candidate') {
    return { emailSent: false, emailError: 'No active, verified candidate login is linked to this profile.' };
  }
  const user = data.user;
  const metadata = user.app_metadata || {};
  const approvalVersion = profile.updated_at;
  if (metadata.verification_email_approval_version === approvalVersion) return { emailSent: true };
  try {
    if (!projectUrl || !serviceKey) throw new Error('The approval email service is not configured.');
    const response = await fetchImpl(`${projectUrl}/functions/v1/send-auth-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-email-key': serviceKey },
      body: JSON.stringify({ type: 'verification_approved', recipient: user.email, candidateName: profile.full_name || '' }),
    });
    if (!response.ok || !(await response.json()).sent) throw new Error('The email service did not confirm the approval email.');
    const { error: saveError } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...metadata, verification_email_approval_version: approvalVersion, verification_email_sent_at: new Date().toISOString(), verification_email_error: null } });
    if (saveError) return { emailSent: true, emailError: 'Email submitted, but delivery tracking could not be saved. Do not resend yet.' };
    return { emailSent: true };
  } catch (error) {
    const emailError = error instanceof Error ? error.message : 'Approval email failed.';
    console.error('[approval-email] Send failed', { userId: user.id, error: emailError });
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...metadata, verification_email_error: emailError } });
    return { emailSent: false, emailError };
  }
}
