import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const employer = { id: 'hirer-id', email_confirmed_at: '2026-09-17', app_metadata: { account_role: 'employer' } };
function fixture(getUser) {
  const redirects = [];
  const notices = [];
  const window = { supabase: { createClient: () => ({ auth: { getUser } }) }, location: { hostname: 'www.hirefromsa.com', pathname: '/index.html', search: '', replace: url => redirects.push(url) } };
  const document = { querySelector: selector => selector.includes('data-sava-account') ? {} : null, documentElement: { dataset: {}, classList: { remove() {} } }, body: { prepend: el => notices.push(el) }, createElement: () => ({ setAttribute() {}, append() {} }) };
  const context = vm.createContext({ window, document, sessionStorage: { getItem: () => null }, URLSearchParams, setTimeout: callback => callback(), console });
  vm.runInContext(read('auth-client.js'), context);
  return { window, context, redirects, notices };
}
test('employer sign-in check retries a temporary error and keeps the session', async () => {
  let calls = 0;
  const f = fixture(async () => ++calls === 1 ? { error: { name: 'AuthRetryableFetchError', status: 503 } } : { data: { user: employer } });
  assert.equal((await f.window.getVerifiedEmployer()).id, employer.id);
  assert.equal(calls, 2);
});
test('concurrent account checks share one verified-user request', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return { data: { user: employer } }; });
  await Promise.all([f.window.getVerifiedEmployer(), f.window.getVerifiedUser()]);
  assert.equal(calls, 1);
});
test('invalid/deleted sessions are not accepted as employer access', async () => {
  const f = fixture(async () => ({ error: { status: 401, code: 'user_not_found' } }));
  assert.equal(await f.window.getVerifiedEmployer(), null);
});
test('candidate accounts cannot pass the employer guard', async () => {
  const f = fixture(async () => ({ data: { user: { ...employer, app_metadata: { account_role: 'candidate' } } } }));
  assert.equal(await f.window.getVerifiedEmployer(), null);
});

test('candidate guard keeps a temporary sign-in outage distinct from a deleted session', async () => {
  const offline = fixture(async () => ({ error: { name: 'AuthRetryableFetchError', status: 503 } }));
  await assert.rejects(offline.window.getVerifiedCandidate(), /saved session has not been cleared/);
  const deleted = fixture(async () => ({ error: { status: 401, code: 'user_not_found' } }));
  assert.equal(await deleted.window.getVerifiedCandidate(), null);
});
test('temporary outage offers retry instead of redirecting to login', async () => {
  const f = fixture(async () => ({ error: { name: 'AuthRetryableFetchError', status: 503 } }));
  vm.runInContext(read('employer-auth.js'), f.context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.redirects.length, 0);
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].id, 'employerAuthRetry');
});
