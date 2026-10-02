import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingRequest } from '../onboarding-client.mjs';

test('safe onboarding transitions retry temporary Supabase failures', async t => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => { globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
  globalThis.window = { getAccessToken: async () => 'test-token', setTimeout };
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) return new Response(JSON.stringify({ error: 'Temporarily unavailable.' }), { status: 503 });
    return new Response(JSON.stringify({ status: 'saved', stage: 'contract' }), { status: 200 });
  };
  const result = await onboardingRequest('completeGuide', { guide: 'platform' });
  assert.equal(calls, 3);
  assert.equal(result.stage, 'contract');
});

test('validation errors are shown immediately without retrying', async t => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => { globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
  globalThis.window = { getAccessToken: async () => 'test-token', setTimeout };
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ error: 'Watch the video first.' }), { status: 403 }); };
  await assert.rejects(() => onboardingRequest('completeGuide', { guide: 'platform' }), /Watch the video first/);
  assert.equal(calls, 1);
});

test('forms retry network failures, validation failures never retry, and hanging requests have an abort signal', async t => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  t.after(() => { globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
  globalThis.window = { getAccessToken: async () => 'test-token', setTimeout };
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    if (++calls === 1) throw new TypeError('Failed to fetch');
    return Response.json({ status: 'saved' });
  };
  assert.equal((await onboardingRequest('saveCareerSurvey', { desiredPositions: 'Support' })).status, 'saved');
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: 'Your progress could not be saved.' }, { status: 400 }); };
  await assert.rejects(onboardingRequest('savePreferences'), /could not be saved/);
  assert.equal(calls, 1);
  globalThis.fetch = async () => { throw new DOMException('Timed out', 'TimeoutError'); };
  await assert.rejects(onboardingRequest('saveIntro', new FormData()), /took too long/);
});
