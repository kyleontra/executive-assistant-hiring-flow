import { parsePortfolioLinks, publicPortfolioLinks } from '../supabase/functions/_shared/portfolio-links.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { onboardingStage } from '../supabase/functions/_shared/onboarding-state.mjs';
import { candidateAccess } from '../supabase/functions/_shared/candidate-access.mjs';
import { RESUME_INDEX_VERSION } from '../supabase/functions/_shared/resume-index.mjs';
import { experienceOverSixMonths, longerExperience } from '../supabase/functions/_shared/experience-tenure.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const user = { id, email: 'va@example.invalid', email_confirmed_at: '2026-09-01', app_metadata: { account_role: 'candidate' }, user_metadata: { first_name: 'Amy' } };
const shareSlug = '0123456789abcdef0123456789abcdef';
const profile = { user_id: id, full_name: 'Amy Candidate', share_slug: shareSlug, resume_path: id + '/resume.pdf', resume_file_name: 'resume.pdf', verification_status: 'verified', profile_photo_path: 'candidate-profiles/' + id + '/headshot', resume_skills: ['Scheduling'], resume_software: ['Zoom'] };
const job = { id: 'job-one', status: 'active', company: 'North & Co', title: 'Executive Assistant', description: 'Manage schedules.', skills: ['Scheduling'], pay: '$10–$15 / hour' };
const dashboard = {
  profile: { applicationReady: true, verificationStatus: 'verified' },
  applications: [{ id: 'app-one', status: 'shortlisted', submittedAt: '2026-09-01', job }],
  conversations: [{ id, applicationId: 'app-one', company: job.company, roleName: job.title, updatedAt: '2026-09-02', messages: [{ sender: 'employer', body: 'Hello <Amy>', createdAt: '2026-09-02' }] }, { id: other, applicationId: null, company: 'Direct hirer', roleName: 'New opportunity', updatedAt: '2026-09-01', messages: [] }],
};

function browser({ search = '', fail = '', data = dashboard, introUrl = 'https://assets.invalid/intro.mp4' } = {}) {
  const nodes = new Map(), requests = [], history = [];
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, attributes: {}, handlers: {}, dataset: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      focus() { this.focused = true; },
      querySelector(child) { return child === 'video' && !this.innerHTML.includes('<video') ? null : get(selector + ' ' + child); },
    });
    return nodes.get(selector);
  };
  const buttons = ['jobs','messages','applications'].map(tab => { const button = get('#tab-' + tab); button.dataset.dashboardTab = tab; return button; });
  const window = {
    location: { search, replace() {}, assign() {} }, history: { replaceState: (_a,_b,url) => history.push(url) },
    getVerifiedCandidate: async () => user,
    savaPlatform: {
      candidateRequest: async (action, payload) => {
        requests.push({ action, payload });
        if (fail === action) throw new Error('Network unavailable');
        if (action === 'candidateDashboard') return structuredClone(data);
        if (action === 'getProfile') return { profile: { fullName: 'Amy <Candidate>', verificationStatus: 'verified', shareSlug: '0123456789abcdef0123456789abcdef', photoUrl: 'https://assets.invalid/headshot', resumeUrl: 'https://assets.invalid/resume.pdf', resumeFileName: 'resume.pdf', skills: ['Scheduling'], software: ['Zoom'], displayExperience: [{ jobTitle: 'Long role', companyName: 'Atlas Group', startDate: '2023-04', endDate: '2025-08', currentRole: false, description: 'Coordinated work.' }], displayExperienceSource: 'resume' } };
        return { status: 'sent' };
      },
      publicRequest: async action => { requests.push({ action }); if (fail === action) throw new Error('Network unavailable'); return { jobs: [job, { ...job, id: 'job-two', title: 'Bookkeeper', skills: ['Xero'] }, { ...job, id: 'closed', title: 'Closed role', status: 'closed' }] }; },
    }, savaAuth: { auth: { signOut: async () => {} } },
  };
  const context = vm.createContext({ window, document: { querySelector: get, querySelectorAll: () => buttons, body: { classList: { add() {}, remove() {} } } }, URL, URLSearchParams, console, longerExperience, onboardingRequest: async () => ({ stage: 'complete', introUrl }) });
  vm.runInContext(read('candidate-dashboard.js').replace(/^import .*;\n/gm,''), context);
  return { get, requests, history, buttons, flush: () => new Promise(resolve => setImmediate(resolve)), run: source => vm.runInContext(source,context) };
}

