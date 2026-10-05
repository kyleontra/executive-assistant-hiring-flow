import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { candidateAccess } from '../supabase/functions/_shared/candidate-access.mjs';
import { onboardingStage } from '../supabase/functions/_shared/onboarding-state.mjs';
import * as masterAccess from '../supabase/functions/_shared/master-access.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const confirmedUser = { id: 'test-user', email: 'candidate@example.invalid', email_confirmed_at: '2026-08-27', app_metadata: { account_role: 'candidate' }, user_metadata: { first_name: 'Test', last_name: 'Candidate' } };
const readyProfile = { resume_path: 'test-user/resume.txt', resume_file_name: 'resume.txt', profile_photo_path: 'candidate-profiles/test-user/profile', verification_status: 'verified' };

function browserHarness({ profile = {}, user = confirmedUser, search = '', fetchImpl } = {}) {
  const nodes = new Map();
  const storage = new Map();
  const navigations = [];
  const requests = [];
  const get = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', disabled: false, hidden: false, textContent: '', innerHTML: '', className: '', files: [],
      handlers: {}, classList: { add() {}, remove() {} },
      setAttribute(name, value) { this[name] = value; }, focus() {},
      addEventListener(name, callback) { this.handlers[name] = callback; },
      reportValidity() { return true; }, querySelector: get, querySelectorAll: () => [],
    });
    return nodes.get(selector);
  };
  const window = {
    location: { search, hostname: 'localhost', assign: (url) => navigations.push(url), replace: (url) => navigations.push(url) },
    getVerifiedCandidate: async () => user,
    getAccessToken: async () => 'fixture-token', addEventListener() {},
    setTimeout: (callback) => callback(),
    savaPlatform: {
      candidateRequest: async (action, payload) => { requests.push({ action, payload }); return { profile, applications: [] }; },
      publicRequest: async () => ({ jobs: [{ id: 'test-job', status: 'active', title: 'Assistant', company: 'Test company', questions: [{ text: 'Why this role?', type: 'text' }] }] }),
    },
    savaAuth: { auth: { signOut: async () => {}, verifyOtp: async (payload) => { requests.push(payload); return { error: null }; }, resend: async () => ({ error: null }) } },
    savaLoadJobs: async () => {},
    savaJobBoard: () => [{ id: 'test-job', title: 'Assistant', company: 'Test company', questions: [{ text: 'Why this role?', type: 'text' }] }],
  };
  const context = vm.createContext({
    window, document: { body: { classList: { add() {}, remove() {} } }, querySelector: get, querySelectorAll: () => [] },
    onboardingRequest: async () => ({ stage: profile.onboardingComplete ? 'complete' : 'platform', introSaved: false }),
    sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    URLSearchParams, URL, FormData, File, Blob, TypeError, AbortSignal, console,
    RadioNodeList: class RadioNodeList {},
    fetch: fetchImpl || (async (...args) => { requests.push(args); return { ok: true, json: async () => ({ status: 'created' }) }; }),
  });
  return { get, storage, navigations, requests, window, run: (file) => vm.runInContext(read(file).replace(/^import .*;\n/gm, ''), context), flush: () => new Promise((resolve) => setImmediate(resolve)) };
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
  assert.match(read('check-email.html'), /We sent you a six-digit code\./);
  assert.match(read('check-email.html'), /id="verificationCode"/);
  assert.match(read('check-email.html'), /src="\.\/email-confirmed\.js"/);
});

test('registration failure stays on signup and allows retry', async () => {
  const h = browserHarness({ fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'Account already exists.' }) }) });
  h.run('candidate-signup.js');
  await h.get('#candidateForm').handlers.submit({ preventDefault() {} });
  assert.equal(h.get('#submitProfile').disabled, false);
  assert.equal(h.get('#formResult').textContent, 'Account already exists.');
  assert.equal(h.navigations.length, 0);
});

