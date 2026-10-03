import { demoKey, initial, demoStatus, transition } from './full-onboarding-demo-state.mjs';
import { indexResume } from '../supabase/functions/_shared/resume-index.mjs';
import { redactContactInfo } from '../supabase/functions/_shared/redact-contact-info.mjs';
import { parsePortfolioLinks } from '../supabase/functions/_shared/portfolio-links.mjs';
import { guides } from '../onboarding-videos.mjs';
import { longerExperience } from '../supabase/functions/_shared/experience-tenure.mjs';

if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw Error('This demo runs locally.');
const params = new URLSearchParams(location.search), realFetch = window.fetch.bind(window);
let saved;
try { saved = JSON.parse(localStorage.getItem(demoKey)) || initial(); } catch { saved = initial(); }
const persist = () => localStorage.setItem(demoKey, JSON.stringify(saved));
const database = new Promise((resolve, reject) => {
  const request = indexedDB.open(demoKey, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('files');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(Error('Allow browser storage to save demo uploads.'));
});
async function media(method, key, value) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', method === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('files');
    const request = method === 'put' ? store.put(value, key) : method === 'clear' ? store.clear() : store[method](key);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(Error('Could not save this demo upload. Free browser storage and retry.'));
  });
}
const urls = new Map();
async function fileUrl(name) {
  if (urls.has(name)) return urls.get(name);
  const file = await media('get', name);
  if (!file) return '';
  const url = URL.createObjectURL(file); urls.set(name, url); return url;
}
function clearUrl(name) { if (urls.has(name)) URL.revokeObjectURL(urls.get(name)); urls.delete(name); }
window.addEventListener('pagehide', () => { for (const url of urls.values()) URL.revokeObjectURL(url); });
window.__fullDemoErrors = [];
window.addEventListener('error', event => window.__fullDemoErrors.push(event.message));
window.addEventListener('unhandledrejection', event => window.__fullDemoErrors.push(String(event.reason)));
const page = params.get('page') || 'start';
const demoUrl = (name, query = '') => '/scripts/full-onboarding-demo.html?' + new URLSearchParams({ page: name, ...Object.fromEntries(new URLSearchParams(query)) });
window.demoNavigate = url => {
  const target = new URL(url, location.origin + '/');
  if (target.pathname === '/scripts/full-onboarding-demo.html') { location.assign(target.href); return; }
  const name = target.pathname.split('/').at(-1).replace('.html', '');
  location.assign(name === 'home' ? '/scripts/full-onboarding-demo.html' : demoUrl(name, target.search));
};
const user = () => ({ id: 'local-demo', email: saved.email || 'demo@example.invalid', app_metadata: { account_role: 'candidate' }, user_metadata: { first_name: saved.firstName, last_name: saved.lastName } });
window.getVerifiedCandidate = async () => saved.confirmed ? user() : null;
window.getVerifiedUser = window.getVerifiedCandidate;
window.getVerifiedEmployer = async () => ({ id: 'demo-employer' });
window.getAccessToken = async () => 'browser-demo-only';
window.masterSessionToken = () => null;
window.signOutAccount = async () => { saved.confirmed = false; persist(); };
window.savaAuth = { auth: {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  verifyOtp: async ({ token, email }) => {
    if (token !== '123456' || email.toLowerCase() !== saved.email) return { error: Error('Use demo code 123456 and the email you entered at signup.') };
    saved.confirmed = true; persist(); return { error: null };
  },
  resend: async () => ({ error: null }),
  signOut: window.signOutAccount,
  signInWithPassword: async ({ email }) => {
    if (!saved.email || email.toLowerCase() !== saved.email) return { error: Error('Use the email from your demo signup. Any 10-character demo password works.') };
    saved.confirmed = true; persist(); return { data: { user: user() }, error: null };
  },
} };
const roles = [
  { id: 'demo-assistant', company: 'North & Co · Demo', title: 'Executive Assistant', arrangement: 'Remote', type: 'Full-time', location: 'South Africa', status: 'active', pay: '$10–$15 / hour', description: 'Support a growing team with calendar management, inbox organization and client coordination.', responsibilities: ['Manage executive calendars', 'Keep projects and client communication organized'], skills: ['Scheduling', 'Communication'], questions: [{ text: 'Tell us about your experience supporting a busy team.', type: 'text' }, { text: 'Can you work US business hours?', type: 'multiple-choice', options: ['Yes', 'Some overlap', 'No'] }] },
  { id: 'demo-bookkeeper', company: 'Bright Studio · Demo', title: 'Bookkeeper', arrangement: 'Remote', type: 'Part-time', location: 'South Africa', status: 'active', pay: '$12–$18 / hour', description: 'Keep accurate books and prepare monthly reports for a small creative studio.', responsibilities: ['Reconcile accounts', 'Prepare reports'], skills: ['Xero', 'Bookkeeping'], questions: [] },
  { id: 'demo-support', company: 'Cedar Health · Demo', title: 'Customer Support Specialist', arrangement: 'Remote', type: 'Full-time', location: 'South Africa', status: 'active', pay: '$9–$13 / hour', description: 'Help customers across email and chat and track recurring product feedback.', skills: ['Customer support', 'Written communication'], questions: [] },
  { id: 'demo-operations', company: 'Fieldwork Labs · Demo', title: 'Operations Coordinator', arrangement: 'Remote', type: 'Contractor', location: 'South Africa', status: 'active', pay: '$11–$16 / hour', description: 'Coordinate projects, document processes and keep the operations team organized.', skills: ['Project management', 'Notion'], questions: [] },
];
async function profile() {
  const index = saved.resumeIndex || {};
  return { fullName: saved.profile.full_name || 'Demo Candidate', email: user().email, resumePath: saved.profile.resume_path, resumeUrl: await fileUrl('redactedResume') || await fileUrl('resume'), resumeFileName: saved.resumeName || '', photoPath: saved.profile.profile_photo_path, photoUrl: await fileUrl('photo'), resumeRequired: !saved.profile.resume_path, verificationStatus: saved.profile.verification_status, applicationReady: demoStatus(saved).stage === 'complete', idealJobTitles: index.jobTitles || [], summary: index.summary || '', skills: index.skills || [], software: index.software || [], displayExperience: longerExperience(index.experience), displayExperienceSource: 'resume', ...saved.preferences, ...saved.facts };
}
async function publicProfile() {
  const value = await profile(), index = saved.resumeIndex || {};
  return { ...value, name: value.fullName, primaryRole: value.idealJobTitles[0] || 'Remote professional', relevantYears: index.yearsExperience || 0, verified: saved.profile.verification_status === 'verified', experience: value.displayExperience, experienceSource: 'resume', introUrl: await fileUrl('intro'), industries: index.industries || [], languages: index.languages || [], education: index.education || [], certifications: index.certifications || [] };
}
window.savaPlatform = {
  employerIdentity: () => ({ employerId: 'demo-employer', editToken: 'browser-only' }),
  publicRequest: async action => action === 'publicCandidateProfile' ? { profile: await publicProfile() } : { jobs: structuredClone(roles) },
  candidateRequest: async (action, payload = {}) => {
    if (saved.failures.account) { saved.failures.account--; persist(); throw Error('Demo account load failed. Try loading again.'); }
    if (action === 'getProfile') return { profile: await profile() };
    if (action === 'candidateDashboard') return { profile: await profile(), applications: saved.applications, conversations: saved.conversations };
    if (action === 'updateCandidateProfileFacts') {
      const facts = { ...payload, idealJobTitles: payload.idealJobTitles.split(/[,\n]/).map(value => value.trim()).filter(Boolean), portfolioLinks: parsePortfolioLinks(payload.portfolioLinks) };
      saved.facts = facts; persist(); return { status: 'saved' };
    }
    if (action === 'submitApplication') {
      if (demoStatus(saved).stage !== 'complete') throw Error('Complete onboarding first.');
      if (!saved.applications.some(item => item.job.id === payload.jobId)) saved.applications.push({ id: 'demo-application-' + Date.now(), job: roles.find(role => role.id === payload.jobId), status: 'new', submittedAt: new Date().toISOString(), answers: payload.answers });
      persist(); return { status: 'submitted' };
    }
    if (['candidateSendMessage', 'candidateSendThreadMessage'].includes(action)) {
      let thread = saved.conversations.find(item => payload.threadId ? item.id === payload.threadId : item.applicationId === payload.applicationId);
      if (!thread) {
        const application = saved.applications.find(item => item.id === payload.applicationId);
        if (!application) throw Error('Demo conversation unavailable.');
        thread = { id: 'demo-thread-' + Date.now(), applicationId: application.id, company: application.job.company, roleName: application.job.title, messages: [] };
        saved.conversations.push(thread);
      }
      thread.updatedAt = new Date().toISOString();
      thread.messages.push({ sender: 'candidate', body: payload.message, createdAt: thread.updatedAt });
      persist(); return { status: 'sent', threadId: thread.id };
    }
    throw Error('This action is unavailable in the candidate demo.');
  },
};
async function extractLocalResume(file) {
  const extension = file.name.split('.').at(-1).toLowerCase();
  if (extension === 'txt') return file.text();
  if (extension === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    try { return String((await extractText(pdf, { mergePages: true })).text || ''); } finally { await pdf.destroy(); }
  }
  if (['docx', 'odt'].includes(extension)) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const xml = archive[extension === 'docx' ? 'word/document.xml' : 'content.xml'];
    if (!xml) throw Error('This document has no readable text.');
    const source = strFromU8(xml).replace(/<\/(?:w:p|text:p|text:h)>/g, '\n');
    return new DOMParser().parseFromString(source, 'application/xml').documentElement.textContent;
  }
  // DOC and RTF uploads still save locally; their production extraction runs on the server.
  return '';
}
async function saveResume(file) {
  if (!(file instanceof Blob) || !file.size || file.size > 10 * 1024 * 1024) throw Error('Choose a resume under 10 MB.');
  let text = '';
  try { text = await extractLocalResume(file); } catch { /* Preserve the upload even when local extraction cannot read it. */ }
  await media('put', 'resume', file); clearUrl('resume');
  saved.resumeName = file.name;
  saved.profile.resume_path = 'browser-only/' + file.name;
  saved.resumeIndex = text.trim().length >= 40 ? indexResume(redactContactInfo(text)) : null;
  saved.resumeParseNote = saved.resumeIndex ? 'Resume facts use the same text indexer as the site. Live AI processing is not run in this local demo.' : 'Resume saved. Local text extraction is unavailable for this file; production processes resumes on the server.';
  if (text.trim().length >= 40) await media('put', 'redactedResume', new Blob([redactContactInfo(text)], { type: 'text/plain' }));
  else await media('delete', 'redactedResume');
  clearUrl('redactedResume');
}
window.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  if (!url.hostname.endsWith('.supabase.co')) return realFetch(input, options);
  const endpoint = url.pathname.split('/').at(-1), form = options.body instanceof FormData ? options.body : null;
  try {
    const body = form ? { action: 'saveIntro' } : JSON.parse(options.body || '{}');
    const action = form ? endpoint : body.action;
    if (saved.failures[action]) { saved.failures[action]--; persist(); return Response.json({ error: 'Demo connection failure. Retry to continue.' }, { status: 503 }); }
    const now = new Date().toISOString();
    if (endpoint === 'register-candidate') {
      await media('clear');
      for (const name of urls.keys()) clearUrl(name);
      saved = initial();
      saved.firstName = body.firstName; saved.lastName = body.lastName; saved.email = body.email;
      saved.profile.full_name = [body.firstName, body.lastName].join(' '); saved.confirmed = false;
      // The demo never retains the password.
    } else if (endpoint === 'submit-resume') await saveResume(form.get('resume'));
    else if (endpoint === 'submit-profile-photo') {
      const file = form.get('photo');
      if (!(file instanceof Blob) || !file.size || file.size > 20 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('Choose a JPG, PNG or WebP under 20 MB.');
      await media('put', 'photo', file); clearUrl('photo'); saved.profile.profile_photo_path = 'browser-only/photo';
    } else if (endpoint === 'submit-id-photos') {
      for (const side of ['front', 'back']) {
        const file = form.get(side);
        if (!(file instanceof Blob) || !file.size || file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type)) throw Error('Choose front and back ID photos under 8 MB each.');
      }
      await media('put', 'id-front', form.get('front')); await media('put', 'id-back', form.get('back'));
      Object.assign(saved.progress, { review_reference: 'SA-DEMO1234', identity_photos_uploaded_at: now });
      persist(); return Response.json({ reference: saved.progress.review_reference }, { status: 201 });
    } else if (endpoint === 'submit-id-video') {
      const file = form.get('video');
      if (!(file instanceof Blob) || !file.size || file.size > 25 * 1024 * 1024 || !saved.progress.review_reference) throw Error('Add your ID photos and a video under 25 MB first.');
      await media('put', 'private-video', file); saved.progress.identity_video_uploaded_at = now;
      persist(); return Response.json({ status: 'contract_required' }, { status: 202 });
    } else if (endpoint === 'candidate-onboarding') {
      if (body.action === 'status') return Response.json(demoStatus(saved, saved.progress.intro_path ? await fileUrl('intro') : ''));
      await transition(saved, body, form, media); clearUrl('intro');
      if (body.action === 'completeGuide' && body.guide === 'intro') saved.progress.intro_guide_version = guides.intro.src;
    } else if (endpoint === 'candidate-messages') {
      let thread = saved.conversations.find(item => item.id === 'demo-public-contact');
      if (!thread) { thread = { id: 'demo-public-contact', applicationId: null, company: 'Demo hirer', roleName: 'Profile enquiry', messages: [] }; saved.conversations.push(thread); }
      if (body.action === 'send') { thread.updatedAt = now; thread.messages.push({ sender: 'employer', body: body.body, createdAt: now }); }
      persist(); return Response.json({ messages: thread.messages });
    } else throw Error('Live backend requests are unavailable in this local demo.');
    persist(); return Response.json({ status: 'saved', path: saved.profile.resume_path, ...demoStatus(saved, saved.progress.intro_path ? await fileUrl('intro') : '') }, { status: endpoint === 'candidate-onboarding' ? 200 : 201 });
  } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
};