test('dashboard has the three header tabs and separate application/conversation views', async () => {
  const h = browser(); await h.flush();
  assert.equal(h.get('#candidateReady').hidden, false);
  assert.equal(h.get('#applicationCount').textContent, '1');
  assert.equal(h.get('#messageCount').textContent, '2');
  assert.match(h.get('#candidateApplications').innerHTML, /Shortlisted/);
  const applicationHtml = h.get('#candidateApplications').innerHTML;
  assert.ok(applicationHtml.indexOf('North &amp; Co') < applicationHtml.indexOf('Executive Assistant'));
  assert.ok(applicationHtml.indexOf('Executive Assistant') < applicationHtml.indexOf('$10–$15 / hour'));
  assert.ok(applicationHtml.indexOf('$10–$15 / hour') < applicationHtml.indexOf('Manage schedules.'));
  assert.ok(applicationHtml.indexOf('Manage schedules.') < applicationHtml.indexOf('Shortlisted'));
  assert.match(applicationHtml, /New message/);
  assert.doesNotMatch(h.get('#candidateApplications').innerHTML, /textarea|Hello/);
  assert.match(h.get('#candidateMessages').innerHTML, /Direct hirer/);
  assert.match(h.get('#candidateMessages').innerHTML, /Hello &lt;Amy&gt;/);
  assert.match(h.get('#candidateMessages').innerHTML, /va-company-avatar/);
  assert.match(h.get('#candidateMessages').innerHTML, />NC<\/span>/);
  assert.match(h.get('#candidateMessages').innerHTML, /<summary>View job post<\/summary>[\s\S]*Manage schedules\./);
  h.run(`selectedConversation = '${other}'; renderMessages()`);
  assert.doesNotMatch(h.get('#candidateMessages').innerHTML, /<summary>View job post<\/summary>/);
  assert.equal(h.get('#tab-applications').attributes['aria-selected'], 'true');
  h.buttons[1].handlers.click();
  assert.equal(h.get('#panel-messages').hidden, false);
  assert.equal(h.get('#panel-applications').hidden, true);
  assert.equal(h.history.at(-1), '?tab=messages');
});

test('tabs support keyboard navigation and invalid deep links fall back to applications', async () => {
  const h = browser({ search: '?tab=unknown' }); await h.flush();
  let prevented = false;
  h.buttons[1].handlers.keydown({ key: 'Home', preventDefault() { prevented = true; } }); await h.flush();
  assert.equal(prevented, true);
  assert.equal(h.get('#tab-jobs').focused, true);
  assert.equal(h.get('#panel-jobs').hidden, false);
});

test('dashboard chrome removes the welcome block and keeps profile inside the avatar menu', () => {
  const html = read('candidate-dashboard.html');
  assert.doesNotMatch(html, /VA workspace|Welcome back|Your next opportunity|candidateIdentityStatus|candidateSignOut|id="tab-profile"/i);
  assert.match(html, /id="tab-jobs"[\s\S]*id="tab-messages"[\s\S]*id="tab-applications"/);
  const menu = read('account-menu.js');
  assert.match(menu, /va-dashboard-page[\s\S]*candidate-dashboard\.html\?tab=profile/);
});

test('jobs load lazily, filter active roles, mark applied jobs and search skills', async () => {
  const h = browser(); await h.flush();
  assert.equal(h.requests.some(request => request.action === 'listJobs'), false);
  h.run("switchTab('jobs')"); await h.flush();
  assert.match(h.get('#candidateJobs').innerHTML, /Applied ✓/);
  h.run("selectedJobId = 'job-two'; renderJobs()");
  assert.match(h.get('#candidateJobDetail').innerHTML, /application-questions.html\?job=job-two/);
  assert.match(h.get('#candidateJobDetail').innerHTML, /va-job-title-row/);
  assert.doesNotMatch(h.get('#candidateJobDetail').innerHTML, /va-job-detail-action/);
  assert.doesNotMatch(h.get('#candidateJobs').innerHTML, /Closed role/);
  h.get('#jobSearch').value = 'xero'; h.get('#jobSearch').handlers.input();
  assert.match(h.get('#candidateJobs').innerHTML, /Bookkeeper/);
  assert.doesNotMatch(h.get('#candidateJobs').innerHTML, /Executive Assistant/);
});

test('job search uses a scrollable master-detail layout with real filters', () => {
  const html = read('candidate-dashboard.html');
  assert.match(html, /id="jobSearch"[\s\S]*id="jobArrangement"[\s\S]*id="jobType"/);
  assert.match(html, /id="candidateJobs"[\s\S]*id="candidateJobDetail"/);
  const css = read('candidate-dashboard.css');
  assert.match(css, /\.va-job-list\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.va-job-browser\s*\{[^}]*grid-template-columns/);
});