test('public registration creates candidate accounts only and fails closed without email confirmation', () => {
  const candidateRegistration = read('supabase/functions/register-candidate/index.ts');
  assert.match(candidateRegistration, /if \(data\.session\)/);
  assert.match(candidateRegistration, /admin\.auth\.admin\.deleteUser\(data\.user\.id\)/);
  assert.match(candidateRegistration, /Email verification is temporarily unavailable/);
  assert.match(candidateRegistration, /account_role: 'candidate'/);
  assert.doesNotMatch(candidateRegistration, /input\.(?:role|accountRole|account_role)/);
});

test('hirer self-registration accepts any email, asks for the company name and creates an unconfirmed employer account', () => {
  const login = read('employer-login.html');
  const page = read('employer-signup.html');
  const client = read('employer-signup.js');
  const server = read('supabase/functions/register-employer/index.ts');
  assert.match(login, /href="\.\/employer-signup\.html"/);
  assert.match(page, /id="employerSignupForm"/);
  assert.match(page, /name="companySize"/);
  assert.match(page, /name="companyName"/);
  assert.doesNotMatch(client, /isWorkEmail/);
  assert.match(client, /verifyOtp/);
  assert.doesNotMatch(server, /FREE_DOMAINS/);
  assert.match(server, /company_name: companyName/);
  assert.match(server, /email_confirm: false/);
  assert.match(server, /account_role: 'employer'/);
  assert.doesNotMatch(server, /auth\.signUp/);
});

test('employer login sends unverified accounts back to email confirmation', () => {
  const source = read('employer-login.js');
  assert.match(source, /error\.code === 'email_not_confirmed'/);
  assert.match(source, /email-confirmed\.html\?account=employer/);
});

test('candidate and employer login pages offer code-based password recovery', () => {
  assert.match(read('candidate-login.html'), /reset-password\.html\?account=candidate/);
  assert.match(read('employer-login.html'), /reset-password\.html\?account=employer/);
  const page = read('reset-password.html');
  const source = read('reset-password.js');
  assert.match(page, /id="resetCode"[^>]+pattern="\[0-9\]\{6\}"/);
  assert.match(page, /id="newPassword"[^>]+minlength="8"/);
  assert.match(source, /signInWithOtp/);
  assert.match(source, /shouldCreateUser: false/);
  assert.match(source, /type: 'email'/);
  assert.match(source, /updateUser\(\{ password: newPasswordInput\.value \}\)/);
  assert.match(source, /savaAuth\.auth\.signOut\(\)/);
});

test('password-reset OTP emails use reset-specific copy', () => {
  const source = read('supabase/functions/send-auth-email/index.ts');
  assert.match(source, /action === 'recovery' \|\| action === 'magiclink'/);
  assert.match(source, /Reset your Hire From SA password/);
});

test('every successful employer message requires a candidate email notification', () => {
  const source = read('supabase/functions/candidate-messages/index.ts');
  assert.match(source, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
  assert.match(source, /if \(!linkedCandidateId\)/);
  assert.match(source, /if \(!authData\.user\?\.email_confirmed_at\)/);
  assert.match(source, /await sendCandidateNotification\(/);
  assert.match(source, /from\('candidate_messages'\)\.delete\(\)\.eq\('id', insertedMessage\.id\)/);
  assert.match(source, /emailNotification = 'sent'/);
  assert.doesNotMatch(read('script.js'), /Sent, but the email notification failed/);
});

test('email code verification keeps existing OTP method and routes to the welcome video', async () => {
  const h = browserHarness({ user: null });
  h.run('email-confirmed.js');
  h.get('#verificationEmail').value = 'candidate@example.invalid'; h.get('#verificationCode').value = '123456';
  await h.get('#verificationForm').handlers.submit({ preventDefault() {} });
  assert.equal(h.requests[0].type, 'email');
  assert.equal(h.requests[0].token, '123456');
  assert.deepEqual(h.navigations, ['./welcome.html']);
});

test('saved resume continues to the onboarding router, not the old experience step', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt' } });
  h.storage.set('sava-applying-job', 'test-job');
  h.run('candidate-resume.js'); await h.flush();
  await h.get('#resumeForm').handlers.submit({ preventDefault() {} });
  assert.deepEqual(h.navigations, ['./candidate-onboarding.html']);
  assert.doesNotMatch(read('candidate-resume.html'), /skipResume/);
});

test('verified email plus resume opens dashboard without exposing the paused job board', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt', resumeFileName: 'resume.txt', resumeRequired: false, applicationReady: false } });
  h.run('candidate-dashboard.js'); await h.flush();
  assert.equal(h.navigations.length, 0);
  assert.equal(h.get('#candidateGate').hidden, false);
  assert.equal(h.get('#candidateReady').hidden, true);
  assert.match(read('candidate-dashboard.html'), /Before you apply, finish up next steps\./);
  assert.doesNotMatch(read('candidate-dashboard.html'), /Your connected resume|Replace resume|YOUR PROFILE/);
});

