import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { reviewSubmissionAcceptable, reviewSubmissionVisible } from '../supabase/functions/_shared/review-access.mjs';
function harness(current) {
  let handler;
  const writes = [], notifications = [];
  const admin = {
    auth: { admin: { getUserById: async () => ({ data: { user: { email_confirmed_at: 'now', app_metadata: { account_role: 'candidate' } } } }) } },
    storage: { from: () => ({
      list: async () => ({ data: ['id-front.jpg', 'id-back.jpg', 'id-video.webm'].map(name => ({ name })), error: null }),
      download: async () => ({ data: new Blob([JSON.stringify({ userId: 'candidate', firstName: 'Fixture' })]), error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'https://example.invalid/file' }, error: null }),
    }) },
    from(table) { return {
      select() { return this; }, eq(key, value) { assert.equal(key, 'user_id'); assert.equal(value, 'candidate'); return this; },
      update(values) { writes.push(values); return this; },
      maybeSingle: async () => ({ data: table === 'candidate_onboarding' ? { review_reference: current } : { verification_status: 'pending', user_id: 'candidate' }, error: null }),
    }; },
  };
  const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/admin-review/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), { mode: 'strip' });
  vm.runInNewContext(source, { createClient: () => admin, masterAccount: async () => ({ can_review: true }), notifyApproval: async () => { notifications.push('email'); return {}; }, reviewSubmissionAcceptable, reviewSubmissionVisible, Deno: { env: { get: () => 'test' }, serve: fn => handler = fn }, Response, Blob, crypto, TextEncoder, console: { error() {} } });
  const request = async action => { const r = await handler(new Request('https://example.invalid', { method: 'POST', headers: { origin: 'https://www.hirefromsa.com', 'content-type': 'application/json', authorization: 'Bearer fixture' }, body: JSON.stringify({ action, reference: 'SA-ABCDEF12' }) })); return { status: r.status, body: await r.json() }; };
  return { writes, notifications, request };
}
test('older ID submissions cannot approve or reject the account after replacement photos', async () => {
  for (const action of ['acceptReview', 'rejectReview']) {
    const h = harness('SA-AB123456');
    assert.equal((await h.request(action)).status, 409);
    assert.equal(h.writes.length, 0); assert.equal(h.notifications.length, 0);
  }
});
test('the current submission and legacy records without a saved reference remain reviewable', async () => {
  for (const reference of ['SA-ABCDEF12', null]) {
    const h = harness(reference);
    assert.equal((await h.request('acceptReview')).status, 200);
    assert.equal(h.writes[0].verification_status, 'verified');
    assert.equal(h.notifications.length, 1);
  }
});