test('profile shows candidate details, playable video, signed resume and escaped name', async () => {
  const h = browser({ search: '?tab=profile' }); await h.flush();
  const html = h.get('#candidateProfile').innerHTML;
  assert.match(html, /Amy &lt;Candidate&gt;/);
  assert.match(html, /va@example.invalid/);
  assert.match(html, /<video[^>]+controls/);
  assert.match(html, /https:\/\/assets.invalid\/resume.pdf/);
  assert.match(html, /Scheduling/);
  assert.match(html, /Long role[\s\S]*Atlas Group/);
  assert.match(html, /FROM YOUR RESUME<\/p><h3>Skills<\/h3>[\s\S]*Scheduling/);
  assert.match(html, /FROM YOUR RESUME<\/p><h3>Tools & Software<\/h3>[\s\S]*Zoom/);
  assert.doesNotMatch(html, /Skill Matches|skills match|Experience & skills/i);
  assert.match(html, /candidate-public-profile.html\?profile=0123456789abcdef0123456789abcdef/);
  assert.match(html, /Copy link/);
  assert.match(html, /Requested rate from \(USD\/hour\)[\s\S]*Requested rate to \(USD\/hour\)[\s\S]*Hours available per week[\s\S]*City and country/);
  assert.match(html, /Ideal jobs \(up to five/);
  assert.match(html, /When you can start/);
  assert.match(html, /Other job preferences/);
});

test('candidate can replace a headshot from the dashboard profile', async () => {
  const h = browser({ search: '?tab=profile' }); await h.flush();
  const html = h.get('#candidateProfile').innerHTML;
  assert.match(html, /id="changeProfilePhoto"[^>]*>Change headshot/);
  assert.match(html, /id="profilePhotoFile"[^>]*type="file"/);
  assert.match(read('candidate-dashboard.html'), /id="profilePhotoStatus"[^>]*role="status"/);
  assert.match(read('candidate-dashboard.js'), /fetch\(PHOTO_ENDPOINT,[\s\S]*Authorization: `Bearer \$\{token\}`/);
  assert.match(read('candidate-dashboard.js'), /profileLoaded = false;[\s\S]*await loadProfile\(\)/);
});

test('headshot upload stores a new private object and updates only the owner profile', async () => {
  let handler;
  const operations = [];
  const source = stripTypeScriptTypes(read('supabase/functions/submit-profile-photo/index.ts').replace(/^import .*;\n/gm, ''), { mode: 'strip' });
  const stored = { profile_photo_path: 'candidate-profiles/' + id + '/profile', resume_path: id + '/resume.pdf' };
  const storage = { upload: async (path, photo, options) => { operations.push({ kind: 'upload', path, type: photo.type, options }); return { error: null }; }, remove: async paths => { operations.push({ kind: 'remove', paths }); return { error: null }; } };
  const profileQuery = { select() { return this; }, eq(column, value) { operations.push({ kind: 'owner', column, value }); return this; }, maybeSingle: async () => ({ data: stored, error: null }) };
  const updateQuery = { eq(column, value) { operations.push({ kind: 'updateOwner', column, value }); return this; }, select() { return this; }, maybeSingle: async () => ({ data: { user_id: id }, error: null }) };
  const admin = { auth: { getUser: async () => ({ data: { user }, error: null }) }, storage: { from: () => storage }, from: () => ({ select: () => profileQuery, update: values => { operations.push({ kind: 'update', values }); return updateQuery; } }) };
  vm.runInNewContext(source, { createClient: () => admin, Deno: { serve: fn => { handler = fn; }, env: { get: () => 'test' } }, crypto, File, FormData, Request, Response, Set, Date, console });
  const form = new FormData();
  form.append('photo', new File(['real image bytes'], 'headshot.jpg', { type: 'image/jpeg' }));
  const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { origin: 'https://www.hirefromsa.com', authorization: 'Bearer fixture-token' }, body: form }));
  assert.equal(response.status, 201);
  const { path } = await response.json();
  assert.match(path, new RegExp('^candidate-profiles/' + id + '/profile-[0-9a-f-]+\\.jpg$'));
  assert.notEqual(path, stored.profile_photo_path);
  assert.equal(operations.find(op => op.kind === 'upload').options.upsert, false);
  assert.deepEqual(operations.find(op => op.kind === 'updateOwner'), { kind: 'updateOwner', column: 'user_id', value: id });
  assert.deepEqual(Object.keys(operations.find(op => op.kind === 'update').values).sort(), ['profile_photo_path', 'updated_at']);
  assert.equal(operations.find(op => op.kind === 'update').values.profile_photo_path, path);
});

test('profile omits unsafe video URLs and presents a recording action', async () => {
  const h = browser({ search: '?tab=profile', introUrl: 'javascript:alert(1)' }); await h.flush();
  assert.doesNotMatch(h.get('#candidateProfile').innerHTML, /<video|javascript:/);
  assert.match(h.get('#candidateProfile').innerHTML, /Record your video/);
});