test('new resume uploads separately, connects to profile, and opens the next onboarding step', async () => {
  const h = browserHarness({ profile: null, fetchImpl: async (_url, request) => {
    assert.equal(request.body.get('resume').name, 'resume.txt');
    return { ok: true, json: async () => ({ path: 'test-user/resume.txt', fileName: 'resume.txt' }) };
  } });
  h.run('candidate-resume.js'); await h.flush();
  h.get('#resumeInput').files = [new File(['Test Candidate\nAssistant experience'], 'resume.txt', { type: 'text/plain' })];
  h.get('#resumeInput').handlers.change();
  await h.get('#resumeForm').handlers.submit({ preventDefault() {} });
  const saves = h.requests.filter((request) => request.action === 'saveProfile');
  assert.equal(saves.length, 0); // The upload endpoint saves the account atomically.
  assert.deepEqual(h.navigations, ['./candidate-onboarding.html']);
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

test('next steps resume at the verification video after a saved headshot', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt', photoPath: 'candidate-profiles/test-user/profile' } });
  h.run('candidate-next-steps.js'); await h.flush();
  assert.equal(h.get('#continueVerification').href, './candidate-onboarding.html');
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
  assert.equal(candidateAccess({ ...readyProfile, verification_status: 'pending' }).applicationReady, false);
  assert.equal(candidateAccess({ ...readyProfile, verification_status: 'pending', profile_photo_path: '' }).applicationReady, false);
  assert.equal(candidateAccess(readyProfile).applicationReady, true);
  assert.equal(candidateAccess({ resume_path: 'resume.txt', verification_status: 'verified' }).applicationReady, true);
  assert.equal(candidateAccess({ resume_path: 'resume.txt', verification_bypass: true }).applicationReady, true);
  assert.equal(candidateAccess({ resume_path: 'resume.txt', verification_status: 'verified', onboarding_preferences_required: true }).applicationReady, false);
  assert.equal(candidateAccess({ resume_path: 'resume.txt', verification_status: 'verified', onboarding_preferences_required: true, preferences_completed_at: 'now' }).applicationReady, true);
});

async function applicationHandler(profile, body, user = confirmedUser, progress = { platform_completed_at: '2026-09-01', intro_completed_at: '2026-09-01', intro_skipped_at: '2026-09-01' }) {
  const writes = [];
  const admin = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table) {
      const builder = {
        select() { return this; }, eq() { return this; },
        upsert(value) { writes.push({ table, value }); return this; },
        maybeSingle: async () => ({ data: table === 'candidate_profiles' ? profile : table === 'candidate_onboarding' ? progress : { id: 'test-job', questions: [] }, error: null }),
        single: async () => ({ data: { id: 'test-application', status: 'new' }, error: null }),
      };
      return builder;
    },
  };
  let handler;
  const source = stripTypeScriptTypes(read('supabase/functions/hiring-platform/index.ts').replace(/^import .*;\n/gm, ''), { mode: 'strip' });
  vm.runInNewContext(source, { ...masterAccess, createClient: () => admin, candidateAccess, onboardingStage, Deno: { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } }, Response, console, crypto, TextEncoder });
  const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { origin: 'https://www.hirefromsa.com', authorization: 'Bearer fixture-token', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submitApplication', jobId: 'test-job', ...body }) }));
  return { response, writes, data: await response.json() };
}

