import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { candidateAccess } from '../supabase/functions/_shared/candidate-access.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const confirmedUser = { id: 'test-user', email: 'candidate@example.invalid', email_confirmed_at: '2026-08-27', user_metadata: { first_name: 'Test', last_name: 'Candidate' } };
const readyProfile = { resume_path: 'test-user/resume.txt', resume_file_name: 'resume.txt', profile_photo_path: 'candidate-profiles/test-user/profile', verification_status: 'pending' };

function browserHarness({ profile = {}, user = confirmedUser, search = '', fetchImpl } = {}) {
  const nodes = new Map();
  const storage = new Map();
  const navigations = [];
  const requests = [];
  const get = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', disabled: false, hidden: false, textContent: '', innerHTML: '', className: '', files: [],
      handlers: {}, classList: { add() {} },
      addEventListener(name, callback) { this.handlers[name] = callback; },
      reportValidity() { return true; }, querySelector: get, querySelectorAll: () => [],
    });
    return nodes.get(selector);
  };
  const window = {
    location: { search, hostname: 'localhost', assign: (url) => navigations.push(url), replace: (url) => navigations.push(url) },
    getVerifiedCandidate: async () => user,
    getAccessToken: async () => 'fixture-token',
    setTimeout: (callback) => callback(),
    savaPlatform: { candidateRequest: async (action, payload) => { requests.push({ action, payload }); return { profile, applications: [] }; } },
    savaAuth: { auth: { signOut: async () => {}, verifyOtp: async (payload) => { requests.push(payload); return { error: null }; }, resend: async () => ({ error: null }) } },
    savaLoadJobs: async () => {},
    savaJobBoard: () => [{ id: 'test-job', title: 'Assistant', company: 'Test company', questions: [{ text: 'Why this role?', type: 'text' }] }],
  };
  const context = vm.createContext({
    window, document: { querySelector: get, querySelectorAll: () => [] },
    sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    URLSearchParams, URL, FormData, File, Blob, TypeError, console,
    RadioNodeList: class RadioNodeList {},
    fetch: fetchImpl || (async (...args) => { requests.push(args); return { ok: true, json: async () => ({ status: 'created' }) }; }),
  });
  return { get, storage, navigations, requests, window, run: (file) => vm.runInContext(read(file), context), flush: () => new Promise((resolve) => setImmediate(resolve)) };
}

test('signup collects only name, email and password and redirects after HTTP 201', async () => {
  const h = browserHarness();
  h.get('#firstName').value = 'Test'; h.get('#lastName').value = 'Candidate';
  h.get('#email').value = 'candidate@example.invalid'; h.get('#password').value = 'fixture-password';
  h.run('candidate-signup.js');
  await h.get('#candidateForm').handlers.submit({ preventDefault() {} });
  assert.deepEqual(Object.keys(JSON.parse(h.requests[0][1].body)).sort(), ['email', 'firstName', 'lastName', 'password']);
  assert.equal(h.requests[0][1].headers['Content-Type'], 'application/json');
  assert.deepEqual(h.navigations, ['./check-email.html']);
  assert.doesNotMatch(read('candidate-signup.html'), /calendarLink|resumeInput|<video/);
  assert.match(read('check-email.html'), /Please check your inbox and click the link for next steps\./);
});

test('registration failure stays on signup and allows retry', async () => {
  const h = browserHarness({ fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'Account already exists.' }) }) });
  h.run('candidate-signup.js');
  await h.get('#candidateForm').handlers.submit({ preventDefault() {} });
  assert.equal(h.get('#submitProfile').disabled, false);
  assert.equal(h.get('#formResult').textContent, 'Account already exists.');
  assert.equal(h.navigations.length, 0);
});

test('email code verification keeps existing OTP method and routes to resume', async () => {
  const h = browserHarness({ user: null });
  h.run('email-confirmed.js');
  h.get('#verificationEmail').value = 'candidate@example.invalid'; h.get('#verificationCode').value = '123456';
  await h.get('#verificationForm').handlers.submit({ preventDefault() {} });
  assert.equal(h.requests[0].type, 'email');
  assert.equal(h.requests[0].token, '123456');
  assert.deepEqual(h.navigations, ['./candidate-resume.html']);
});