test('switching tabs pauses the introduction preview', async () => {
  const h = browser({ search: '?tab=profile' }); await h.flush();
  let paused = false;
  h.get('#candidateProfile video').pause = () => { paused = true; };
  h.run("switchTab('applications')");
  assert.equal(paused, true);
});

test('dashboard and jobs failures show retry actions, not false empty states', async () => {
  const failed = browser({ fail: 'candidateDashboard' }); await failed.flush();
  assert.equal(failed.get('#dashboardRetry').hidden, false);
  assert.equal(failed.get('#portalStatus').textContent, 'Network unavailable');
  const h = browser({ search: '?tab=jobs', fail: 'listJobs' }); await h.flush();
  assert.equal(h.get('#jobsRetry').hidden, false);
  assert.equal(h.get('#jobsStatus').textContent, 'Network unavailable');
});

test('inbox refresh keeps a typed draft and failure keeps the existing conversation', async () => {
  const h = browser(); await h.flush();
  h.get('#candidateMessages textarea').value = 'My unsent reply';
  await h.run('refreshInbox()');
  assert.equal(h.get('#candidateMessages textarea').value, 'My unsent reply');
  assert.equal(h.get('#refreshInbox').disabled, false);
  h.run("window.savaPlatform.candidateRequest = async () => { throw new Error('Offline'); }");
  await h.run('refreshInbox()');
  assert.equal(h.get('#inboxStatus').textContent, 'Offline');
  assert.match(h.get('#candidateMessages').innerHTML, /Direct hirer/);
});

test('direct-thread replies send once and failed sends preserve the message', async () => {
  const h = browser({ fail: 'candidateSendThreadMessage' }); await h.flush();
  h.run('selectedConversation = ' + JSON.stringify(other));
  const button = { disabled: false }, status = { textContent: '' };
  const form = { reportValidity: () => true, elements: { message: { value: 'Hello there' } }, querySelector: selector => selector === 'button' ? button : status };
  const event = { target: { closest: () => form }, preventDefault() {} };
  const send = h.get('#candidateMessages').handlers.submit(event);
  await h.get('#candidateMessages').handlers.submit(event);
  await send;
  assert.equal(h.requests.filter(request => request.action === 'candidateSendThreadMessage').length, 1);
  assert.equal(form.elements.message.value, 'Hello there');
  assert.equal(status.textContent, 'Network unavailable');
  assert.equal(button.disabled, false);
});

async function platform(action, payload = {}, records = {}, authUser = user) {
  const queries = [], writes = [], signed = [];
  const admin = {
    auth: { getUser: async () => ({ data: { user: authUser }, error: null }) },
    storage: { from: bucket => ({ list: async (folder, options) => ({ data: (records.storage_objects || []).filter(path => path.startsWith(folder + '/')).map(path => ({ name: path.slice(folder.length + 1) })).filter(file => file.name.includes(options.search || '')).slice(0, options.limit), error: null }), createSignedUrl: async (path, ttl) => { signed.push({ bucket, path, ttl }); return { data: { signedUrl: 'https://assets.invalid/' + path }, error: null }; } }) },
    from(table) {
      const query = { table, filters: [] }; queries.push(query);
      const rows = () => (records[table] || []).filter(row => query.filters.every(([column, values]) => values.includes(row[column])));
      const result = () => ({ data: rows(), error: null });
      return {
        select() { return this; }, order() { return this; },
        eq(column,value) { query.filters.push([column,[value]]); return this; },
        in(column,values) { query.filters.push([column,values]); return this; },
        upsert(value) { writes.push({ table, value }); return this; },
        insert(value) { query.insert = value; writes.push({ table, value }); return this; },
        update(value) { writes.push({ table, value }); return this; },
        maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
        single: async () => ({ data: query.insert ? { id: 'saved-message', ...query.insert, created_at: '2026-09-17T10:00:00Z' } : rows()[0] || null, error: null }),
        then(resolve,reject) { return Promise.resolve(result()).then(resolve,reject); },
      };
    },
  };
  let handler;
  vm.runInNewContext(stripTypeScriptTypes(read('supabase/functions/hiring-platform/index.ts').replace(/^import .*;\n/gm,'')), { createClient: () => admin, parsePortfolioLinks, publicPortfolioLinks, candidateAccess, onboardingStage, RESUME_INDEX_VERSION, longerExperience, Deno: { env: { get: () => 'fixture' }, serve: fn => { handler = fn; } }, Response, console, crypto, TextEncoder });
  const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { authorization: 'Bearer fixture', origin: 'https://www.hirefromsa.com', 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) }));
  return { response, data: await response.json(), queries, writes, signed };
}

