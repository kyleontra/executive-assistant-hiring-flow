import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const raw = readFileSync(new URL('../supabase/functions/send-auth-email/index.ts', import.meta.url), 'utf8');
function fixture(sendStatus = 202) {
  const calls = [];
  let handler;
  const source = stripTypeScriptTypes(raw.replace(/^import .*;\n/gm, ''), { mode: 'strip' });
  vm.runInNewContext(source, {
    Deno: { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'internal-key' : 'configured-test-value' }, serve: fn => { handler = fn; } },
    Response, URLSearchParams, Date, console,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return url.includes('/token') ? Response.json({ access_token: 'test-mail-token', expires_in: 3600 }) : new Response(null, { status: sendStatus });
    },
  });
  const request = (key = 'internal-key') => new Request('https://example.invalid', { method: 'POST', headers: { 'x-internal-email-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'verification_approved', recipient: 'candidate@example.invalid', candidateName: '<script> Name' }) });
  return { handler, request, calls };
}
test('approval email reaches Microsoft with the approved subject and next-steps link', async () => {
  const f = fixture();
  const response = await f.handler(f.request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sent, true);
  const message = JSON.parse(f.calls[1].init.body).message;
  assert.match(message.subject, /account is approved/);
  assert.match(message.body.content, /candidate-onboarding/);
  assert.doesNotMatch(message.body.content, /<script>/);
  assert.equal(message.toRecipients[0].emailAddress.address, 'candidate@example.invalid');
});
test('approval email rejects a non-internal caller', async () => {
  const f = fixture();
  assert.equal((await f.handler(f.request('wrong-key'))).status, 401);
  assert.equal(f.calls.length, 0);
});
test('Microsoft failure is not reported as an email send success', async () => {
  const f = fixture(503);
  const response = await f.handler(f.request());
  assert.equal(response.status, 500);
  assert.match((await response.json()).error.message, /sendMail failed/);
});