function seedInbox() {
  if (saved.applications.length || saved.conversations.length) return;
  const now = new Date().toISOString();
  saved.applications = roles.slice(0, 3).map((job, index) => ({ id: 'demo-sample-' + index, job, status: ['new', 'rejected', 'shortlisted'][index], submittedAt: now }));
  saved.conversations = saved.applications.filter((_, index) => index !== 1).map(application => ({ id: 'demo-thread-' + application.id, applicationId: application.id, company: application.job.company, roleName: application.job.title, updatedAt: now, messages: [{ sender: 'employer', body: 'Thanks for applying! Can you tell us more about your availability?', createdAt: now }] }));
}
async function shortcut(target) {
  const now = new Date().toISOString();
  saved.confirmed = true;
  if (!saved.email) { saved.email = 'demo@example.invalid'; saved.firstName = 'Demo'; saved.lastName = 'Candidate'; saved.profile.full_name = 'Demo Candidate'; }
  if (!saved.profile.resume_path) {
    const sample = await (await realFetch('/scripts/dashboard-sample-resume.txt')).text();
    await saveResume(new File([sample], 'sample-resume.txt', { type: 'text/plain' }));
  }
  Object.assign(saved.progress, { identity_photos_uploaded_at: now, review_reference: 'SA-DEMO1234', identity_video_uploaded_at: now, identity_completed_at: now, platform_completed_at: now, contract_accepted_at: now });
  saved.profile.verification_status = 'verified';
  if (target === 'dashboard') {
    saved.profile.career_survey_completed_at = now; saved.profile.preferences_completed_at = now;
    Object.assign(saved.progress, { intro_completed_at: now, intro_guide_version: guides.intro.src, intro_skipped_at: now }); seedInbox();
  } else {
    saved.profile.career_survey_completed_at = null; saved.profile.preferences_completed_at = null;
    saved.progress.intro_completed_at = null; saved.progress.intro_skipped_at = null;
  }
  persist(); window.demoNavigate(target === 'dashboard' ? './candidate-dashboard.html' : './candidate-onboarding.html');
}
async function loadScript(name) {
  const response = await realFetch('/' + name);
  if (!response.ok) throw Error('Could not load the current screen. Refresh to retry.');
  let source = await response.text();
  source = source.replace(/(?:window\.)?location\.(?:assign|replace)\(/g, 'window.demoNavigate(')
    .replace(/from (['"])(\.\/|\/)([^'"]+)\1/g, (_m, q, _p, path) => 'from ' + q + location.origin + '/' + path + q);
  source = source.replace("window.history.replaceState(null, '', '?' + params.toString())", "window.history.replaceState(null, '', '/scripts/full-onboarding-demo.html?' + params.toString())");
  // Only this local harness accepts its own IndexedDB object URLs.
  source = source.replaceAll("['https:', 'http:']", "['https:', 'http:', 'blob:']");
  if (name === 'candidate-dashboard.js') source = source.replace("const shareUrl = shareSlug ?", "const shareUrl = true ?").replace("new URL('/candidate-public-profile.html?profile=' + encodeURIComponent(shareSlug), shareOrigin).href", "new URL('/scripts/full-onboarding-demo.html?page=candidate-public-profile&profile=0123456789abcdef0123456789abcdef', shareOrigin).href");
  const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { await import(objectUrl); } finally { URL.revokeObjectURL(objectUrl); }
}
function showError(error) {
  const notice = document.createElement('p'); notice.className = 'demo-error'; notice.role = 'alert'; notice.textContent = error.message; document.body.prepend(notice);
}
function toolbar() {
  const bar = document.createElement('aside'); bar.className = 'demo-bar';
  bar.innerHTML = '<strong>Full candidate demo</strong><small>Uploads & answers save in this browser · Sample jobs and messages</small><a href="/scripts/full-onboarding-demo.html">Demo home</a><button id="demoApprove" hidden>Approve demo identity</button><details><summary>Test controls</summary><div class="demo-options"><button id="demoPost">Start post-verification</button><button id="demoDashboard">Open dashboard with sample inbox</button><button id="demoResumeFlow">Resume current onboarding</button><label>Connection recovery<select id="demoFailAction"><option value="submit-resume">Resume upload</option><option value="submit-profile-photo">Headshot upload</option><option value="submit-id-photos">ID photos</option><option value="submit-id-video">Private video</option><option value="completeGuide">Guide save</option><option value="saveCareerSurvey">Ideal job form</option><option value="savePreferences">Goals form</option><option value="candidate-onboarding">Intro upload</option><option value="skipIntro">Skip intro</option></select></label><button id="demoFail">Fail next save</button><button id="demoRestart">Clear demo & restart</button><span id="demoControlStatus" role="status"></span></div></details>';
  document.body.prepend(bar);
  bar.querySelector('#demoPost').onclick = () => shortcut('post').catch(showError);
  bar.querySelector('#demoDashboard').onclick = () => shortcut('dashboard').catch(showError);
  bar.querySelector('#demoResumeFlow').onclick = () => window.demoNavigate(saved.confirmed ? './candidate-onboarding.html' : './candidate-signup.html');
  bar.querySelector('#demoFail').onclick = () => { saved.failures[bar.querySelector('#demoFailAction').value] = 1; persist(); bar.querySelector('#demoControlStatus').textContent = 'The next save will fail once. Retry to continue.'; };
  bar.querySelector('#demoRestart').onclick = async () => { try { await media('clear'); saved = initial(); persist(); location.assign('/scripts/full-onboarding-demo.html'); } catch (error) { showError(error); } };
  const approve = bar.querySelector('#demoApprove');
  approve.hidden = demoStatus(saved).stage !== 'waiting';
  approve.onclick = () => { saved.profile.verification_status = 'verified'; persist(); window.demoNavigate('./candidate-onboarding.html'); };
  // Onboarding transitions within one page; update the pending-approval control too.
  const observer = new MutationObserver(() => { approve.hidden = demoStatus(saved).stage !== 'waiting'; });
  const root = document.querySelector('#onboardingRoot');
  if (root) observer.observe(root, { childList: true });
  return bar;
}
function note(text) { const node = document.createElement('p'); node.className = 'demo-note'; node.textContent = text; document.querySelector('.demo-bar').after(node); }
async function mount() {
  if (page === 'start') {
    document.body.innerHTML = '<main class="demo-start"><img class="site-logo" src="/assets/hire-from-sa-logo.jpeg" alt="Hire From SA"><h1>Test the full candidate experience.</h1><p>Use the current website screens from signup through your completed profile. Camera recording, uploads, required videos and forms work here. Email, contract signing, identity approval, jobs and messages are simulated.</p><div class="demo-cards"><section class="demo-card"><h2>1. Full onboarding</h2><p>Signup → email → resume → headshot → ID photos → private video → guides → contract → approval → job preferences → introduction → dashboard.</p><button id="demoStart">Start from signup →</button></section><section class="demo-card"><h2>2. After verification</h2><p>Go directly to the two onboarding forms, then watch the intro guide and test your camera with the branded background. A sample resume is used until you upload yours.</p><button id="startPost">Test post-verification →</button></section><section class="demo-card"><h2>3. Dashboard & profile</h2><p>Try jobs, applications, pending/denied statuses, message replies, the original job post, resume, intro video, profile editing and the public profile.</p><button id="startDashboard">Test dashboard →</button></section></div><div class="demo-checklist"><span>Email test code: 123456</span><span>Any demo password · minimum 10 characters</span><span>No production accounts created</span><span>Use sample images for ID testing</span></div><p>Your progress survives refresh. Test controls let you simulate a failed save, resume onboarding or clear this demo. This link works on this computer.</p></main>';
    toolbar();
    document.querySelector('#demoStart').onclick = () => window.demoNavigate('./candidate-signup.html');
    document.querySelector('#startPost').onclick = () => shortcut('post').catch(showError);
    document.querySelector('#startDashboard').onclick = () => shortcut('dashboard').catch(showError);
    return;
  }
  const allowed = ['candidate-signup', 'candidate-login', 'check-email', 'email-confirmed', 'candidate-resume', 'candidate-profile', 'candidate-next-steps', 'id-verification', 'verification', 'candidate-onboarding', 'candidate-dashboard', 'application-questions', 'candidate-public-profile'];
  if (!allowed.includes(page)) throw Error('That screen is outside the candidate demo. Return to Demo home.');
  const response = await realFetch('/' + page + '.html');
  const template = new DOMParser().parseFromString(await response.text(), 'text/html');
  template.querySelectorAll('script').forEach(node => node.remove());
  const base = document.createElement('base'); base.href = location.origin + '/'; document.head.prepend(base);
  for (const link of template.head.querySelectorAll('link')) document.head.append(link.cloneNode(true));
  const accountCss = document.createElement('link'); accountCss.rel = 'stylesheet'; accountCss.href = '/account-menu.css'; document.head.append(accountCss);
  document.body.className = template.body.className;
  document.body.replaceChildren(...[...template.body.childNodes].map(node => node.cloneNode(true)));
  // Put demo CSS last so the toolbar remains readable with every production stylesheet.
  const demoCss = document.createElement('link'); demoCss.rel = 'stylesheet'; demoCss.href = '/scripts/full-onboarding-demo.css'; document.head.append(demoCss);
  toolbar();
  if (['check-email', 'email-confirmed'].includes(page)) note('No email is sent in this demo. Use verification code 123456 with the email you entered at signup.');
  if (page === 'candidate-signup' || page === 'candidate-login') note('Use test details and any password of at least 8 characters. The password is not stored.');
  if (['id-verification', 'verification'].includes(page)) note('Demo only: use sample ID images. These files and recordings stay in this browser.');
  if (page === 'candidate-resume' && saved.resumeParseNote) note(saved.resumeParseNote);
  if (page === 'candidate-dashboard') note('Sample companies, applications and messages. Your uploaded headshot, resume, intro video and saved profile details are retained. ' + (saved.resumeParseNote || ''));
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    if (link.id === 'openContract') {
      event.preventDefault();
      const panel = document.createElement('dialog'); panel.className = 'demo-contract';
      panel.innerHTML = '<h2>Demo contract step</h2><p>Real candidates open and sign the Hire From SA contract in Sendlink. This demo simulates that step so you can test the flow without signing a contract.</p><button type="button">Return to contract confirmation →</button>';
      document.body.append(panel); panel.showModal();
      panel.querySelector('button').onclick = () => { panel.close(); panel.remove(); };
      return;
    }
    const url = new URL(link.href);
    if (url.origin === location.origin && url.pathname.endsWith('.html')) {
      event.preventDefault(); window.demoNavigate(link.href);
    }
  });
  if (page !== 'check-email') {
    if (page === 'candidate-dashboard') await loadScript('account-menu.js');
    await loadScript(page + (page === 'candidate-onboarding' ? '.mjs' : '.js'));
  }
}
mount().catch(showError);