test('server exposes all and only the candidate-owned conversations, including direct hirers', async () => {
  const h = await platform('candidateDashboard', {}, {
    candidate_profiles: [profile],
    job_applications: [{ id: 'app-one', candidate_id: id, job_id: 'job-one' }],
    hiring_jobs: [{ id: 'job-one', company_name: job.company, title: job.title }],
    hirer_workspaces: [{ id: 'hirer-one', company_name: 'Direct hirer' }],
    candidate_message_threads: [{ id, employer_id: 'hirer-one', candidate_id: id, application_id: 'app-one', role_name: job.title }, { id: 'direct', employer_id: 'hirer-one', candidate_id: id, application_id: null }, { id: 'private', candidate_id: other, employer_id: 'elsewhere' }],
    candidate_messages: [{ thread_id: id, body: 'Application reply' }, { thread_id: 'direct', body: 'Direct reply' }, { thread_id: 'private', body: 'Secret' }],
  });
  assert.equal(h.response.status, 200);
  assert.equal(h.data.conversations.length, 2);
  assert.equal(h.data.conversations[1].company, 'Direct hirer');
  assert.equal(h.data.conversations[1].messages[0].body, 'Direct reply');
  assert.doesNotMatch(JSON.stringify(h.data), /Secret|private/);
});

test('server signs private profile photo/resume and returns indexed skills and software', async () => {
  const h = await platform('getProfile', {}, { candidate_profiles: [profile, { ...profile, user_id: other, full_name: 'Someone else' }] });
  assert.equal(h.data.profile.fullName, 'Amy Candidate');
  assert.deepEqual(h.data.profile.skills, ['Scheduling']);
  assert.deepEqual(h.data.profile.software, ['Zoom']);
  assert.equal(h.signed.length, 2);
  assert.ok(h.signed.every(asset => asset.ttl === 3600 && asset.path.includes(id)));
});

test('candidate can save the four card details only to their own profile', async () => {
  const payload = { requestedRateMinUsd: '5', requestedRateMaxUsd: '9', availableHoursPerWeek: '40', location: 'Cape Town, South Africa' };
  const saved = await platform('updateCandidateProfileFacts', payload, { candidate_profiles: [profile] });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.status, 'saved');
  assert.equal(saved.writes[0].value.requested_rate_min_usd, 5);
  assert.equal(saved.writes[0].value.requested_rate_max_usd, 9);
  assert.equal(saved.writes[0].value.available_hours_per_week, 40);
  assert.equal(saved.writes[0].value.location, 'Cape Town, South Africa');
  assert.ok(saved.queries.at(-1).filters.some(([column, values]) => column === 'user_id' && values[0] === id));
  const invalid = await platform('updateCandidateProfileFacts', { ...payload, requestedRateMaxUsd: '3' }, { candidate_profiles: [profile] });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.writes.length, 0);
  const anonymous = await platform('updateCandidateProfileFacts', payload, { candidate_profiles: [profile] }, null);
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.writes.length, 0);
});

test('public share endpoint exposes a verified profile without contact details or account IDs', async () => {
  const h = await platform('publicCandidateProfile', { shareSlug }, { candidate_profiles: [{ ...profile, email: 'private@example.com', calendar_link: 'https://calendar.invalid/private', experience: [], resume_job_titles: ['Executive Assistant'], resume_education: ['Business Administration Diploma'], resume_certifications: ['Project Management Certificate'], resume_summary: 'Pretoria [EMAIL REDACTED] [PHONE REDACTED] Amy Candidate' }] }, null);
  assert.equal(h.response.status, 200);
  assert.equal(h.data.profile.name, 'Amy Candidate');
  assert.deepEqual(h.data.profile.skills, ['Scheduling']);
  assert.deepEqual(h.data.profile.software, ['Zoom']);
  assert.deepEqual(h.data.profile.jobTitles, ['Executive Assistant']);
  assert.deepEqual(h.data.profile.education, ['Business Administration Diploma']);
  assert.deepEqual(h.data.profile.certifications, ['Project Management Certificate']);
  assert.match(h.data.profile.summary, /Key skills include Scheduling/);
  assert.doesNotMatch(h.data.profile.summary, /REDACTED|Pretoria/);
  assert.match(JSON.stringify(h.data.profile), /Executive Assistant/);
  assert.doesNotMatch(JSON.stringify(h.data.profile), /private@example|calendar\.invalid|userId|user_id|shareSlug/);
  const invalid = await platform('publicCandidateProfile', { shareSlug: 'not-a-share-link' }, { candidate_profiles: [profile] }, null);
  assert.equal(invalid.response.status, 404);
  const pending = await platform('publicCandidateProfile', { shareSlug }, { candidate_profiles: [{ ...profile, verification_status: 'pending', verification_bypass: false }] }, null);
  assert.equal(pending.response.status, 404);
});