async function jobPostAttempt(user, includeToken = true, action = 'createJob') {
  let databaseTouched = false;
  const admin = {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : new Error('Invalid token') }) },
    from() {
      databaseTouched = true;
      throw new Error('Unauthorized job posting must not reach the database.');
    },
  };
  let handler;
  const source = stripTypeScriptTypes(read('supabase/functions/hiring-platform/index.ts').replace(/^import .*;\n/gm, ''), { mode: 'strip' });
  vm.runInNewContext(source, { ...masterAccess, createClient: () => admin, candidateAccess, Deno: { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } }, Response, console, crypto, TextEncoder });
  const headers = {
    origin: 'https://www.hirefromsa.com',
    'content-type': 'application/json',
    ...(includeToken ? { authorization: 'Bearer fixture-token' } : {}),
  };
  const response = await handler(new Request('https://example.invalid', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, employerId: crypto.randomUUID(), editToken: 'x'.repeat(64), jobId: 'test-job' }),
  }));
  return { response, data: await response.json(), databaseTouched };
}

test('anonymous visitors cannot post jobs or reach the database', async () => {
  const r = await jobPostAttempt(null, false);
  assert.equal(r.response.status, 401);
  assert.match(r.data.error, /employer account/);
  assert.equal(r.databaseTouched, false);
});

test('candidate accounts cannot post jobs or reach the database', async () => {
  const r = await jobPostAttempt(confirmedUser);
  assert.equal(r.response.status, 401);
  assert.match(r.data.error, /employer account/);
  assert.equal(r.databaseTouched, false);
});

test('job posting checks the secure employer role before workspace access', () => {
  const source = read('supabase/functions/hiring-platform/index.ts');
  assert.match(source, /user\.app_metadata\?\.account_role === 'employer'/);
  assert.ok(source.indexOf('if (!await employerUser(request, admin))') < source.indexOf('const access = await ensureEmployer(admin, body);'));
});

test('posted jobs can be deleted only after employer and workspace ownership checks', async () => {
  const server = read('supabase/functions/hiring-platform/index.ts');
  const client = read('posted-jobs.js');
  const deleteAction = server.indexOf("if (action === 'deleteJob')");
  const roleCheck = server.indexOf('if (!await employerUser(request, admin))', deleteAction);
  const accessCheck = server.indexOf('const access = await ensureEmployer(admin, body);', deleteAction);
  const ownershipCheck = server.indexOf('job.employer_id !== access.employer.id', deleteAction);
  const deleteQuery = server.indexOf(".from('hiring_jobs')", ownershipCheck);
  assert.ok(deleteAction >= 0);
  assert.ok(deleteAction < roleCheck && roleCheck < accessCheck && accessCheck < ownershipCheck && ownershipCheck < deleteQuery);
  assert.match(server.slice(deleteAction, server.indexOf("if (action === 'employerDashboard')")), /\.delete\(\)[\s\S]*\.eq\('id', jobId\)[\s\S]*\.eq\('employer_id', access\.employer\.id\)/);
  assert.match(client, /data-delete-job/);
  assert.match(client, /window\.confirm/);
  assert.match(client, /employerRequest\('deleteJob', \{ jobId \}\)/);
  assert.match(client, /postedJobs = postedJobs\.filter/);

  for (const [user, includeToken] of [[null, false], [confirmedUser, true]]) {
    const result = await jobPostAttempt(user, includeToken, 'deleteJob');
    assert.equal(result.response.status, 401);
    assert.match(result.data.error, /employer account/);
    assert.equal(result.databaseTouched, false);
  }
});

