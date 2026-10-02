import { onboardingRequest } from './onboarding-client.mjs';
import { prepareHeadshot } from './headshot-image.mjs';
const PHOTO_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-profile-photo';
const applicationsRoot = document.querySelector('#candidateApplications');
const portalStatus = document.querySelector('#portalStatus');
const tabs = ['jobs', 'messages', 'applications', 'profile'];
const navTabs = ['jobs', 'messages', 'applications'];
let activeTab = new URLSearchParams(window.location.search).get('tab') || 'applications';
if (!tabs.includes(activeTab)) activeTab = 'applications';
let dashboardData;
let candidate;
let conversations = [];
let selectedConversation;
let profileLoaded = false;
let jobsLoaded = false;
let jobs = [];
let selectedJobId = '';
let loading = false;
let profileLoading = false;
let photoUploading = false;
let jobsLoading = false;
let inboxLoading = false;
let messageSending = false;
let profileLoadedAt = 0;
let lastInboxRefresh = Date.now();
const drafts = new Map();

function portalEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function safeAssetUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function showPhotoStatus(message, error = false) {
  const status = document.querySelector('#profilePhotoStatus');
  status.textContent = message;
  status.classList.toggle('error', error);
  status.hidden = !message;
}
async function uploadProfilePhoto(file) {
  if (photoUploading || !file) return;
  const button = document.querySelector('#changeProfilePhoto');
  photoUploading = true;
  if (button) button.disabled = true;
  showPhotoStatus('Preparing your headshot…');
  try {
    const photo = await prepareHeadshot(file);
    const token = await window.getAccessToken();
    if (!token) throw new Error('Your sign-in expired. Sign in again, then retry.');
    const body = new FormData();
    body.append('photo', photo, photo.name || 'headshot.jpg');
    showPhotoStatus('Uploading your headshot…');
    const response = await fetch(PHOTO_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.path) throw new Error(result.error || 'Your headshot could not be saved. Please try again.');
    profileLoaded = false;
    const refreshed = await loadProfile();
    showPhotoStatus(refreshed ? 'Headshot saved. Your profile now shows the new photo.' : 'Headshot saved. Refresh your profile to see the new photo.');
  } catch (error) {
    showPhotoStatus(error instanceof TypeError ? 'The photo service could not be reached. Check your connection and try again.' : error.message || 'Your headshot could not be saved.', true);
  } finally {
    photoUploading = false;
    document.querySelector('#changeProfilePhoto')?.removeAttribute('disabled');
  }
}
function dateLabel(value, withTime = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }).format(date);
}
function workDateLabel(value) {
  if (/^\d{4}$/.test(value || '')) return value;
  if (!/^\d{4}-\d{2}$/.test(value || '')) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + '-01T00:00:00Z'));
}
function statusLabel(status) {
  return ({ new: 'Pending', shortlisted: 'Shortlisted', interviewing: 'Interview stage', rejected: 'Denied', hired: 'Hired' })[status] || 'Pending';
}
function companyAvatar(company, logoUrl = '') {
  const logo = safeAssetUrl(logoUrl);
  const initials = String(company || 'Hirer').split(/\s+/).map(part => part.match(/[\p{L}\p{N}]/u)?.[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return '<span class="va-company-avatar" aria-hidden="true">' + (logo ? '<img src="' + portalEscape(logo) + '" alt="" />' : portalEscape(initials)) + '</span>';
}
function identityLabel(profile) {
  return profile.verificationStatus === 'verified' ? 'Verified' : profile.verificationBypass ? 'Approved' : 'In review';
}
function emptyState(title, copy, action = '') {
  return '<section class="portal-empty"><h2>' + portalEscape(title) + '</h2><p>' + portalEscape(copy) + '</p>' + action + '</section>';
}
function switchTab(tab, updateUrl = true) {
  if (!tabs.includes(tab)) return;
  if (activeTab === 'profile' && tab !== 'profile') document.querySelector('#candidateProfile video')?.pause?.();
  activeTab = tab;
  tabs.forEach(name => {
    const button = document.querySelector('#tab-' + name);
    if (button) {
      button.setAttribute('aria-selected', String(name === tab));
      button.tabIndex = name === tab ? 0 : -1;
    }
    document.querySelector('#panel-' + name).hidden = name !== tab;
  });
  if (updateUrl && window.history) {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    window.history.replaceState(null, '', '?' + params.toString());
  }
  if (!dashboardData) return;
  if (tab === 'profile' && (!profileLoaded || Date.now() - profileLoadedAt > 45 * 60 * 1000)) loadProfile();
  if (tab === 'jobs' && !jobsLoaded) loadJobs();
  if (tab === 'messages' && Date.now() - lastInboxRefresh > 30000) refreshInbox();
}
window.savaOpenDashboardTab = switchTab;
function renderApplications(applications) {
  document.querySelector('#applicationCount').textContent = String(applications.length);
  if (!applications.length) {
    applicationsRoot.innerHTML = emptyState('No applications yet.', 'Find a role that fits your skills and send your first application.', '<button type="button" class="va-button" data-open-tab="jobs">Explore roles →</button>');
    return;
  }
  applicationsRoot.innerHTML = applications.map(application => {
    const job = application.job || {};
    const status = ['new','shortlisted','interviewing','rejected','hired'].includes(application.status) ? application.status : 'new';
    const latestMessage = conversations.find(thread => thread.applicationId === application.id)?.messages?.at(-1) || application.messages?.at(-1);
    const replyStatus = latestMessage ? (latestMessage.sender === 'candidate' ? 'Waiting for response' : 'New message') : '';
    return '<article class="portal-application" data-application-id="' + portalEscape(application.id) + '"><header><div><span>' + portalEscape(job.company || 'Hirer') + '</span><h2>' + portalEscape(job.title || 'Role no longer listed') + '</h2><p>' + portalEscape([job.arrangement,job.type,job.location].filter(Boolean).join(' · ')) + '</p></div></header><div class="va-application-body"><p class="va-application-pay">' + portalEscape(job.pay || 'Pay not listed') + '</p><div class="va-application-description"><h3>Job description</h3><p>' + portalEscape(job.description || 'The job description is no longer available.') + '</p></div><div class="va-application-status-row"><span>Status</span><strong class="application-status ' + status + '">' + portalEscape(statusLabel(status)) + '</strong>' + (replyStatus ? '<span class="va-reply-status">' + portalEscape(replyStatus) + '</span>' : '') + '</div></div><div class="va-application-footer"><p>Applied ' + dateLabel(application.submittedAt) + '</p><button type="button" class="va-button secondary" data-application-conversation="' + portalEscape(application.id) + '">View conversation →</button></div></article>';
  }).join('');
}
function prepareConversations(data) {
  conversations = [...(data.conversations || [])];
  (data.applications || []).forEach(application => {
    if (!conversations.some(thread => thread.applicationId === application.id)) conversations.push({
      id: 'application:' + application.id, applicationId: application.id,
      company: application.job?.company || 'Hirer', roleName: application.job?.title || 'Your application',
      messages: application.messages || [], updatedAt: application.messages?.at(-1)?.createdAt || application.submittedAt,
    });
  });
  conversations.sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (!conversations.some(thread => thread.id === selectedConversation)) selectedConversation = conversations[0]?.id;
  document.querySelector('#messageCount').textContent = String(conversations.length);
  renderMessages();
}
function renderMessages() {
  const root = document.querySelector('#candidateMessages');
  if (!conversations.length) { root.innerHTML = emptyState('No conversations yet.', 'Messages from hirers and conversations about your applications will appear here.'); return; }
  const selected = conversations.find(thread => thread.id === selectedConversation) || conversations[0];
  const list = conversations.map(thread => '<button type="button" class="va-thread-option" aria-pressed="' + String(thread.id === selected.id) + '" data-thread-id="' + portalEscape(thread.id) + '"><span class="va-thread-company">' + companyAvatar(thread.company, thread.logoUrl) + '<b>' + portalEscape(thread.company || 'Hirer') + '</b></span><span class="va-thread-role">' + portalEscape(thread.roleName || 'Conversation') + '</span><small>' + portalEscape(thread.messages?.at(-1)?.body?.slice(0, 95) || 'Start a conversation') + '</small></button>').join('');
  const messages = (selected.messages || []).map(message => '<article class="candidate-message ' + (message.sender === 'candidate' ? 'candidate' : 'employer') + '"><p>' + portalEscape(message.body) + '</p><time>' + dateLabel(message.createdAt, true) + '</time></article>').join('');
  const job = dashboardData?.applications?.find(application => application.id === selected.applicationId)?.job;
  const jobPost = job?.id ? '<details class="va-thread-job-post"><summary>View job post</summary><div><p class="va-job-company">' + portalEscape(job.company || selected.company || 'Hirer') + '</p><h4>' + portalEscape(job.title || selected.roleName || 'Role') + '</h4><p class="va-thread-job-meta">' + portalEscape([job.arrangement, job.type, job.location].filter(Boolean).join(' · ')) + '</p><strong>' + portalEscape(job.pay || 'Pay not listed') + '</strong><p class="va-thread-job-description">' + portalEscape(job.description || 'The job description is no longer available.') + '</p>' + (job.responsibilities?.length ? '<h5>Responsibilities</h5><ul>' + job.responsibilities.map(item => '<li>' + portalEscape(item) + '</li>').join('') + '</ul>' : '') + (job.skills?.length ? '<h5>Skills</h5><p>' + portalEscape(job.skills.join(' · ')) + '</p>' : '') + '</div></details>' : '';
  root.innerHTML = '<div class="va-inbox"><aside class="va-thread-list" aria-label="Conversations">' + list + '</aside><section class="candidate-conversation"><div class="conversation-heading">' + companyAvatar(selected.company, selected.logoUrl) + '<div><p class="portal-kicker">' + portalEscape(selected.company || 'HIRER') + '</p><h3>' + portalEscape(selected.roleName || 'Conversation') + '</h3></div></div>' + jobPost + '<div class="candidate-thread" role="log" aria-label="Conversation messages">' + (messages || '<p class="thread-empty">No messages yet. Say hello to the hirer below.</p>') + '</div><form class="candidate-message-form"><label>Message<textarea name="message" maxlength="2000" rows="3" placeholder="Write a message to the hirer…" required></textarea></label><div><span class="send-status" role="status" aria-live="polite"></span><button type="submit">Send message →</button></div></form></section></div>';
  const composer = root.querySelector('textarea');
  if (composer) composer.value = drafts.get(selected.id) || '';
  const log = root.querySelector('.candidate-thread');
  if (log) log.scrollTop = log.scrollHeight;
}
function saveDraft() {
  const composer = document.querySelector('#candidateMessages textarea');
  if (selectedConversation && composer && typeof composer.value === 'string') drafts.set(selectedConversation, composer.value);
}
async function refreshInbox() {
  if (inboxLoading || messageSending || !dashboardData) return;
  inboxLoading = true;
  const button = document.querySelector('#refreshInbox'), status = document.querySelector('#inboxStatus');
  button.disabled = true;
  status.hidden = false; status.textContent = 'Checking for new messages…';
  try {
    const data = await window.savaPlatform.candidateRequest('candidateDashboard');
    if (!data.profile?.applicationReady) { window.location.replace('./candidate-onboarding.html'); return; }
    if (messageSending) { status.hidden = true; return; }
    saveDraft();
    dashboardData = data;
    prepareConversations(data);
    renderApplications(data.applications || []);
    if (jobsLoaded) renderJobs();
    lastInboxRefresh = Date.now();
    status.hidden = true;
  } catch (error) { status.textContent = error.message || 'Could not refresh messages. Your existing conversations and draft are still here.'; }
  finally { inboxLoading = false; button.disabled = false; }
}
async function loadProfile() {
  if (profileLoading) return;
  profileLoading = true;
  document.querySelector('#refreshProfile').disabled = true;
  const root = document.querySelector('#candidateProfile');
  root.querySelector('video')?.pause?.();
  root.innerHTML = '<p role="status">Loading your profile…</p>';
  try {
    const [{ profile }, onboarding] = await Promise.all([window.savaPlatform.candidateRequest('getProfile'), onboardingRequest('status')]);
    if (!profile) throw new Error('Your profile could not be found.');
    const name = profile.fullName || [candidate.user_metadata?.first_name, candidate.user_metadata?.last_name].filter(Boolean).join(' ') || 'Your profile';
    const initials = name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase();
    const photo = safeAssetUrl(profile.photoUrl);
    const resume = safeAssetUrl(profile.resumeUrl);
    const intro = safeAssetUrl(onboarding.introUrl);
    const skills = (profile.skills || []).slice(0,20);
    const software = (profile.software || []).slice(0,20);
    const workExperience = Array.isArray(profile.displayExperience) ? profile.displayExperience.filter(role => role?.jobTitle && role?.companyName) : [];
    const enteredExperience = profile.displayExperienceSource === 'candidate';
    const workRows = workExperience.map(role => `<article class="va-work-role"><div><h4>${portalEscape(role.jobTitle)}</h4><p>${portalEscape(role.companyName)} · ${portalEscape([workDateLabel(role.startDate), role.currentRole ? 'Present' : workDateLabel(role.endDate)].filter(Boolean).join(' – '))}</p></div>${role.description ? `<p>${portalEscape(role.description)}</p>` : ''}</article>`);
    const workCard = workRows.length ? `<section class="va-card va-work-experience"><p class="portal-kicker">${enteredExperience ? 'WORK HISTORY' : 'FROM YOUR RESUME'}</p><h3>Work experience</h3><div class="va-work-list">${workRows.slice(0,3).join('')}</div>${workRows.length > 3 ? `<details class="va-work-more"><summary>Show ${workRows.length - 3} more role${workRows.length - 3 === 1 ? '' : 's'}</summary><div class="va-work-list">${workRows.slice(3).join('')}</div></details>` : ''}<p class="va-work-source">${enteredExperience ? 'Based on your saved profile details.' : 'Pulled from your connected resume. Replace the resume if these details need updating.'}</p></section>` : '';
    const approved = profile.verificationStatus === 'verified' || profile.verificationBypass;
    const shareSlug = /^[0-9a-f]{32}$/.test(profile.shareSlug || '') ? profile.shareSlug : '';
    const shareOrigin = window.location.origin || 'https://www.hirefromsa.com';
    const shareUrl = shareSlug ? new URL('/candidate-public-profile.html?profile=' + encodeURIComponent(shareSlug), shareOrigin).href : '';
    const shareCard = shareUrl ? `<section class="va-card va-profile-share"><p class="portal-kicker">SHARE YOUR PROFILE</p><h3>Your profile link</h3><p>Send this link to a hirer. Your email and contact details stay private.</p><div class="va-share-row"><input id="candidateShareUrl" type="text" readonly value="${portalEscape(shareUrl)}" aria-label="Your shareable profile link" /><button type="button" class="va-button" data-share-profile="${portalEscape(shareUrl)}">Copy link</button></div><span id="candidateShareStatus" role="status" aria-live="polite"></span></section>` : '';
    root.innerHTML = `<div class="va-profile-grid">
      <section class="va-card va-profile-details">${photo ? '<img class="va-avatar" src="' + portalEscape(photo) + '" alt="Your headshot" />' : '<span class="va-avatar" aria-hidden="true">' + portalEscape(initials) + '</span>'}
        <dl><div><dt>Name</dt><dd>${portalEscape(name)}</dd></div><div><dt>Email</dt><dd>${portalEscape(candidate.email)}</dd></div><div><dt>Identity</dt><dd>${identityLabel(profile)}</dd></div></dl>
        <div class="va-photo-actions"><button id="changeProfilePhoto" type="button" class="va-button secondary">${photo ? 'Change headshot' : 'Add headshot'}</button><input id="profilePhotoFile" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a headshot" /><small>JPG, PNG or WebP · up to 20 MB</small></div>
      </section>
      <section class="va-card va-profile-facts-card"><p class="portal-kicker">JOB PREFERENCES</p><h3>Ideal roles, rate & availability</h3><p>Your ideal roles, rate, weekly hours and location appear on your shareable profile. Experience comes from your resume.</p>
        <form id="candidateProfileFactsForm" class="va-profile-facts-form">
          <label>Ideal jobs (up to five, separated by commas)<input name="idealJobTitles" type="text" maxlength="409" placeholder="Executive Assistant, Customer Support" value="${portalEscape((profile.idealJobTitles || []).join(', '))}" /></label>
          <label>Requested rate from (USD/hour)<input name="requestedRateMinUsd" type="number" min="0.01" max="1000" step="0.01" inputmode="decimal" value="${portalEscape(profile.requestedRateMinUsd ?? '')}" /></label>
          <label>Requested rate to (USD/hour)<input name="requestedRateMaxUsd" type="number" min="0.01" max="1000" step="0.01" inputmode="decimal" value="${portalEscape(profile.requestedRateMaxUsd ?? '')}" /></label>
          <label>Hours available per week<input name="availableHoursPerWeek" type="number" min="1" max="80" step="1" inputmode="numeric" value="${portalEscape(profile.availableHoursPerWeek ?? '')}" /></label>
          <label>City and country<input name="location" type="text" maxlength="120" autocomplete="address-level2" placeholder="Cape Town, South Africa" value="${portalEscape(profile.location || '')}" /></label>
          <label>When you can start<select name="startAvailability"><option value="">Not added</option><option value="immediately"${profile.startAvailability === 'immediately' ? ' selected' : ''}>Immediately</option><option value="two_weeks"${profile.startAvailability === 'two_weeks' ? ' selected' : ''}>Within two weeks</option><option value="one_month"${profile.startAvailability === 'one_month' ? ' selected' : ''}>Within a month</option><option value="flexible"${profile.startAvailability === 'flexible' ? ' selected' : ''}>Flexible</option></select></label>
          <label>Portfolio links (optional)<textarea name="portfolioLinks" maxlength="10244" rows="3" spellcheck="false" autocapitalize="none" placeholder="https://your-portfolio.com">${portalEscape((profile.portfolioLinks || []).join('\n'))}</textarea><small>Up to five links, one per line. Employers can view these on your public profile.</small></label>
          <label>Other job preferences (only our team sees this)<textarea name="preferredJobNote" maxlength="400" rows="3">${portalEscape(profile.preferredJobNote || '')}</textarea></label>
          <div class="va-profile-facts-actions"><button class="va-button" type="submit">Save profile details</button><span id="profileFactsStatus" role="status" aria-live="polite"></span></div>
        </form>
      </section>
      ${workCard}
      ${shareCard}
      <section class="va-card"><p class="portal-kicker">YOUR INTRODUCTION</p><h3>One-minute video</h3>
        ${intro ? '<video src="' + portalEscape(intro) + '" controls playsinline preload="metadata" aria-label="Your introduction video"></video>' : '<div class="va-empty-video"><p>No introduction video yet.</p><p>' + (approved ? 'Introduce yourself and your skills in about one minute.' : 'Recording becomes available after identity approval.') + '</p></div>'}
        ${approved ? '<a class="va-button secondary" href="./candidate-onboarding.html?manage=1">' + (intro ? 'Manage video' : 'Record your video') + ' →</a>' : ''}
      </section>
      <section class="va-card"><p class="portal-kicker">YOUR RESUME</p><h3>Resume</h3>
        <div class="va-file"><span class="va-file-icon" aria-hidden="true">▤</span><div><b>${portalEscape(profile.resumeFileName || 'No resume connected')}</b><p>Your connected, contact-redacted resume.</p></div></div>
        ${resume ? '<a class="va-button" href="' + portalEscape(resume) + '" target="_blank" rel="noopener noreferrer">View resume ↗</a>' : '<p>Your resume link is unavailable. Refresh your profile to try again.</p>'}
        <a class="va-button secondary" href="./candidate-resume.html?next=.%2Fcandidate-dashboard.html%3Ftab%3Dprofile">Replace resume</a>
      </section>
      ${profile.summary ? '<section class="va-card"><h3>About me</h3><p>' + portalEscape(profile.summary) + '</p></section>' : ''}
      ${skills.length ? '<section class="va-card"><p class="portal-kicker">FROM YOUR RESUME</p><h3>Skills</h3><div class="va-skills">' + skills.map(skill => '<span>' + portalEscape(skill) + '</span>').join('') + '</div></section>' : ''}
      ${software.length ? '<section class="va-card"><p class="portal-kicker">FROM YOUR RESUME</p><h3>Tools & Software</h3><div class="va-skills">' + software.map(tool => '<span>' + portalEscape(tool) + '</span>').join('') + '</div></section>' : ''}
    </div>`;
    root.querySelector('video')?.addEventListener('error', () => { profileLoaded = false; root.insertAdjacentHTML('beforeend', '<p role="alert">Your video link could not play. <button type="button" class="va-button secondary" data-retry-profile>Refresh profile</button></p>'); });
    window.savaPendingAccountPhoto = photo;
    window.savaSetAccountPhoto?.(photo);
    profileLoaded = true;
    profileLoadedAt = Date.now();
    return true;
  } catch (error) {
    root.innerHTML = emptyState('Profile unavailable.', error.message || 'Try again to load your details.', '<button type="button" class="va-button" data-retry-profile>Try again</button>');
    return false;
  } finally { profileLoading = false; document.querySelector('#refreshProfile').disabled = false; }
}
async function loadJobs() {
  if (jobsLoading) return;
  jobsLoading = true;
  const status = document.querySelector('#jobsStatus');
  status.textContent = 'Loading open roles…';
  document.querySelector('#jobsRetry').hidden = true;
  try {
    const data = await window.savaPlatform.publicRequest('listJobs');
    jobs = (data.jobs || []).filter(job => job.status === 'active');
    populateJobFilters();
    jobsLoaded = true;
    renderJobs();
  } catch (error) {
    status.textContent = error.message || 'Roles could not be loaded.';
    document.querySelector('#jobsRetry').hidden = false;
  } finally { jobsLoading = false; }
}
function populateJobFilters() {
  const options = (selector, values, placeholder) => {
    const select = document.querySelector(selector);
    const current = select.value;
    select.innerHTML = '<option value="">' + portalEscape(placeholder) + '</option>' + [...new Set(values.filter(Boolean))].sort().map(value => '<option value="' + portalEscape(value) + '">' + portalEscape(value) + '</option>').join('');
    if (select.options && [...select.options].some(option => option.value === current)) select.value = current;
  };
  options('#jobArrangement', jobs.map(job => job.arrangement), 'All work setups');
  options('#jobType', jobs.map(job => job.type), 'All job types');
}
function renderJobDetail(job, applied) {
  const detail = document.querySelector('#candidateJobDetail');
  if (!job) { detail.hidden = true; detail.innerHTML = ''; return; }
  detail.hidden = false;
  const applicationId = applied ? dashboardData.applications.find(application => application.job?.id === job.id)?.id : '';
  const action = applied
    ? '<button type="button" class="va-button secondary" data-view-application="' + portalEscape(applicationId || '') + '">View application →</button>'
    : '<a class="va-button" href="./application-questions.html?job=' + encodeURIComponent(job.id) + '">Apply for this role →</a>';
  detail.innerHTML = '<div class="va-job-detail-heading"><p class="va-job-company">' + portalEscape(job.company || 'Hirer') + '</p><div class="va-job-title-row"><h3>' + portalEscape(job.title || 'Open role') + '</h3>' + action + '</div><div class="va-job-tags">' + [job.arrangement,job.type,job.location].filter(Boolean).map(tag => '<span>' + portalEscape(tag) + '</span>').join('') + '</div><b class="va-job-pay">' + portalEscape(job.pay || '') + '</b></div><div class="va-job-description"><h4>About the role</h4><p>' + portalEscape(job.description || 'The hirer has not added a full role description yet.') + '</p>' + (job.responsibilities?.length ? '<h4>What you’ll do</h4><ul>' + job.responsibilities.map(item => '<li>' + portalEscape(item) + '</li>').join('') + '</ul>' : '') + (job.skills?.length ? '<h4>Skills that help</h4><div class="va-skills">' + job.skills.map(skill => '<span>' + portalEscape(skill) + '</span>').join('') + '</div>' : '') + '</div>';
}
function renderJobs() {
  const query = document.querySelector('#jobSearch').value.trim().toLowerCase();
  const arrangement = document.querySelector('#jobArrangement').value;
  const type = document.querySelector('#jobType').value;
  const matches = jobs.filter(job => [job.title,job.company,job.description,...(job.skills || [])].join(' ').toLowerCase().includes(query) && (!arrangement || job.arrangement === arrangement) && (!type || job.type === type));
  document.querySelector('#jobsStatus').textContent = matches.length + ' open role' + (matches.length === 1 ? '' : 's') + (query ? ' matching your search' : '');
  const applied = new Set((dashboardData.applications || []).map(application => application.job?.id));
  if (!matches.some(job => job.id === selectedJobId)) selectedJobId = matches[0]?.id || '';
  document.querySelector('#candidateJobs').innerHTML = matches.length ? matches.map(job => '<button type="button" class="va-job-listing" data-job-id="' + portalEscape(job.id) + '" aria-pressed="' + String(job.id === selectedJobId) + '"><span class="va-job-company">' + portalEscape(job.company || 'Hirer') + '</span><b>' + portalEscape(job.title || 'Open role') + '</b><span class="va-job-meta">' + portalEscape([job.location,job.arrangement,job.type].filter(Boolean).join(' · ')) + '</span><span class="va-job-snippet">' + portalEscape(String(job.description || '').slice(0,125)) + (String(job.description || '').length > 125 ? '…' : '') + '</span><span class="va-job-listing-footer"><strong>' + portalEscape(job.pay || '') + '</strong><em>' + (applied.has(job.id) ? 'Applied ✓' : 'View role →') + '</em></span></button>').join('') : emptyState(query || arrangement || type ? 'No matching roles.' : 'No open roles right now.', query || arrangement || type ? 'Try changing your search or filters.' : 'Check back soon for new opportunities.');
  renderJobDetail(matches.find(job => job.id === selectedJobId), applied.has(selectedJobId));
}
async function loadCandidateDashboard() {
  if (loading) return;
  loading = true;
  portalStatus.hidden = false; portalStatus.className = 'portal-status'; portalStatus.textContent = 'Loading your dashboard…';
  document.querySelector('#dashboardRetry').hidden = true;
  try {
    candidate = await window.getVerifiedCandidate();
    if (!candidate) { window.location.replace('./candidate-login.html?next=' + encodeURIComponent('./candidate-dashboard.html?tab=' + activeTab)); return; }
    const data = await window.savaPlatform.candidateRequest('candidateDashboard');
    const profile = data.profile || {};
    if (profile.resumeRequired) { window.location.replace('./candidate-resume.html?required=1&next=' + encodeURIComponent('./candidate-dashboard.html')); return; }
    if (profile.verificationStatus === 'pending' && !profile.verificationBypass) { window.location.replace('./candidate-onboarding.html'); return; }
    const approved = profile.verificationStatus === 'verified' || Boolean(profile.verificationBypass);
    if (approved) {
      const onboarding = await onboardingRequest('status');
      if (onboarding.stage !== 'complete') { window.location.replace('./candidate-onboarding.html'); return; }
    }
    if (!profile.applicationReady) {
      document.body.classList.add('applications-gated');
      document.querySelector('#candidateGate').hidden = false;
      document.querySelector('#candidateReady').hidden = true;
      portalStatus.hidden = true;
      return;
    }
    dashboardData = data;
    const profilePhoto = safeAssetUrl(profile.photoUrl);
    window.savaPendingAccountPhoto = profilePhoto;
    window.savaSetAccountPhoto?.(profilePhoto);
    document.body.classList.remove('applications-gated');
    document.querySelector('#candidateGate').hidden = true;
    document.querySelector('#candidateReady').hidden = false;
    prepareConversations(data);
    renderApplications(data.applications || []);
    portalStatus.hidden = true;
    switchTab(activeTab, false);
  } catch (error) {
    portalStatus.textContent = error.message || 'Your dashboard could not be loaded.';
    portalStatus.className = 'portal-status error';
    document.querySelector('#dashboardRetry').hidden = false;
  } finally { loading = false; }
}
document.querySelectorAll('[data-dashboard-tab]').forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.dashboardTab));
  button.addEventListener('keydown', event => {
    const index = navTabs.indexOf(button.dataset.dashboardTab);
    const next = event.key === 'ArrowRight' ? (index+1)%navTabs.length : event.key === 'ArrowLeft' ? (index+navTabs.length-1)%navTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? navTabs.length-1 : -1;
    if (next < 0) return;
    event.preventDefault(); switchTab(navTabs[next]); document.querySelector('#tab-' + navTabs[next]).focus();
  });
});
document.querySelector('#candidateProfile').addEventListener('click', event => {
  if (event.target.closest('#changeProfilePhoto') && !photoUploading) document.querySelector('#profilePhotoFile')?.click();
});
document.querySelector('#candidateProfile').addEventListener('change', async event => {
  if (event.target.id !== 'profilePhotoFile') return;
  const file = event.target.files?.[0];
  event.target.value = '';
  await uploadProfilePhoto(file);
});
document.querySelector('#candidateProfile').addEventListener('submit', async event => {
  const form = event.target.closest('#candidateProfileFactsForm');
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const fields = form.elements;
  const min = fields.requestedRateMinUsd.value.trim();
  const max = fields.requestedRateMaxUsd.value.trim();
  const hours = fields.availableHoursPerWeek.value.trim();
  const location = fields.location.value.trim();
  const idealJobTitles = fields.idealJobTitles.value.trim();
  const startAvailability = fields.startAvailability.value;
  const preferredJobNote = fields.preferredJobNote.value.trim();
  const portfolioLinks = fields.portfolioLinks.value.trim();
  const status = form.querySelector('#profileFactsStatus');
  if (Boolean(min) !== Boolean(max) || (min && Number(max) < Number(min))) {
    status.textContent = 'Enter both hourly rate amounts, with the upper rate at least the lower rate.';
    return;
  }
  const roles = idealJobTitles.split(',').map(role => role.trim()).filter(Boolean);
  if (roles.length > 5 || roles.some(role => role.length > 80)) { status.textContent = 'List up to five roles, each under 80 characters.'; return; }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = 'Saving…';
  try {
    await window.savaPlatform.candidateRequest('updateCandidateProfileFacts', { idealJobTitles, requestedRateMinUsd: min, requestedRateMaxUsd: max, availableHoursPerWeek: hours, location, startAvailability, preferredJobNote, portfolioLinks });
    profileLoaded = false;
    await loadProfile();
    document.querySelector('#profileFactsStatus').textContent = 'Saved. Your public profile now shows these details.';
  } catch (error) {
    status.textContent = error.message || 'Could not save profile details. Try again.';
    button.disabled = false;
  }
});
document.querySelector('#candidateReady').addEventListener('click', async event => {
  const action = event.target.closest('[data-open-tab], [data-view-application], [data-thread-id], [data-application-conversation], [data-retry-profile], [data-job-id], [data-share-profile]');
  if (!action) return;
  if (action.dataset.openTab) switchTab(action.dataset.openTab);
  if ('viewApplication' in action.dataset) {
    switchTab('applications');
    const card = [...applicationsRoot.querySelectorAll('[data-application-id]')].find(item => item.dataset.applicationId === action.dataset.viewApplication);
    card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }
  if (action.dataset.threadId) { saveDraft(); selectedConversation = action.dataset.threadId; renderMessages(); }
  if (action.dataset.applicationConversation) { saveDraft(); selectedConversation = conversations.find(thread => thread.applicationId === action.dataset.applicationConversation)?.id; renderMessages(); switchTab('messages'); }
  if ('retryProfile' in action.dataset) { profileLoaded = false; loadProfile(); }
  if (action.dataset.jobId) { selectedJobId = action.dataset.jobId; renderJobs(); }
  if (action.dataset.shareProfile) {
    const status = document.querySelector('#candidateShareStatus');
    try {
      await navigator.clipboard.writeText(action.dataset.shareProfile);
      action.textContent = 'Copied ✓';
      status.textContent = 'Profile link copied.';
    } catch {
      const input = document.querySelector('#candidateShareUrl');
      input.focus(); input.select();
      status.textContent = 'Profile link selected. Copy it from the field.';
    }
  }
});
document.querySelector('#candidateMessages').addEventListener('submit', async event => {
  const form = event.target.closest('.candidate-message-form');
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const thread = conversations.find(item => item.id === selectedConversation);
  const message = form.elements.message.value.trim();
  if (!thread || !message) return;
  const button = form.querySelector('button'), status = form.querySelector('.send-status');
  if (button.disabled || messageSending) return;
  messageSending = true;
  form.elements.message.disabled = true;
  button.disabled = true; status.textContent = 'Sending…';
  try {
    const result = await window.savaPlatform.candidateRequest(thread.id.startsWith('application:') ? 'candidateSendMessage' : 'candidateSendThreadMessage', thread.id.startsWith('application:') ? { applicationId: thread.applicationId, message } : { threadId: thread.id, message });
    drafts.delete(thread.id);
    if (result.threadId && result.threadId !== thread.id) {
      if (selectedConversation === thread.id) selectedConversation = result.threadId;
      thread.id = result.threadId;
    }
    thread.messages ||= [];
    thread.messages.push(result.message || { sender: 'candidate', body: message, createdAt: new Date().toISOString() });
    thread.updatedAt = new Date().toISOString();
    renderMessages();
    renderApplications(dashboardData.applications || []);
  } catch (error) { status.textContent = error.message || 'Message failed to send.'; } finally { button.disabled = false; form.elements.message.disabled = false; messageSending = false; }
});
document.querySelector('#candidateMessages').addEventListener('input', saveDraft);
document.querySelector('#refreshInbox').addEventListener('click', refreshInbox);
document.querySelector('#refreshProfile').addEventListener('click', () => { profileLoaded = false; loadProfile(); });
// Only fetch while the inbox is visible. Drafts stay local and survive refreshes.
window.setInterval?.(() => { if (!document.hidden && activeTab === 'messages' && Date.now() - lastInboxRefresh >= 30000) refreshInbox(); }, 30000);
document.querySelector('#jobSearch').addEventListener('input', () => { if (jobsLoaded) renderJobs(); });
document.querySelector('#jobArrangement').addEventListener('change', () => { if (jobsLoaded) renderJobs(); });
document.querySelector('#jobType').addEventListener('change', () => { if (jobsLoaded) renderJobs(); });
document.querySelector('#jobsRetry').addEventListener('click', loadJobs);
document.querySelector('#dashboardRetry').addEventListener('click', loadCandidateDashboard);
loadCandidateDashboard();