test('profiles use dated work history extracted from the stored resume when no manual history exists', async () => {
  const extracted = [{ jobTitle: 'Operations Coordinator', companyName: 'Atlas Group', startDate: '2023-04', endDate: '2025-08', currentRole: false, description: 'Coordinated client work and schedules.' }];
  const candidate = { ...profile, experience: [], resume_experience: extracted, resume_index_version: RESUME_INDEX_VERSION };
  const publicResult = await platform('publicCandidateProfile', { shareSlug }, { candidate_profiles: [candidate] }, null);
  assert.equal(publicResult.response.status, 200);
  assert.equal(publicResult.data.profile.experienceSource, 'resume');
  assert.equal(publicResult.data.profile.experience[0].companyName, 'Atlas Group');
  const ownResult = await platform('getProfile', {}, { candidate_profiles: [candidate] });
  assert.equal(ownResult.data.profile.resumeExperience[0].jobTitle, 'Operations Coordinator');
});

test('experience only displays roles with more than six confirmed months', async () => {
  const now = new Date('2026-09-27T00:00:00Z');
  const role = (jobTitle, startDate, endDate = '', currentRole = false) => ({ jobTitle, companyName: 'Atlas Group', startDate, endDate, currentRole, description: 'Supported customers.' });
  assert.equal(experienceOverSixMonths(role('Six months', '2025-01', '2025-06'), now), false);
  assert.equal(experienceOverSixMonths(role('Seven months', '2025-01', '2025-07'), now), true);
  assert.equal(experienceOverSixMonths(role('Current short role', '2026-04', '', true), now), false);
  assert.equal(experienceOverSixMonths(role('Current longer role', '2026-03', '', true), now), true);
  assert.equal(experienceOverSixMonths(role('Uncertain years', '2023', '2024'), now), false);
  assert.equal(experienceOverSixMonths(role('Confirmed years', '2023', '2025'), now), true);
  const roles = [role('Short role', '2026-01', '2026-03'), role('Long role', '2023-04', '2025-08')];
  const candidate = { ...profile, experience: [], resume_experience: roles, resume_index_version: RESUME_INDEX_VERSION };
  const result = await platform('publicCandidateProfile', { shareSlug }, { candidate_profiles: [candidate] }, null);
  assert.equal(result.response.status, 200);
  assert.deepEqual(Array.from(result.data.profile.experience, entry => entry.jobTitle), ['Long role']);
  const ownResult = await platform('getProfile', {}, { candidate_profiles: [candidate] });
  assert.deepEqual(Array.from(ownResult.data.profile.displayExperience, entry => entry.jobTitle), ['Long role']);
  assert.equal(ownResult.data.profile.resumeExperience.length, 2);
});

test('public profile contact links only a verified candidate to an authenticated hirer', async () => {
  async function requestProfileMessages(employer, candidateProfile) {
    let handler;
    const writes = [];
    const rows = { candidate_profiles: [candidateProfile], hirer_workspaces: [], candidate_message_threads: [], candidate_messages: [] };
    const admin = {
      auth: { getUser: async () => ({ data: { user: employer }, error: null }) },
      from(table) {
        const query = { filters: [], inserted: null };
        const matching = () => (rows[table] || []).filter(row => query.filters.every(([key, value]) => row[key] === value));
        return {
          select() { return this; },
          eq(key, value) { query.filters.push([key, value]); return this; },
          order() { return this; },
          limit: async () => ({ data: matching(), error: null }),
          maybeSingle: async () => ({ data: matching()[0] || null, error: null }),
          insert(value) { query.inserted = { id: table === 'candidate_message_threads' ? 'thread-1' : value.id, ...value }; writes.push({ table, value }); rows[table].push(query.inserted); return this; },
          update(value) { writes.push({ table, value }); return this; },
          single: async () => ({ data: query.inserted, error: null }),
          then(resolve, reject) { return Promise.resolve({ data: query.inserted, error: null }).then(resolve, reject); },
        };
      },
    };
    const source = stripTypeScriptTypes(read('supabase/functions/candidate-messages/index.ts').replace(/^import .*;\n/gm, ''), { mode: 'strip' });
    vm.runInNewContext(source, { createClient: () => admin, parsePortfolioLinks, publicPortfolioLinks, candidateAccess, MASTER_TOKEN_PATTERN: /^hfm_[a-f0-9]{64}$/, masterAccount: async () => null, masterWorkspaceHash: async () => null, Deno: { env: { get: () => 'fixture' }, serve: fn => { handler = fn; } }, Response, Request, crypto, TextEncoder, console });
    const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { origin: 'https://www.hirefromsa.com', authorization: 'Bearer employer-session', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'list', employerId: id, editToken: 'a'.repeat(64), candidateKey: `profile:${shareSlug}`, candidateName: 'Amy Candidate', roleName: 'Executive Assistant' }) }));
    return { response, writes };
  }
  const employer = { id: other, email_confirmed_at: '2026-09-01', app_metadata: { account_role: 'employer' }, user_metadata: { company_name: 'North & Co' } };
  const linked = await requestProfileMessages(employer, profile);
  assert.equal(linked.response.status, 200);
  assert.equal(linked.writes.find(write => write.table === 'candidate_message_threads').value.candidate_id, id);
  const anonymous = await requestProfileMessages(null, profile);
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.writes.length, 0);
  const pending = await requestProfileMessages(employer, { ...profile, verification_status: 'pending' });
  assert.equal(pending.response.status, 404);
  assert.equal(pending.writes.length, 0);
});

