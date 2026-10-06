import test from 'node:test';
import assert from 'node:assert/strict';
import { safeGoogleDestination, validGoogleContext } from '../google-auth-policy.mjs';
import { googleAccountRole } from '../supabase/functions/_shared/google-account-policy.mjs';

const googleUser = { email_confirmed_at: '2026-10-06', identities: [{ provider: 'google' }], app_metadata: {} };
test('Google account setup preserves existing server roles', () => {
  assert.equal(googleAccountRole({ ...googleUser, app_metadata: { account_role: 'employer' } }, 'candidate'), 'employer');
  assert.equal(googleAccountRole({ ...googleUser, app_metadata: { account_role: 'candidate' } }, 'employer'), 'candidate');
});
test('user-editable metadata cannot grant account permissions', () => {
  assert.equal(googleAccountRole({ ...googleUser, user_metadata: { account_role: 'employer' } }, 'candidate'), 'candidate');
  assert.throws(() => googleAccountRole(googleUser, 'admin'));
  assert.throws(() => googleAccountRole({ ...googleUser, app_metadata: { account_role: 'admin' } }, 'candidate'));
});
test('setup requires a confirmed Google identity', () => {
  assert.throws(() => googleAccountRole({ ...googleUser, email_confirmed_at: null }, 'candidate'));
  assert.throws(() => googleAccountRole({ ...googleUser, identities: [{ provider: 'email' }] }, 'candidate'));
});
test('OAuth destinations stay on approved pages for the account role', () => {
  for (const value of ['https://evil.example', '//evil.example', './\\evil.example', './google-callback.html', './candidate-dashboard.html/../../evil', './talent.html\n']) {
    assert.equal(safeGoogleDestination(value, 'candidate'), './candidate-dashboard.html');
  }
  assert.equal(safeGoogleDestination('./candidate-public-profile.html?id=123', 'employer'), './candidate-public-profile.html?id=123');
  assert.equal(safeGoogleDestination('./admin-review.html', 'employer'), './talent.html');
  assert.equal(safeGoogleDestination('./inbox.html', 'candidate'), './candidate-dashboard.html');
});
test('expired and future sign-in requests cannot be resumed', () => {
  const now = 10000000;
  assert.ok(validGoogleContext({ role: 'candidate', startedAt: now - 1000 }, now));
  assert.ok(!validGoogleContext({ role: 'candidate', startedAt: now - 1800001 }, now));
  assert.ok(!validGoogleContext({ role: 'candidate', startedAt: now + 1 }, now));
  assert.ok(!validGoogleContext({ role: 'admin', startedAt: now }, now));
});
