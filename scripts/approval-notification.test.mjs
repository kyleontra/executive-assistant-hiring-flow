import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyApproval } from '../supabase/functions/_shared/approval-notification.mjs';

function fixture(metadata = {}) {
  const user = { id: 'candidate-id', email: 'candidate@example.invalid', email_confirmed_at: '2026-09-17', app_metadata: { account_role: 'candidate', ...metadata } };
  const updates = [];
  const admin = { auth: { admin: { getUserById: async () => ({ data: { user } }), updateUserById: async (id, values) => { updates.push(values); user.app_metadata = values.app_metadata; return {}; } } } };
  const profile = { user_id: user.id, full_name: 'Candidate Name', updated_at: '2026-09-17T12:00:00Z' };
  return { user, admin, profile, updates };
}
const options = { projectUrl: 'https://example.invalid', serviceKey: 'server-only-test-key' };

test('approval sends to the active auth email and records delivery without changing the role', async () => {
  const f = fixture();
  let request;
  const result = await notifyApproval(f.admin, f.profile, { ...options, fetchImpl: async (url, init) => { request = init; return Response.json({ sent: true }); } });
  assert.equal(result.emailSent, true);
  assert.equal(JSON.parse(request.body).type, 'verification_approved');
  assert.equal(JSON.parse(request.body).recipient, f.user.email);
  assert.equal(f.user.app_metadata.account_role, 'candidate');
  assert.equal(f.user.app_metadata.verification_email_approval_version, f.profile.updated_at);
});
test('approval email failure is visible and can be retried', async () => {
  const f = fixture();
  const result = await notifyApproval(f.admin, f.profile, { ...options, fetchImpl: async () => Response.json({}, { status: 500 }) });
  assert.equal(result.emailSent, false);
  assert.ok(f.user.app_metadata.verification_email_error);
  assert.equal(f.user.app_metadata.verification_email_approval_version, undefined);
  const retry = await notifyApproval(f.admin, f.profile, { ...options, fetchImpl: async () => Response.json({ sent: true }) });
  assert.equal(retry.emailSent, true);
  assert.equal(f.user.app_metadata.verification_email_error, null);
});
test('already-notified approvals do not send duplicate emails', async () => {
  const f = fixture({ verification_email_approval_version: '2026-09-17T12:00:00Z' });
  const result = await notifyApproval(f.admin, f.profile, { ...options, fetchImpl: () => { throw new Error('Must not send'); } });
  assert.equal(result.emailSent, true);
  assert.equal(f.updates.length, 0);
});
test('orphaned profiles cannot trigger approval emails', async () => {
  const f = fixture();
  f.admin.auth.admin.getUserById = async () => ({ data: { user: null }, error: new Error('Not found') });
  const result = await notifyApproval(f.admin, f.profile, { ...options, fetchImpl: () => { throw new Error('Must not send'); } });
  assert.equal(result.emailSent, false);
  assert.match(result.emailError, /No active/);
});