test('public profile shows resume background when manual work history is empty', async () => {
  const nodes = new Map();
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '', hidden: false, content: '', addEventListener() {} });
    return nodes.get(selector);
  };
  const publicProfile = {
    name: 'Amy Candidate', primaryRole: 'Executive Assistant', summary: 'Supports busy teams.', relevantYears: 7,
    requestedRateMinUsd: 5, requestedRateMaxUsd: 9, availableHoursPerWeek: 40, location: 'Cape Town, South Africa',
    portfolioLinks: ['https://example.com/work?x=1&y=2', 'javascript:alert(1)'],
    experience: [], jobTitles: ['Executive Assistant'], skills: ['Scheduling'], software: ['Notion'],
    industries: ['Professional services'], education: ['Business Administration Diploma', 'Leadership Program', 'Marketing Course', 'Design Course'],
    certifications: ['Project Management Certificate'], languages: ['English'], verified: true,
  };
  vm.runInNewContext(read('candidate-public-profile.js'), {
    document: { querySelector: get, addEventListener() {}, title: '' },
    window: { savaPlatform: { publicRequest: async () => ({ profile: publicProfile }) } },
    location: { search: '?profile=' + shareSlug }, URL, URLSearchParams,
    navigator: {}, Intl, Date,
  });
  await new Promise(resolve => setImmediate(resolve));
  const html = get('#publicProfile').innerHTML;
  assert.match(html, /href="https:\/\/example.com\/work\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.match(html, /public-profile-experience-panel[\s\S]* Background<\/h2>/);
  assert.doesNotMatch(html, /ROLES FOUND IN RESUME|<h2>Work Experience<\/h2>/);
  assert.match(html, /EDUCATION[\s\S]*Business Administration Diploma/);
  assert.match(html, /Show 1 more/);
  assert.match(html, /CERTIFICATIONS[\s\S]*Project Management Certificate/);
  assert.match(html, /\$5–\$9\/hr[\s\S]*<small>Requested Rate<\/small>[\s\S]*7 Years[\s\S]*<small>Experience<\/small>[\s\S]*40 hrs\/week[\s\S]*<small>Availability<\/small>[\s\S]*Cape Town, South Africa[\s\S]*<small>Location<\/small>/);
  assert.ok(html.indexOf('public-profile-facts') < html.indexOf('public-profile-intro'));
  assert.ok(html.indexOf('About Amy') < html.indexOf('Background'));
  assert.equal((html.match(/data-contact-public/g) || []).length, 2);
  assert.doesNotMatch(html, /data-interview-public|Interview Amy|invite Amy to interview/);
  assert.match(html, /data-save-public[\s\S]*data-share-public/);
  assert.ok(html.indexOf('public-profile-experience-panel') < html.indexOf('public-profile-skills-panel'));
  assert.match(html, /public-profile-skills-panel[\s\S]*<h2>Skills<\/h2>[\s\S]*From resume[\s\S]*Scheduling/);
  assert.match(html, /public-profile-tools-panel[\s\S]*Tools & Software[\s\S]*From resume[\s\S]*Notion/);
  assert.doesNotMatch(html, /Skill Matches|skills match|public-profile-skill-count|public-profile-skills"><span><i/i);
  assert.doesNotMatch(html, /Listed skills|Work experience/);
});

test('share page is public, privacy-safe, and included in the production build', () => {
  const html = read('candidate-public-profile.html');
  const script = read('candidate-public-profile.js');
  const migration = read('supabase/migrations/20260923144504_add_candidate_share_links.sql');
  assert.match(html, /noindex,nofollow/);
  assert.match(script, /publicCandidateProfile/);
  assert.doesNotMatch(script, /profile\.email|calendarLink|resumeUrl|userId/);
  assert.match(migration, /share_slug text/);
  assert.match(read('vite.config.js'), /candidatePublicProfile/);
});

