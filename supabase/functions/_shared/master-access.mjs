export const MASTER_TOKEN_PATTERN = /^hfm_[a-f0-9]{64}$/;
export async function masterHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function masterAccount(admin, token) {
  if (!MASTER_TOKEN_PATTERN.test(token || '')) return null;
  const { data: session, error } = await admin.from('master_sessions').select('account_id,expires_at')
    .eq('token_hash', await masterHash(token)).maybeSingle();
  if (error) throw error;
  if (!session || !(Date.parse(session.expires_at) > Date.now())) return null;
  const { data: account, error: accountError } = await admin.from('master_accounts')
    .select('id,username,employer_id,can_review,disabled').eq('id', session.account_id).maybeSingle();
  if (accountError) throw accountError;
  return account && !account.disabled ? account : null;
}
export function masterUser(account) {
  return { id: account.id, username: account.username,
    app_metadata: { account_role: 'employer', master: true, can_review: account.can_review },
    user_metadata: { first_name: 'Master', company_name: 'Hire From SA' } };
}
export async function masterWorkspaceHash(admin, token, employerId) {
  const account = await masterAccount(admin, token);
  if (!account || account.employer_id !== employerId) return null;
  const { data, error } = await admin.from('hirer_workspaces').select('edit_token_hash').eq('id', employerId).single();
  if (error) throw error;
  return data.edit_token_hash;
}