test('saved resume continues to account, not headshot or old experience step', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt' } });
  h.storage.set('sava-applying-job', 'test-job');
  h.run('candidate-resume.js'); await h.flush();
  await h.get('#resumeForm').handlers.submit({ preventDefault() {} });
  assert.deepEqual(h.navigations, ['./candidate-dashboard.html']);
  assert.doesNotMatch(read('candidate-resume.html'), /skipResume/);
});

test('verified email plus resume opens dashboard with optional verification CTA', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt', resumeFileName: 'resume.txt', resumeRequired: false, applicationReady: false } });
  h.run('candidate-dashboard.js'); await h.flush();
  assert.equal(h.navigations.length, 0);
  assert.equal(h.get('#candidateNextSteps').hidden, false);
  assert.match(h.get('#candidateApplications').innerHTML, /Browse open roles/);
});

test('new resume uploads separately, connects to profile, and opens account', async () => {
  const h = browserHarness({ profile: null, fetchImpl: async (_url, request) => {
    assert.equal(request.body.get('resume').name, 'resume.txt');
    return { ok: true, json: async () => ({ path: 'test-user/resume.txt', fileName: 'resume.txt' }) };
  } });
  h.run('candidate-resume.js'); await h.flush();
  h.get('#resumeInput').files = [new File(['Test Candidate\nAssistant experience'], 'resume.txt', { type: 'text/plain' })];
  h.get('#resumeInput').handlers.change();
  await h.get('#resumeForm').handlers.submit({ preventDefault() {} });
  const saves = h.requests.filter((request) => request.action === 'saveProfile');
  assert.equal(saves.length, 2);
  assert.equal(saves[1].payload.resumePath, 'test-user/resume.txt');
  assert.deepEqual(h.navigations, ['./candidate-dashboard.html']);
});

test('failed resume upload allows retry without advancing to the account', async () => {
  const h = browserHarness({ profile: null, fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'Unreadable resume.' }) }) });
  h.run('candidate-resume.js'); await h.flush();
  h.get('#resumeInput').files = [new File(['Test'], 'resume.txt', { type: 'text/plain' })];
  h.get('#resumeInput').handlers.change();
  await h.get('#resumeForm').handlers.submit({ preventDefault() {} });
  assert.equal(h.get('#saveResume').disabled, false);
  assert.equal(h.get('#resumeResult').textContent, 'Unreadable resume.');
  assert.equal(h.navigations.length, 0);
});

test('dashboard without resume sends candidate to resume, never identity checks', async () => {
  const h = browserHarness({ profile: { resumeRequired: true } });
  h.run('candidate-dashboard.js'); await h.flush();
  assert.match(h.navigations[0], /^\.\/candidate-resume.html/);
});

test('question page gates incomplete verification and preserves selected job', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt', applicationReady: false }, search: '?job=test-job' });
  h.run('application-questions.js'); await h.flush();
  assert.deepEqual(h.navigations, ['./candidate-next-steps.html?job=test-job']);
});

test('ready candidates see questions with no resume section or work history gate', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt', applicationReady: true }, search: '?job=test-job' });
  h.run('application-questions.js'); await h.flush();
  assert.equal(h.navigations.length, 0);
  assert.equal(h.get('#submitApplication').disabled, false);
  assert.match(h.get('#applicationQuestionList').innerHTML, /Why this role/);
  assert.doesNotMatch(read('application-questions.html'), /id="applicationResume"|applicationOpenResume|replace-resume/);
});

test('next steps resume at ID photos after a saved headshot', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt', photoPath: 'candidate-profiles/test-user/profile' } });
  h.run('candidate-next-steps.js'); await h.flush();
  assert.equal(h.get('#continueVerification').href, './id-verification.html');
  assert.equal(h.get('#continueVerification').hidden, false);
});