test('thread reply requires ownership before any message insert', async () => {
  const h = await platform('candidateSendThreadMessage', { threadId: other, message: 'Unauthorized' }, { candidate_message_threads: [{ id: other, candidate_id: other }] });
  assert.equal(h.response.status, 404);
  assert.equal(h.writes.length, 0);
  const sent = await platform('candidateSendThreadMessage', { threadId: id, message: ' Hello ' }, { candidate_message_threads: [{ id, candidate_id: id }] });
  assert.equal(sent.response.status, 201);
  assert.equal(sent.data.threadId, id);
  assert.equal(sent.data.message.id, 'saved-message');
  assert.equal(sent.data.message.createdAt, '2026-09-17T10:00:00Z');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.writes[0].value)), { thread_id: id, sender: 'candidate', body: 'Hello' });
  assert.ok(sent.queries.at(-1).filters.some(([key, values]) => key === 'candidate_id' && values[0] === id));
});

test('thread reply rejects invalid IDs, empty messages and unauthenticated requests', async () => {
  for (const payload of [{ threadId: 'bad', message: 'Hello' }, { threadId: id, message: ' ' }]) {
    const h = await platform('candidateSendThreadMessage', payload);
    assert.equal(h.response.status, 400); assert.equal(h.writes.length, 0);
  }
  const h = await platform('candidateSendThreadMessage', { threadId: id, message: 'Hello' }, {}, null);
  assert.equal(h.response.status, 401); assert.equal(h.queries.length, 0);
});

test('application navigation returns to dashboard and never substitutes another role', () => {
  assert.match(read('application-questions.html'), /candidate-dashboard.html\?tab=jobs/);
  assert.doesNotMatch(read('application-questions.html'), /src="\.\/script.js"/);
  assert.doesNotMatch(read('application-questions.js'), /\|\| jobs\[0\]/);
  assert.match(read('application-questions.js'), /item.status === 'active'/);
});

test('profile readiness agrees with application submission after all onboarding steps', async () => {
  const records = { candidate_profiles: [profile] };
  const incomplete = await platform('getProfile', {}, records);
  assert.equal(incomplete.data.profile.applicationReady, false);
  const complete = await platform('getProfile', {}, { ...records, candidate_onboarding: [{ user_id: id, platform_completed_at: 'now', intro_completed_at: 'now', intro_skipped_at: 'now' }] });
  assert.equal(complete.data.profile.applicationReady, true);
});

test('connecting a versioned headshot checks its exact filename and ownership', async()=>{
  const path=`candidate-profiles/${id}/profile-12345678-1234-4123-8123-123456789abc.jpg`;
  const records={candidate_profiles:[{...profile,profile_photo_path:''}],storage_objects:[...Array.from({length:15},(_,i)=>`candidate-profiles/${id}/profile-${i}.jpg`),path]};
  const saved=await platform('saveProfile',{photoPath:path},records);assert.equal(saved.response.status,200);
  assert.equal(saved.writes[0].value.profile_photo_path,path);
  const foreign=await platform('saveProfile',{photoPath:`candidate-profiles/${other}/profile`},records);
  assert.equal(foreign.response.status,400);assert.equal(foreign.writes.length,0);
  const missing=await platform('saveProfile',{photoPath:path},{...records,storage_objects:[]});
  assert.equal(missing.response.status,400);assert.equal(missing.writes.length,0);
});

test('portfolio links can be edited or removed by their owner, and are returned on both profile views', async () => {
  const input = { portfolioLinks: 'https://example.com/work\nhttps://behance.net/candidate', userId: other };
  const saved = await platform('updateCandidateProfileFacts', input, { candidate_profiles: [profile] });
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.writes[0].value.portfolio_links, ['https://example.com/work', 'https://behance.net/candidate']);
  assert.ok(saved.queries.at(-1).filters.some(([key, values]) => key === 'user_id' && values[0] === id));
  const records = { candidate_profiles: [{ ...profile, portfolio_links: saved.writes[0].value.portfolio_links }] };
  const own = await platform('getProfile', {}, records);
  const shared = await platform('publicCandidateProfile', { shareSlug }, records, null);
  assert.deepEqual(own.data.profile.portfolioLinks, input.portfolioLinks.split('\n'));
  assert.deepEqual(shared.data.profile.portfolioLinks, own.data.profile.portfolioLinks);
  for (const bad of ['javascript:alert(1)', 'https://user:password@example.com', Array.from({length:6}, (_,i) => `https://example.com/${i}`).join('\n')]) {
    const rejected = await platform('updateCandidateProfileFacts', { portfolioLinks: bad }, records);
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.writes.length, 0);
  }
  const omitted = await platform('updateCandidateProfileFacts', {}, records);
  assert.equal(Object.hasOwn(omitted.writes[0].value, 'portfolio_links'), false);
  const removed = await platform('updateCandidateProfileFacts', { portfolioLinks: '' }, records);
  assert.deepEqual(removed.writes[0].value.portfolio_links, []);
});