test('employer candidate search backfills and queries the private resume index', () => {
  const source = read('supabase/functions/hiring-platform/index.ts');
  assert.match(source, /if \(!await employerUser\(request, admin\)\).*search candidates/);
  assert.match(source, /await backfillResumeIndexes\(admin\)/);
  assert.match(source, /admin\.rpc\('search_candidate_resumes'/);
  assert.match(source, /resume_software/);
  assert.match(source, /resume_job_titles/);
});

test('talent cards display resume skills without match claims', () => {
  const source = read('talent.js');
  assert.match(source, /candidate\.skills/);
  assert.match(source, /SKILLS FROM RESUME/);
  assert.doesNotMatch(source, /RESUME MATCHES/);
});

test('private admin resume search is ranked, protected, and opens only redacted files', () => {
  const server = read('supabase/functions/admin-review/index.ts');
  const migration = read('supabase/migrations/20260901155741_add_admin_resume_search.sql');
  const page = read('admin-resumes.html');
  const client = read('admin-resumes.js');
  assert.ok(server.indexOf("!master?.can_review &&") < server.indexOf("if (action === 'listReviews')"));
  assert.match(server, /sameHash\(await sha256\(adminKey\), ADMIN_KEY_HASH\)/);
  assert.match(server, /admin\.rpc\('search_admin_candidate_resumes'/);
  assert.match(server, /UUID_PATTERN\.test\(candidateId\)/);
  assert.match(server, /from\(RESUME_BUCKET\)\.download\(resumePath\)/);
  assert.match(server, /redactContactInfo\(await resumeFile\.text\(\)\)/);
  assert.doesNotMatch(server, /signedUrl\(admin, RESUME_BUCKET, resumePath/);
  assert.match(server, /resumePath\.startsWith\(`\$\{candidateId\}\//);
  assert.match(migration, /ts_rank_cd\(profile\.resume_search_vector/);
  assert.match(migration, /revoke all on function public\.search_admin_candidate_resumes\(text, text, integer\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.search_admin_candidate_resumes\(text, text, integer\) to service_role/);
  assert.match(page, /meta name="robots" content="noindex,nofollow"/);
  assert.match(client, /sessionStorage\.getItem\(ADMIN_SESSION_KEY\)/);
  assert.match(client, /getResumeCandidate/);
  assert.match(client, /Redacted resume/);
});

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

test('server accepts complete submissions from approved candidates', async () => {
  const r = await applicationHandler(readyProfile, {});
  assert.equal(r.response.status, 201);
  assert.equal(r.data.status, 'submitted');
  assert.equal(r.writes.filter((write) => write.table === 'job_applications').length, 1);
});

test('server blocks pending-review applications even with a saved resume and headshot', async () => {
  const r = await applicationHandler({ ...readyProfile, verification_status: 'pending' }, {});
  assert.equal(r.response.status, 403);
  assert.equal(r.data.code, 'VERIFICATION_PENDING');
  assert.equal(r.writes.length, 0);
});

test('server blocks direct applications until the approved-candidate onboarding is complete', async () => {
  const r = await applicationHandler(readyProfile, {}, confirmedUser, { platform_completed_at: '2026-09-01' });
  assert.equal(r.response.status, 403);
  assert.equal(r.data.code, 'ONBOARDING_REQUIRED');
  assert.equal(r.writes.length, 0);
});
test('new candidates cannot apply before saving job preferences', async () => {
  const r = await applicationHandler({ ...readyProfile, onboarding_preferences_required: true }, {});
  assert.equal(r.response.status, 403);
  assert.equal(r.data.code, 'ONBOARDING_REQUIRED');
  assert.equal(r.writes.length, 0);
});

test('server rejects unverified email before any application writes', async () => {
  const r = await applicationHandler(readyProfile, {}, { ...confirmedUser, email_confirmed_at: null });
  assert.equal(r.response.status, 401);
  assert.equal(r.writes.length, 0);
});

test('dashboard routes approved candidates into saved onboarding and keeps the incomplete view simple', async () => {
  for (const [verificationStatus, verificationBypass, redirects] of [
    ['draft', false, false], ['pending', false, true], ['rejected', false, false],
    ['verified', false, true], ['draft', true, true],
  ]) {
    const h = browserHarness({ profile: { resumeRequired: false, verificationStatus, verificationBypass } });
    h.run('candidate-dashboard.js');
    await h.flush();
    assert.deepEqual(h.navigations, redirects ? ['./candidate-onboarding.html'] : []);
    if (!redirects) assert.equal(h.get('#candidateGate').hidden, false);
  }
});

test('completed onboarding returns approved candidates to their real dashboard', async () => {
  const h = browserHarness({ profile: { resumeRequired: false, applicationReady: true, verificationStatus: 'verified', onboardingComplete: true } });
  h.run('candidate-dashboard.js'); await h.flush();
  assert.deepEqual(h.navigations, []);
  assert.equal(h.get('#candidateReady').hidden, false);
});

test('headshot upload has a prominent live loading indicator', () => {
  assert.match(read('candidate-profile.html'), /id="headshotUploadProgress"[^>]+aria-live="assertive"/);
  assert.match(read('candidate-profile.js'), /setUploading\(Boolean\(selectedPhoto\)\)/);
  assert.match(read('candidate-profile-webcam.css'), /headshot-spinner/);
});

test('ID video upload waits for the contract before pending review', () => {
  const source = read('supabase/functions/submit-id-video/index.ts');
  assert.match(source, /identity_video_uploaded_at/);
  assert.match(source, /status: 'contract_required'/);
  assert.doesNotMatch(source, /verification_status: 'pending'/);
});

test('identity guide keeps autoplay and exposes save retry after full playback', () => {
  const allSource = read('candidate-onboarding.mjs');
  const source = allSource.slice(allSource.indexOf('function renderIdentityVideo'), allSource.indexOf('function bind'));
  assert.match(source, /Watch this video to continue/);
  assert.doesNotMatch(source, /Thank you for verifying your identity/);
  assert.doesNotMatch(source, /Congrats on getting approved/);
  assert.match(source, /mountRequiredVideo/);
  assert.match(source, /autoplay: true, unpausable: true/);
  assert.match(source, /Retry saving and continue/);
  assert.match(source, /finished = true/);
  assert.match(source, /request\('completeGuide', \{ guide: 'identity' \}\)/);
});

test('identity review guide follows ID submission and uploads do not require watching it first', () => {
  const state = read('supabase/functions/_shared/onboarding-state.mjs');
  const photos = read('supabase/functions/submit-id-photos/index.ts');
  const video = read('supabase/functions/submit-id-video/index.ts');
  const preview = read('signup-preview.mjs');
  assert.match(state, /if \(!identitySubmitted\) return 'verification';[\s\S]*if \(!progress\.identity_completed_at\) return 'identity'/);
  assert.ok(preview.indexOf("['Verification video'") > preview.indexOf("['ID recording'"));
  assert.doesNotMatch(photos, /Watch the identity verification video before submitting ID photos/);
  assert.doesNotMatch(video, /Watch the identity verification video before submitting your ID/);
  assert.match(video, /identity_completed_at: null/);
});

test('approved and intro recording pages use the requested copy and playable previews', () => {
  const source = read('candidate-onboarding.mjs');
  assert.match(source, /Congrats on getting approved! Watch the video below to increase your chance of getting hired by over 50%/);
  assert.match(source, /Record your video to increase your chances of getting hired!/);
  assert.match(source, /autoplay: true/);
  assert.match(source, /Play recording/);
  assert.match(source, /screen\.load\(\)/);
  assert.match(source, /await screen\.play\(\)/);
  assert.match(source, /Record with your camera or upload a video to preview it here/);
});

test('signup preview runs a real local camera demo with upload fallback', () => {
  const page = read('signup-preview.html');
  const preview = read('signup-preview.mjs');
  const recorderPage = read('verification.html');
  const recorder = read('verification.js');
  const buildConfig = read('vite.config.js');
  const deployment = read('vercel.json');
  assert.match(page, /sandbox="allow-same-origin allow-scripts"/);
  assert.match(page, /allow="camera; microphone; autoplay"/);
  assert.match(preview, /verification\.html\?demo=1&embedded=1/);
  assert.match(preview, /interactiveCamera[\s\S]*return;/);
  assert.match(preview, /hirefromsa:camera-demo-complete/);
  assert.match(recorderPage, /id="videoUpload"[^>]+video\/mp4,video\/webm/);
  assert.match(recorder, /requestCamera\(\)/);
  assert.match(recorder, /requestCameraStream\(\{ video, audio: false \}\)/);
  assert.match(recorder, /Your camera is busy in another app/);
  assert.match(recorder, /window\.parent\.postMessage\(\{ type: 'hirefromsa:camera-demo-complete'/);
  assert.match(buildConfig, /'verification\.js'/);
  assert.match(deployment, /camera=\(self\), microphone=\(self\)/);
});

test('sandbox previews are excluded from Vercel and demo mode is localhost-only', () => {
  const buildConfig = read('vite.config.js');
  const deployIgnore = read('.vercelignore');
  const recorder = read('verification.js');
  assert.match(buildConfig, /isVercelBuild = process\.env\.VERCEL === '1'/);
  assert.match(buildConfig, /delete pages\.signupPreview/);
  assert.match(buildConfig, /delete pages\.onboardingDemo/);
  assert.match(buildConfig, /delete pages\.candidateExperience/);
  assert.match(buildConfig, /if \(!isVercelBuild\)[\s\S]*build-isolated-flow-preview/);
  assert.match(deployIgnore, /signup-preview\.html/);
  assert.match(deployIgnore, /onboarding-demo\.html/);
  assert.match(recorder, /\['localhost', '127\.0\.0\.1'\]\.includes\(window\.location\.hostname\)/);
});

test('platform agreement video is completed before the candidate contract', () => {
  const state = read('supabase/functions/_shared/onboarding-state.mjs');
  const server = read('supabase/functions/candidate-onboarding/index.ts');
  const preview = read('signup-preview.mjs');
  const onboarding = read('candidate-onboarding.mjs');
  assert.match(state, /if \(!progress\.platform_completed_at\) return 'platform';\s+if \(!progress\.contract_accepted_at/);
  assert.match(server, /!progress\.platform_completed_at/);
  assert.match(onboarding, /Last step: Watch the video below and review the contract/);
  assert.ok(preview.indexOf("['Platform + agreement'") < preview.indexOf("['Candidate contract'"));
});

test('signing the contract leads to a next-steps video, then Check status opens the account', () => {
  const onboarding = read('candidate-onboarding.mjs');
  const previewStages = read('signup-preview-stages.mjs');
  const preview = read('signup-preview.mjs');
  assert.match(onboarding, /Watch this video for next steps/);
  assert.match(onboarding, /https:\/\/sendlink\.co\/documents\/doc-form\/6a99dcb2ea613131e9ac83f3\?locale=en/);
  assert.match(onboarding, /target="_blank" rel="noopener noreferrer"/);
  assert.match(onboarding, /I completed and submitted the Hire From SA contract in Sendlink/);
  assert.doesNotMatch(onboarding, /No guarantee of work/);
  assert.match(onboarding, /candidate-dashboard\.html\?tab=profile/);
  assert.match(read('candidate-dashboard.js'), /underReview = profile\.verificationStatus === 'pending'/);
  assert.match(read('candidate-dashboard.js'), /You can apply once you\\'re approved/);
  const waiting = onboarding.slice(onboarding.indexOf('function renderWaiting'), onboarding.indexOf('function renderPreferences'));
  assert.doesNotMatch(waiting, /refreshStatus|My account|journey-action/);
  assert.match(preview, /Verification cutoff/);
  assert.doesNotMatch(previewStages, /Preview approval/);
});

test('a saved profile picture returns to My Profile without a second profile save or browser cache', async () => {
  let uploads = 0;
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt' }, fetchImpl: async () => { uploads++; return { ok: true, json: async () => ({ path: 'candidate-profiles/test-user/profile-123.jpg' }) }; } });
  h.run('candidate-profile.js'); await h.flush();
  h.get('#profilePhotoInput').files = [new File(['fixture'], 'photo.jpg', { type: 'image/jpeg' })];
  h.get('#profilePhotoInput').handlers.change();
  await h.get('#profilePhotoForm').handlers.submit({ preventDefault() {} });
  assert.equal(uploads, 1);
  assert.equal(h.requests.filter(r => r.action === 'saveProfile').length, 0);
  assert.deepEqual(h.navigations, ['./candidate-dashboard.html?tab=profile']);
});
test('an outdated browser headshot cannot masquerade as a saved account photo', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt' } });
  h.get('#saveProfilePhoto').disabled = true;
  h.storage.set('sava:profile-photo:test-user', 'candidate-profiles/test-user/profile');
  h.run('candidate-profile.js'); await h.flush();
  assert.equal(h.get('#saveProfilePhoto').disabled, true);
});
test('a cached ID reference never skips account onboarding progress', async () => {
  const h = browserHarness({ profile: { resumePath: 'test-user/resume.txt', photoPath: 'candidate-profiles/test-user/profile' } });
  h.storage.set('sava:id-review:test-user', 'SA-ABCDEF12');
  h.run('candidate-next-steps.js'); await h.flush();
  assert.equal(h.get('#continueVerification').href, './candidate-onboarding.html');
});

test('sign-up no longer requires a profile photo before ID verification', async () => {
  const { onboardingStage } = await import('../supabase/functions/_shared/onboarding-state.mjs');
  assert.equal(onboardingStage({ resume_path: 'test-user/resume.txt', profile_photo_path: '' }, {}), 'verification');
  assert.doesNotMatch(read('supabase/functions/submit-id-photos/index.ts'), /Add your professional profile photo before submitting ID photos/);
  assert.doesNotMatch(read('id-verification.js'), /candidate-profile\.html/);
});

test('sign-up review video is minimal and goes straight to the contract', () => {
  const source = read('candidate-onboarding.mjs');
  const identity = source.slice(source.indexOf('function renderIdentityVideo'), source.indexOf('function bind'));
  assert.match(identity, /minimal: true/);
  assert.doesNotMatch(identity, /void finish\(\)/);
  assert.match(source, /state\.stage === 'platform' && !state\.approved[\s\S]*request\('completeGuide', \{ guide: 'platform' \}\)[\s\S]*renderContract\(state\)/);
  assert.match(read('required-video.mjs'), /if \(minimal\) \{ play\.hidden = true; status\.hidden = true; \}/);
});

test('job questions are one page that saves both parts and returns to My Profile', () => {
  const page = read('candidate-questions.html');
  const source = read('candidate-questions.mjs');
  for (const name of ['jobIndustryPreferences', 'desiredPositions', 'monthlyIncomeGoalZar', 'employmentPreference', 'startAvailability', 'portfolioLinks', 'preferredJobNote']) assert.match(page, new RegExp(`name="${name}"`));
  assert.doesNotMatch(page, /Continue/);
  assert.match(source, /saveCareerSurvey[\s\S]*savePreferences[\s\S]*location\.assign\(profileUrl\)/);
  assert.match(source, /candidate-dashboard\.html\?tab=profile/);
  assert.match(read('vite.config.js'), /candidate-questions\.html/);
  assert.match(read('candidate-dashboard.js'), /candidate-questions\.html/);
});

test('VAs under review can record their 1-minute intro from My Profile', () => {
  const onboarding = read('candidate-onboarding.mjs');
  const dashboard = read('candidate-dashboard.js');
  const server = read('supabase/functions/candidate-onboarding/index.ts');
  assert.match(dashboard, /Record your 1-minute intro video/);
  assert.match(dashboard, /candidate-onboarding\.html\?intro=1/);
  assert.match(onboarding, /state\.stage === 'waiting' && introMode\) renderRecorder\(state, true\)/);
  assert.match(onboarding, /Your script/);
  assert.match(server, /underReview && \(!profile\.verification_status|underReview\) \{\s*if \(!profile\?\.resume_path \|\| action === 'skipIntro'\)/);
});