test('completed verification returns to the selected application', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt', applicationReady: true }, search: '?job=test-job' });
  h.run('candidate-next-steps.js'); await h.flush();
  assert.deepEqual(h.navigations, ['./application-questions.html?job=test-job']);
});

test('legacy experience page contains neither founding video nor experience form', () => {
  assert.doesNotMatch(read('candidate-experience.html'), /<video|<form|candidate-intro.mp4|candidate-experience.js/);
  assert.doesNotMatch(read('id-verification.js'), /candidate-experience|experiences/);
  assert.match(read('job-detail.html'), />Apply<\/button>/);
});

test('readiness requires resume and completed verification, preserving admin/bypass approvals', () => {
  assert.equal(candidateAccess(null).applicationReady, false);
  assert.equal(candidateAccess({ resume_path: 'resume.txt' }).applicationReady, false);
  assert.equal(candidateAccess({ ...readyProfile, verification_status: 'draft' }).applicationReady, false);
  assert.equal(candidateAccess({ ...readyProfile, verification_status: 'rejected' }).applicationReady, false);
  assert.equal(candidateAccess({ ...readyProfile, resume_path: '' }).applicationReady, false);
  assert.equal(candidateAccess({ ...readyProfile, profile_photo_path: '' }).applicationReady, false);
  assert.equal(candidateAccess(readyProfile).applicationReady, true);
  assert.equal(candidateAccess({ resume_path: 'resume.txt', verification_status: 'verified' }).applicationReady, true);
  assert.equal(candidateAccess({ resume_path: 'resume.txt', verification_bypass: true }).applicationReady, true);
});

async function applicationHandler(profile, body, user = confirmedUser) {
  const writes = [];
  const admin = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table) {
      const builder = {
        select() { return this; }, eq() { return this; },
        upsert(value) { writes.push({ table, value }); return this; },
        maybeSingle: async () => ({ data: table === 'candidate_profiles' ? profile : { id: 'test-job', questions: [] }, error: null }),
        single: async () => ({ data: { id: 'test-application', status: 'new' }, error: null }),
      };
      return builder;
    },
  };
  let handler;
  const source = stripTypeScriptTypes(read('supabase/functions/hiring-platform/index.ts').replace(/^import .*;\n/gm, ''), { mode: 'strip' });
  vm.runInNewContext(source, { createClient: () => admin, candidateAccess, Deno: { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } }, Response, console, crypto, TextEncoder });
  const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { origin: 'https://www.hirefromsa.com', authorization: 'Bearer fixture-token', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submitApplication', jobId: 'test-job', ...body }) }));
  return { response, writes, data: await response.json() };
}

test('server blocks direct application attempts from incomplete candidates, even with forged body fields', async () => {
  const r = await applicationHandler({ resume_path: 'test-user/resume.txt', verification_status: 'draft' }, { verification_status: 'verified', verification_bypass: true, photoPath: 'candidate-profiles/test-user/profile' });
  assert.equal(r.response.status, 403);
  assert.equal(r.data.code, 'VERIFICATION_REQUIRED');
  assert.equal(r.writes.length, 0);
});

test('server rejects resume supplied only in the application payload', async () => {
  const r = await applicationHandler({ verification_status: 'verified' }, { resumePath: 'other-user/resume.txt' });
  assert.equal(r.response.status, 403);
  assert.equal(r.data.code, 'RESUME_REQUIRED');
  assert.equal(r.writes.length, 0);
});

test('server accepts complete submissions without requiring admin approval first', async () => {
  const r = await applicationHandler(readyProfile, {});
  assert.equal(r.response.status, 201);
  assert.equal(r.data.status, 'submitted');
  assert.equal(r.writes.filter((write) => write.table === 'job_applications').length, 1);
});

test('server rejects unverified email before any application writes', async () => {
  const r = await applicationHandler(readyProfile, {}, { ...confirmedUser, email_confirmed_at: null });
  assert.equal(r.response.status, 401);
  assert.equal(r.writes.length, 0);
});
