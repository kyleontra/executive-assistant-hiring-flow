import { applyVideoThumbnail } from './video-thumbnail.mjs';
import { onboardingRequest } from './onboarding-client.mjs';
import { prepareHeadshot } from './headshot-image.mjs';
const PHOTO_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-profile-photo';
const applicationsRoot = document.querySelector('#candidateApplications');
const portalStatus = document.querySelector('#portalStatus');
const tabs = ['jobs', 'messages', 'applications', 'profile', 'payments', 'settings', 'help'];
const navTabs = ['jobs', 'messages', 'applications'];
let underReview = false;
let activeTab = new URLSearchParams(window.location.search).get('tab') || 'applications';
if (!tabs.includes(activeTab)) activeTab = 'applications';
// Localhost-only preview (?demo): a signed-in VA with sample applications, messages and jobs. Nothing is sent.
const dashboardDemo = ['localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).has('demo');
const demoJobs = [
  { id: 'demo-wedding', company: 'Ever After Films', title: 'Wedding Video Editor', arrangement: 'Remote', type: 'Full-time', location: 'South Africa', pay: '$6–$8 / hour', payMin: 6, payMax: 8, payPeriod: 'hour', hiringTimeline: 'ASAP', createdAt: new Date(Date.now() - 3 * 864e5).toISOString(), questions: [{ text: 'How many weddings have you edited?' }, { text: 'Share a link to a highlight film you edited.' }], status: 'active', description: 'Edit wedding highlight films and full ceremony videos from raw footage. You will receive footage within a week of each wedding and deliver a first cut within 10 days.', skills: ['Premiere Pro', 'Color grading', 'Music sync'] },
  { id: 'demo-ea', company: 'Northline Realty', title: 'Executive Assistant to the CEO', arrangement: 'Remote', type: 'Full-time', location: 'South Africa', pay: '$5–$7 / hour', payMin: 5, payMax: 7, payPeriod: 'hour', hiringTimeline: 'Within 1-2 weeks', createdAt: new Date(Date.now() - 6 * 864e5).toISOString(), status: 'active', description: 'Manage the CEO calendar, inbox and travel, prepare meeting notes and keep projects moving across a small real estate team.', skills: ['Google Workspace', 'Calendar management', 'Written English'] },
  { id: 'demo-bookkeeper', company: 'Harbor Accounting', title: 'Bookkeeping Assistant', arrangement: 'Remote', type: 'Full-time', location: 'South Africa', pay: '$1,100–$1,300 / month', payMin: 1100, payMax: 1300, payPeriod: 'month', hiringTimeline: 'Not urgently', createdAt: new Date(Date.now() - 10 * 864e5).toISOString(), status: 'active', description: 'Reconcile accounts in QuickBooks, categorize transactions and prepare monthly reports for small business clients.', skills: ['QuickBooks', 'Xero', 'Attention to detail'] },
  { id: 'demo-cs', company: 'Brightside Dental', title: 'Customer Support Assistant', arrangement: 'Remote', type: 'Part-time', location: 'South Africa', pay: '$4–$5 / hour', payMin: 4, payMax: 5, payPeriod: 'hour', hiringTimeline: 'Within the month', createdAt: new Date(Date.now() - 864e5).toISOString(), status: 'active', description: 'Answer patient emails and chats, book appointments and send reminders for a three-location dental practice.', skills: ['Customer service', 'Scheduling'] },
];
const demoData = {
  profile: { applicationReady: true, verificationStatus: 'verified' },
  applications: [
    { id: 'demo-app-1', status: 'shortlisted', bid: { rate: 7, min: 6, max: 8, period: 'hour' }, submittedAt: new Date(Date.now() - 2 * 864e5).toISOString(), job: demoJobs[0],
      messages: [
        { sender: 'candidate', body: 'Hi, my name is Thandi, and I think I would be a good fit for your role because I have edited over 40 wedding films in the last two years.', createdAt: new Date(Date.now() - 2 * 864e5).toISOString() },
        { sender: 'employer', body: 'Thanks Thandi! Could you send a link to your favourite highlight film?', createdAt: new Date(Date.now() - 864e5).toISOString() },
      ] },
    { id: 'demo-app-2', status: 'new', bid: { rate: 6, min: 5, max: 7, period: 'hour' }, submittedAt: new Date(Date.now() - 5 * 864e5).toISOString(), job: demoJobs[1],
      messages: [{ sender: 'candidate', body: 'Hi, my name is Thandi, and I think I would be a good fit for your role because I supported two founders as their EA for three years.', createdAt: new Date(Date.now() - 5 * 864e5).toISOString() }] },
    { id: 'demo-app-3', status: 'interviewing', bid: { rate: 5, min: 4, max: 5, period: 'hour' }, submittedAt: new Date(Date.now() - 9 * 864e5).toISOString(), job: demoJobs[3],
      messages: [{ sender: 'candidate', body: 'Hi, my name is Thandi, and I think I would be a good fit for your role because I handled patient bookings for a busy clinic for two years.', createdAt: new Date(Date.now() - 9 * 864e5).toISOString() }, { sender: 'employer', body: 'Great chatting today. We will send the next steps by Friday.', createdAt: new Date(Date.now() - 4 * 864e5).toISOString() }, { sender: 'candidate', body: 'Thank you, looking forward to it!', createdAt: new Date(Date.now() - 4 * 864e5 + 36e5).toISOString() }] },
    { id: 'demo-app-4', status: 'rejected', bid: { rate: 5, min: 4, max: 6, period: 'hour' }, submittedAt: new Date(Date.now() - 14 * 864e5).toISOString(), job: { id: 'demo-social', title: 'Social Media Assistant', type: 'Part-time', arrangement: 'Remote', pay: '$4–$6 / hour' }, messages: [] },
  ],
  conversations: [{ id: 'demo-thread-direct', company: 'Harbor Accounting', roleName: 'Bookkeeping Assistant', updatedAt: new Date(Date.now() - 3 * 36e5).toISOString(),
    messages: [{ sender: 'employer', body: 'Hi Thandi, I saw your profile and think you would be great for our bookkeeping role. Would you be open to a quick call this week?', createdAt: new Date(Date.now() - 3 * 36e5).toISOString() }] }],
};
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
  if (dashboardDemo) { demoProfile.photoUrl = URL.createObjectURL(file); profileLoaded = false; await loadProfile(); showPhotoStatus('Preview only: photo shown on this page, nothing was uploaded.'); return; }
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
  return ({ rejected: 'Not selected', hired: 'Hired' })[status] || 'Pending';
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
  // My Profile has its own, bigger under-review banner.
  document.querySelector('#reviewBanner').hidden = !underReview || tab === 'profile';
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
  if (tab === 'settings') fillSettings();
  if (tab === 'payments') renderPayments();
  if (tab === 'messages' && Date.now() - lastInboxRefresh > 30000) refreshInbox();
}
window.savaOpenDashboardTab = switchTab;
function applicationThread(application) {
  return conversations.find(thread => thread.applicationId === application.id);
}
function applicationHasReply(application) {
  const last = (applicationThread(application)?.messages || application.messages || []).at(-1);
  return Boolean(last && last.sender !== 'candidate');
}
// VAs see three statuses: Pending (anything still open), Hired and Not selected.
function applicationState(application) {
  return application.status === 'hired' ? 'hired' : application.status === 'rejected' ? 'rejected' : 'pending';
}
function applicationCard(application) {
  const job = application.job || {};
  const state = applicationState(application);
  const reply = applicationHasReply(application);
  const last = (applicationThread(application)?.messages || application.messages || []).at(-1);
  const meta = [job.pay, JOB_TYPE_HOURS[job.type] || job.type, bidLabel(application.bid)].filter(Boolean).map(item => '<span>' + portalEscape(item) + '</span>').join('');
  return '<article class="va-app' + (reply ? ' has-reply' : '') + '" data-application-id="' + portalEscape(application.id) + '"><div class="va-app-main"><div class="va-app-title"><h2>' + portalEscape(job.title || 'Job no longer listed') + '</h2><span class="va-app-status ' + state + '">' + portalEscape(statusLabel(state)) + '</span></div>'
    + (reply ? '<p class="va-app-new"><b>New message</b><span>' + portalEscape(String(last.body || '').slice(0, 110)) + '</span></p>' : '')
    + '<p class="va-app-date">Applied ' + portalEscape(dateLabel(application.submittedAt)) + (last ? ' · ' + (reply ? 'Hirer replied ' : 'You messaged ') + portalEscape(threadTime(last.createdAt)) : '') + '</p><div class="va-app-meta">' + meta + '</div></div><div class="va-app-actions">'
    + (job.id ? '<a class="va-app-secondary" href="./job-detail.html?job=' + encodeURIComponent(job.id) + '" target="_blank" rel="noopener">View role</a>' : '')
    + '<button type="button" class="' + (reply ? 'va-app-primary' : 'va-app-secondary') + '" data-application-conversation="' + portalEscape(application.id) + '">' + (reply ? 'Reply' : 'View conversation') + '</button></div></article>';
}
function renderApplications(applications) {
  document.querySelector('#applicationCount').textContent = String(applications.length);
  const statusSelect = document.querySelector('#applicationStatus');
  const counts = applications.reduce((all, application) => { all[applicationState(application)] = (all[applicationState(application)] || 0) + 1; return all; }, {});
  [...statusSelect.options].forEach(option => { option.textContent = option.textContent.replace(/ \(\d+\)$/, '') + ' (' + (option.value ? counts[option.value] || 0 : applications.length) + ')'; });
  if (!applications.length) {
    applicationsRoot.innerHTML = emptyState('No applications yet.', 'Find a job that fits your skills and send your first application.', '<button type="button" class="va-button" data-open-tab="jobs">Apply for jobs →</button>');
    return;
  }
  const status = statusSelect.value;
  const oldest = document.querySelector('#applicationSort').value === 'oldest';
  const visible = applications.filter(application => !status || applicationState(application) === status)
    .sort((a, b) => (oldest ? -1 : 1) * String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  if (!visible.length) { applicationsRoot.innerHTML = '<p class="va-apps-none">No applications with this status.</p>'; return; }
  const groups = [
    { title: 'Needs your reply', note: 'The hirer messaged you', items: visible.filter(applicationHasReply), urgent: true },
    { title: 'Waiting on the hirer', note: 'You’re all caught up on these', items: visible.filter(application => !applicationHasReply(application) && applicationState(application) === 'pending') },
    { title: 'Closed', note: 'Hired or not selected', items: visible.filter(application => !applicationHasReply(application) && applicationState(application) !== 'pending') },
  ].filter(group => group.items.length);
  applicationsRoot.innerHTML = groups.map(group => '<section class="va-apps-group' + (group.urgent ? ' urgent' : '') + '"><h2 class="va-apps-group-title">' + (group.urgent ? '<i aria-hidden="true"></i>' : '') + portalEscape(group.title) + ' <span>' + group.items.length + '</span><small>' + portalEscape(group.note) + '</small></h2>' + group.items.map(applicationCard).join('') + '</section>').join('');
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
let messageSearch = '';
let threadOpenOnPhone = false;
function threadTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 864e5);
  return days < 1 ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : days < 7 ? date.toLocaleDateString('en-US', { weekday: 'short' }) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function threadUnread(thread) {
  const last = thread.messages?.at(-1);
  return Boolean(last && last.sender !== 'candidate');
}
function bidLabel(bid) {
  if (!bid) return '';
  const money = value => '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return 'Your bid ' + money(bid.rate) + ' / ' + bid.period + ' · would accept ' + money(bid.min) + '–' + money(bid.max);
}
function renderMessages() {
  const root = document.querySelector('#candidateMessages');
  if (!conversations.length) { root.innerHTML = emptyState('No messages yet.', 'When you apply to a job, your introduction starts a conversation with the hirer here.', '<button type="button" class="va-button" data-open-tab="jobs">Apply for jobs →</button>'); return; }
  const sort = document.querySelector('#messageSort')?.value || 'recent';
  const query = messageSearch.trim().toLowerCase();
  const visible = conversations.filter(thread => !query || [thread.roleName, thread.messages?.at(-1)?.body].join(' ').toLowerCase().includes(query))
    .sort((a, b) => (sort === 'unread' ? Number(threadUnread(b)) - Number(threadUnread(a)) : 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const selected = conversations.find(thread => thread.id === selectedConversation) || conversations[0];
  const list = visible.map(thread => {
    const last = thread.messages?.at(-1);
    const preview = last ? (last.sender === 'candidate' ? 'You: ' : '') + last.body : 'No messages yet';
    return '<button type="button" class="vm-item' + (thread.id === selected.id ? ' active' : '') + (threadUnread(thread) ? ' unread' : '') + '" data-thread-id="' + portalEscape(thread.id) + '"><span class="vm-avatar" aria-hidden="true">' + portalEscape(String(thread.roleName || 'H').trim().charAt(0).toUpperCase()) + '</span><b>' + portalEscape(thread.roleName || 'Conversation') + '</b><time>' + portalEscape(threadTime(last?.createdAt || thread.updatedAt)) + '</time><p>' + (threadUnread(thread) ? '<i class="vm-dot" aria-label="Unread"></i>' : '') + '<span>' + portalEscape(String(preview).slice(0, 90)) + '</span></p></button>';
  }).join('') || '<p class="vm-empty">No conversations match your search.</p>';
  const application = dashboardData?.applications?.find(item => item.id === selected.applicationId);
  const job = application?.job;
  const status = application ? applicationState(application) : '';
  const firstCandidate = (selected.messages || []).findIndex(message => message.sender === 'candidate');
  const messages = (selected.messages || []).map((message, index) => {
    const mine = message.sender === 'candidate';
    const label = application && mine && index === firstCandidate && index === 0 ? '<span class="vm-msg-label">Your introduction</span>' : '';
    return '<article class="vm-msg' + (mine ? ' you' : '') + '">' + label + portalEscape(message.body) + '<small>' + (mine ? 'You · ' : 'Hirer · ') + portalEscape(dateLabel(message.createdAt, true)) + '</small></article>';
  }).join('');
  const context = application
    ? '<section class="vm-context"><span class="vm-pill ' + status + '">' + portalEscape(statusLabel(status)) + '</span><span>Applied ' + portalEscape(dateLabel(application.submittedAt)) + '</span>' + (job?.pay ? '<span>Job pays ' + portalEscape(job.pay) + '</span>' : '') + (application.bid ? '<span class="vm-bid">' + portalEscape(bidLabel(application.bid)) + '</span>' : '') + '</section>'
    : '<section class="vm-context"><span class="vm-pill direct">Direct message</span><span>A hirer reached out to you.</span></section>';
  root.innerHTML = '<div class="vm' + (threadOpenOnPhone ? ' showing-thread' : '') + '"><aside class="vm-list-pane"><label class="vm-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="m14 14 4 4"/></svg><input id="messageSearch" type="search" placeholder="Search messages" autocomplete="off" value="' + portalEscape(messageSearch) + '" /></label><div class="vm-list" aria-label="Conversations">' + list + '</div></aside>'
    + '<section class="vm-thread-pane"><header class="vm-thread-head"><button type="button" class="vm-back" data-thread-back aria-label="Back to conversations">←</button><span class="vm-avatar vm-avatar-lg" aria-hidden="true">' + portalEscape(String(selected.roleName || 'H').trim().charAt(0).toUpperCase()) + '</span><div class="vm-who"><h2>' + portalEscape(selected.roleName || 'Conversation') + '</h2><p>' + (job?.id ? '<a class="vm-view-role" href="./job-detail.html?job=' + encodeURIComponent(job.id) + '" target="_blank" rel="noopener">View role →</a><span>' + portalEscape([JOB_TYPE_HOURS[job.type] || job.type, job.arrangement].filter(Boolean).join(' · ')) + '</span>' : '<span>Direct message from a hirer</span>') + '</p></div>' + '</header>'
    + context
    + '<div class="vm-messages" role="log" aria-label="Conversation messages">' + (messages || '<p class="vm-empty">No messages yet. Say hello to the hirer below.</p>') + '</div>'
    + '<form class="candidate-message-form vm-compose"><textarea name="message" maxlength="2000" rows="1" placeholder="Write a message" aria-label="Write a message" required></textarea><button type="submit">Send</button><span class="send-status" role="status" aria-live="polite"></span></form></section></div>';
  const composer = root.querySelector('textarea');
  if (composer) composer.value = drafts.get(selected.id) || '';
  const log = root.querySelector('.vm-messages');
  if (log) log.scrollTop = log.scrollHeight;
}
function saveDraft() {
  const composer = document.querySelector('#candidateMessages textarea');
  if (selectedConversation && composer && typeof composer.value === 'string') drafts.set(selectedConversation, composer.value);
}
async function refreshInbox() {
  if (inboxLoading || messageSending || !dashboardData) return;
  inboxLoading = true;
  const status = document.querySelector('#inboxStatus');
  try {
    const data = await window.savaPlatform.candidateRequest('candidateDashboard');
    if (!data.profile?.applicationReady && !underReview) { window.location.replace('./candidate-onboarding.html'); return; }
    if (messageSending) { status.hidden = true; return; }
    saveDraft();
    dashboardData = data;
    prepareConversations(data);
    renderApplications(data.applications || []);
    if (jobsLoaded) renderJobs();
    lastInboxRefresh = Date.now();
    status.hidden = true;
  } catch (error) { status.hidden = false; status.textContent = error.message || 'Could not refresh messages. Your existing conversations and draft are still here.'; }
  finally { inboxLoading = false; }
}
// My Profile: the approved public profile layout (photo, bio next to video, 4 boxes, experience, skills) with edit controls.
const demoProfile = {
  fullName: 'Thandi Jacobs', verificationStatus: 'verified', relevantYears: 4, idealJobTitles: ['Executive Assistant', 'Bookkeeping Assistant', 'Customer Support'],
  requestedRateMinUsd: 5, requestedRateMaxUsd: 7, availableHoursPerWeek: 40, location: 'Cape Town, South Africa', startAvailability: 'two_weeks',
  summary: 'My name is Thandi and I am an Executive Assistant with 4 years of experience working with companies in real estate, healthcare and professional services. I am looking for full-time executive assistant or operations roles, am available to start within two weeks, can work U.S. hours and speak fluent English.',
  displayExperienceSource: 'resume',
  displayExperience: [
    { jobTitle: 'Executive Assistant', companyName: 'Coastline Properties', startDate: '2023-02', currentRole: true, description: 'Manage the CEO calendar, inbox and travel, prepare board packs and keep a 12-person team on schedule.' },
    { jobTitle: 'Patient Coordinator', companyName: 'Sea Point Medical', startDate: '2021-03', endDate: '2023-01', description: 'Booked and confirmed 60+ appointments a day and handled patient billing questions.' },
    { jobTitle: 'Admin Assistant', companyName: 'Mokoena & Partners', startDate: '2020-01', endDate: '2021-02', description: 'Filed client documents, captured invoices in Xero and answered the front desk phones.' },
  ],
  skills: ['Calendar management', 'Inbox management', 'Travel booking', 'Bookkeeping', 'Customer service', 'Meeting notes'],
  software: ['Google Workspace', 'Microsoft Office', 'Slack', 'Xero', 'Zoom', 'Notion'],
  portfolioLinks: [], preferredJobNote: '', shareSlug: '0123456789abcdef0123456789abcdef', resumeFileName: 'Thandi-Jacobs-Resume.pdf', resumeUrl: '',
};
const startLabels = { immediately: 'Available now', two_weeks: 'Starts within 2 weeks', one_month: 'Starts within a month', flexible: 'Flexible start' };
function profileRate(profile) {
  const min = Number(profile.requestedRateMinUsd), max = Number(profile.requestedRateMaxUsd);
  if (!(min > 0 && max >= min)) return '';
  const money = value => '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return money(min) + (max > min ? '–' + money(max) : '') + '/hr';
}
function profileYears(profile) {
  const years = Math.max(0, Number(profile.relevantYears) || 0);
  return years ? (years < 1 ? 'Under 1 year' : Math.floor(years) + (Math.floor(years) === 1 ? ' year' : ' years')) : '';
}
function profileFact(label, value, color, note = '') {
  return '<button type="button" class="vp-fact ' + color + '" data-edit-profile><small>' + label + '</small><b>' + portalEscape(value || 'Add') + '</b>' + (note ? '<span>' + portalEscape(note) + '</span>' : '') + '</button>';
}
function profileSelect(name, value, options) {
  return '<select name="' + name + '">' + options.map(([key, label]) => '<option value="' + key + '"' + (value === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select>';
}
// Before approval: a clear "can't apply yet" banner plus the next steps they can finish while they wait.
function reviewSteps(photo, onboarding) {
  const preferences = onboarding?.preferences || {};
  const questionsDone = Boolean(preferences.employmentPreference && preferences.startAvailability && preferences.monthlyIncomeGoalZar);
  const step = (number, done, title, copy, action, extra = '') => '<li class="vp-next-step' + (done ? ' done' : '') + '"><span class="vp-next-num" aria-hidden="true">' + (done ? '✓' : number) + '</span><div class="vp-next-body"><h3>' + title + '</h3><p>' + copy + '</p>' + extra + '</div><div class="vp-next-action">' + (done ? '<span class="vp-next-done">Done</span>' : action) + '</div></li>';
  return '<section class="vp-locked-banner"><span class="vp-locked-icon" aria-hidden="true">🔒</span><div><h2>You can\'t apply for jobs yet</h2><p>Our team is verifying your account. Once you\'re approved, you can apply to any job on Hire From SA. We\'ll email you as soon as that happens.</p></div></section>'
    + '<section class="vp-next"><h2>Next steps while you wait</h2><p class="vp-next-lead">Finish these now so you\'re ready to apply the moment you\'re approved.</p><ol>'
    + step(1, Boolean(photo), 'Create your Hire From SA profile picture with AI', 'Watch a short video to create it, then upload it. Regular photos and selfies aren\'t accepted.', '<a class="vp-btn" href="./candidate-profile.html' + (dashboardDemo ? '?demo=1' : '') + '">Create my picture</a>')
    + step(2, questionsDone, 'Answer a few questions about the work you want', 'The jobs and industries you want, your pay goal, and when you can start.', '<a class="vp-btn" href="./candidate-onboarding.html?questions=1' + (dashboardDemo ? '&demo=questions' : '') + '">Answer questions</a>')
    + '</ol></section>';
}
function renderProfile(profile, intro, onboarding = {}) {
  const root = document.querySelector('#candidateProfile');
  const name = profile.fullName || [candidate?.user_metadata?.first_name, candidate?.user_metadata?.last_name].filter(Boolean).join(' ') || 'Your profile';
  const firstName = name.split(/\s+/)[0];
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const photo = dashboardDemo && String(profile.photoUrl || '').startsWith('blob:') ? profile.photoUrl : safeAssetUrl(profile.photoUrl);
  const resume = safeAssetUrl(profile.resumeUrl);
  const approved = profile.verificationStatus === 'verified' || profile.verificationBypass;
  const ideal = (profile.idealJobTitles || []).slice(0, 5);
  const experience = Array.isArray(profile.displayExperience) ? profile.displayExperience.filter(role => role?.jobTitle && role?.companyName) : [];
  const role = ideal[0] || experience[0]?.jobTitle || 'Virtual Assistant';
  const years = profileYears(profile);
  const rate = profileRate(profile);
  const hours = Number.isInteger(Number(profile.availableHoursPerWeek)) && Number(profile.availableHoursPerWeek) > 0 ? profile.availableHoursPerWeek + ' hrs/week' : '';
  const skills = (profile.skills || []).slice(0, 20);
  const software = (profile.software || []).slice(0, 20);
  const links = (profile.portfolioLinks || []).map(safeAssetUrl).filter(Boolean).slice(0, 5);
  const shareSlug = /^[0-9a-f]{32}$/.test(profile.shareSlug || '') ? profile.shareSlug : '';
  // Profiles are not public until approved, so there is nothing to share yet.
  const shareUrl = shareSlug && approved ? new URL('/candidate-public-profile.html?profile=' + encodeURIComponent(shareSlug), window.location.origin || 'https://www.hirefromsa.com').href : '';
  const checklist = [
    [photo, 'Add a photo', 'photo'], [intro, 'Record your intro video', 'video'], [rate, 'Add your rate', 'edit'], [hours, 'Add your weekly hours', 'edit'],
    [ideal.length, 'Add the jobs you want', 'edit'], [profile.location, 'Add your location', 'edit'], [profile.resumeFileName, 'Upload your resume', 'resume'],
  ];
  const missing = checklist.filter(([done]) => !done);
  const percent = Math.round((checklist.length - missing.length) / checklist.length * 100);
  const missingChip = ([, label, kind]) => kind === 'photo' ? '<button type="button" data-pick-photo>' + label + '</button>' : kind === 'video' ? (approved ? '<a href="./candidate-onboarding.html?manage=1">' + label + '</a>' : '') : kind === 'resume' ? '<a href="./candidate-resume.html?next=.%2Fcandidate-dashboard.html%3Ftab%3Dprofile">' + label + '</a>' : '<button type="button" data-edit-profile>' + label + '</button>';
  const strength = missing.length ? '<section class="vp-strength"><div class="vp-strength-top"><b>Your profile is ' + percent + '% complete</b><span>Complete profiles get more replies from hirers.</span></div><div class="vp-bar"><i style="width:' + percent + '%"></i></div><div class="vp-missing">' + missing.map(missingChip).join('') + '</div></section>' : '';
  const roleRows = experience.map((item, index) => '<article class="vp-role' + (index > 2 ? ' vp-extra-role' : '') + '"' + (index > 2 ? ' hidden' : '') + '><h4>' + portalEscape(item.jobTitle) + '</h4><small>' + portalEscape([item.companyName, [workDateLabel(item.startDate), item.currentRole ? 'Present' : workDateLabel(item.endDate)].filter(Boolean).join(' – ')].filter(Boolean).join('  ·  ')) + '</small>' + (item.description ? '<p>' + portalEscape(item.description) + '</p>' : '') + '</article>').join('');
  const resumeLink = '<a class="vp-link" href="./candidate-resume.html?next=.%2Fcandidate-dashboard.html%3Ftab%3Dprofile">' + (profile.resumeFileName ? 'Replace resume' : 'Upload resume') + '</a>';
  const tags = list => '<div class="vp-tags">' + list.map(item => '<span>' + portalEscape(item) + '</span>').join('') + '</div>';
  root.innerHTML = `
    <div class="vp-top"><div><h1>My Profile</h1><p>${approved ? 'This is what hirers see when they open your profile.' : 'Hirers can see your profile once you\'re approved.'}</p></div>
      ${shareUrl ? `<div class="vp-top-actions"><a class="vp-btn secondary" href="${portalEscape(shareUrl)}" target="_blank" rel="noopener noreferrer">View as a hirer ↗</a><button type="button" class="vp-btn" data-share-profile="${portalEscape(shareUrl)}">Copy profile link</button><input id="candidateShareUrl" class="vp-share-input" type="text" readonly value="${portalEscape(shareUrl)}" aria-label="Your shareable profile link" tabindex="-1" /></div>` : ''}
    </div>
    <span id="candidateShareStatus" class="vp-share-status" role="status" aria-live="polite"></span>
    ${approved ? '' : reviewSteps(photo, onboarding)}
    ${strength}
    <article class="vp-card">
      <header class="vp-hero">
        <div class="vp-avatar-wrap"><span class="vp-avatar">${photo ? '<img src="' + portalEscape(photo) + '" alt="Your photo" />' : portalEscape(initials)}</span>
          <button id="changeProfilePhoto" type="button" class="vp-photo-btn" data-pick-photo aria-label="${photo ? 'Change photo' : 'Add photo'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button>
          <input id="profilePhotoFile" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a photo" hidden /></div>
        <div class="vp-identity">
          <div class="vp-name-line"><h2>${portalEscape(name)}</h2>${approved ? '<span class="vp-verified"><i aria-hidden="true">✓</i> Vetted by our team</span>' : '<span class="vp-review">Identity check in review</span>'}</div>
          <p class="vp-role-line">${portalEscape(role)}${years ? ' · ' + portalEscape(years) + ' experience' : ''}</p>
          ${ideal.length ? '<p class="vp-seeking">Seeking ' + portalEscape(ideal.join(' · ')) + '</p>' : ''}
        </div>
        <button type="button" class="vp-btn" data-edit-profile>Edit profile</button>
      </header>
      <div class="vp-body${intro ? ' has-video' : ''}">
        <div class="vp-left">
          <section class="vp-bio">${profile.summary ? '<p>' + portalEscape(profile.summary) + '</p>' : '<p class="vp-muted">Your bio appears here once our team writes it from your resume.</p>'}
            <small>Written by our team from your resume. Want something changed? <a href="mailto:support@hirefromsa.com?subject=Change%20my%20profile%20bio">Email support</a></small></section>
          <div class="vp-facts">${profileFact('Rate', rate, 'green')}${profileFact('Experience', years, 'violet')}${profileFact('Hours/week', hours, 'blue', startLabels[profile.startAvailability])}${profileFact('Location', profile.location, 'rose')}</div>
        </div>
        <section class="vp-video${intro ? '' : ' empty'}">
          ${intro ? '<video src="' + portalEscape(intro) + '" controls playsinline preload="metadata" aria-label="Your introduction video"></video>' : '<div class="vp-video-empty"><b>No intro video yet</b><span>' + (approved ? 'A one-minute intro helps hirers get to know you before they message.' : 'Recording opens once your identity check is approved.') + '</span></div>'}
          ${approved ? '<a class="vp-link" href="./candidate-onboarding.html?manage=1">' + (intro ? 'Re-record or manage video' : 'Record your video') + ' →</a>' : ''}
        </section>
      </div>
      <section class="vp-section"><div class="vp-section-head"><h3>Work Experience${profile.displayExperienceSource === 'resume' && experience.length ? ' <small>From your resume</small>' : ''}</h3>${resumeLink}</div>
        ${experience.length ? '<div class="vp-roles">' + roleRows + '</div>' + (experience.length > 3 ? '<button type="button" class="vp-more" data-more-roles>Show ' + (experience.length - 3) + ' more</button>' : '') : '<p class="vp-muted">Upload your resume and we will fill this in for you.</p>'}
      </section>
      <div class="vp-columns">
        <section class="vp-section"><div class="vp-section-head"><h3>Skills <small>From your resume</small></h3></div>${skills.length ? tags(skills) : '<p class="vp-muted">Pulled from your resume.</p>'}</section>
        <section class="vp-section"><div class="vp-section-head"><h3>Tools & Software <small>From your resume</small></h3></div>${software.length ? tags(software) : '<p class="vp-muted">Pulled from your resume.</p>'}</section>
      </div>
      <section class="vp-section"><div class="vp-section-head"><h3>Portfolio & Work Samples</h3><button type="button" class="vp-link" data-edit-profile>${links.length ? 'Edit links' : 'Add links'}</button></div>
        ${links.length ? '<div class="vp-links">' + links.map(link => '<a href="' + portalEscape(link) + '" target="_blank" rel="noopener noreferrer">' + portalEscape(new URL(link).hostname.replace(/^www\./, '') + (new URL(link).pathname === '/' ? '' : new URL(link).pathname)) + ' ↗</a>').join('') + '</div>' : '<p class="vp-muted">Optional. Add links to work you are proud of, like a portfolio, Canva designs or a video you edited.</p>'}
      </section>
    </article>
    <div class="vp-private">
      <section class="vp-private-card"><h3>Your resume</h3><p>${portalEscape(profile.resumeFileName || 'No resume uploaded')}</p><small>Hirers see a copy with your contact details removed.</small>
        <div class="vp-private-actions">${resume ? '<a class="vp-btn secondary" href="' + portalEscape(resume) + '" target="_blank" rel="noopener noreferrer">View resume ↗</a>' : ''}${resumeLink}</div></section>
      <section class="vp-private-card"><h3>Notes for our team <span class="vp-lock">Private</span></h3><p>${portalEscape(profile.preferredJobNote || 'Nothing added yet.')}</p><small>Only the Hire From SA team sees this, never hirers.</small>
        <div class="vp-private-actions"><button type="button" class="vp-link" data-edit-profile>${profile.preferredJobNote ? 'Edit note' : 'Add a note'}</button></div></section>
    </div>
    <div id="profileEditDialog" class="vp-dialog" hidden>
      <button type="button" class="vp-dialog-backdrop" data-close-edit aria-label="Close"></button>
      <section class="vp-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="profileEditTitle">
        <header><h2 id="profileEditTitle">Edit your profile</h2><button type="button" data-close-edit aria-label="Close">×</button></header>
        <form id="candidateProfileFactsForm" class="vp-form">
          <label class="wide">Jobs you want (up to five, separated by commas)<input name="idealJobTitles" type="text" maxlength="409" placeholder="Executive Assistant, Customer Support" value="${portalEscape(ideal.join(', '))}" /></label>
          <label>Rate from (USD per hour)<input name="requestedRateMinUsd" type="number" min="0.01" max="1000" step="0.01" inputmode="decimal" value="${portalEscape(profile.requestedRateMinUsd ?? '')}" /></label>
          <label>Rate to (USD per hour)<input name="requestedRateMaxUsd" type="number" min="0.01" max="1000" step="0.01" inputmode="decimal" value="${portalEscape(profile.requestedRateMaxUsd ?? '')}" /></label>
          <label>Hours available per week<input name="availableHoursPerWeek" type="number" min="1" max="80" step="1" inputmode="numeric" value="${portalEscape(profile.availableHoursPerWeek ?? '')}" /></label>
          <label>When you can start${profileSelect('startAvailability', profile.startAvailability || '', [['', 'Not added'], ['immediately', 'Immediately'], ['two_weeks', 'Within two weeks'], ['one_month', 'Within a month'], ['flexible', 'Flexible']])}</label>
          <label class="wide">City and country<input name="location" type="text" maxlength="120" autocomplete="address-level2" placeholder="Cape Town, South Africa" value="${portalEscape(profile.location || '')}" /></label>
          <label class="wide">Portfolio links (optional, one per line)<textarea name="portfolioLinks" maxlength="10244" rows="3" spellcheck="false" autocapitalize="none" placeholder="https://your-portfolio.com">${portalEscape((profile.portfolioLinks || []).join('\n'))}</textarea></label>
          <label class="wide">Notes for our team (private, hirers never see this)<textarea name="preferredJobNote" maxlength="400" rows="3">${portalEscape(profile.preferredJobNote || '')}</textarea></label>
          <div class="vp-form-actions wide"><span id="profileFactsStatus" role="status" aria-live="polite"></span><button type="button" class="vp-btn secondary" data-close-edit>Cancel</button><button class="vp-btn" type="submit">Save changes</button></div>
        </form>
      </section>
    </div>`;
  applyVideoThumbnail(root.querySelector('video'), { fallback: photo });
  root.querySelector('video')?.addEventListener('error', () => { profileLoaded = false; root.querySelector('.vp-video').insertAdjacentHTML('beforeend', '<p role="alert" class="vp-muted">Your video could not play. <button type="button" class="vp-link" data-retry-profile>Reload profile</button></p>'); });
  window.savaPendingAccountPhoto = photo;
  window.savaSetAccountPhoto?.(photo);
}
async function loadProfile() {
  if (profileLoading) return;
  profileLoading = true;
  const root = document.querySelector('#candidateProfile');
  root.querySelector('video')?.pause?.();
  root.innerHTML = '<p role="status">Loading your profile…</p>';
  try {
    const [{ profile }, onboarding] = dashboardDemo ? [{ profile: demoProfile }, {}] : await Promise.all([window.savaPlatform.candidateRequest('getProfile'), onboardingRequest('status')]);
    if (!profile) throw new Error('Your profile could not be found.');
    renderProfile(profile, safeAssetUrl(onboarding.introUrl), onboarding);
    profileLoaded = true;
    profileLoadedAt = Date.now();
    return true;
  } catch (error) {
    root.innerHTML = emptyState('Profile unavailable.', error.message || 'Try again to load your details.', '<button type="button" class="va-button" data-retry-profile>Try again</button>');
    return false;
  } finally { profileLoading = false; }
}
async function loadJobs() {
  if (jobsLoading) return;
  jobsLoading = true;
  const status = document.querySelector('#jobsStatus');
  status.textContent = 'Loading open jobs…';
  document.querySelector('#jobsRetry').hidden = true;
  try {
    const data = dashboardDemo ? { jobs: demoJobs } : await window.savaPlatform.viewerRequest('listJobs');
    jobs = (data.jobs || []).filter(job => job.status === 'active');
    populateJobFilters();
    jobsLoaded = true;
    renderJobs();
  } catch (error) {
    status.textContent = error.message || 'Roles could not be loaded.';
    document.querySelector('#jobsRetry').hidden = false;
  } finally { jobsLoading = false; }
}
const JOB_TYPE_HOURS = { 'Full-time': 'Full-time · 40 hrs/week', 'Part-time': 'Part-time · 20+ hrs/week', Contract: 'Contract · per project' };
const JOB_TIMELINES = { ASAP: 'ASAP', 'Within 1-2 weeks': 'In 1-2 weeks', 'Within the month': 'This month', 'Not urgently': 'Flexible' };
function postedLabel(value) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 864e5);
  if (!value || Number.isNaN(days)) return '';
  return days < 1 ? 'Posted today' : days === 1 ? 'Posted yesterday' : days < 30 ? 'Posted ' + days + ' days ago' : 'Posted ' + dateLabel(value);
}
// Compare hourly and monthly jobs on one scale for "Highest pay".
function hourlyPay(job) {
  const top = Number(job.payMax || job.payMin || 0);
  return job.payPeriod === 'month' ? top / 173 : top;
}
function populateJobFilters() {
  const select = document.querySelector('#jobType');
  const current = select.value;
  select.innerHTML = '<option value="">All job types</option>' + [...new Set(jobs.map(job => job.type).filter(Boolean))].sort().map(value => '<option value="' + portalEscape(value) + '">' + portalEscape(value) + '</option>').join('');
  if ([...select.options].some(option => option.value === current)) select.value = current;
}
function jobQuestions(job) {
  return (Array.isArray(job.questions) ? job.questions : []).map(question => typeof question === 'string' ? question : question?.text).map(text => String(text || '').trim()).filter(Boolean);
}
function renderJobDetail(job, applied) {
  const detail = document.querySelector('#candidateJobDetail');
  if (!job) { detail.innerHTML = ''; return; }
  const application = applied ? dashboardData.applications.find(item => item.job?.id === job.id) : null;
  const questions = jobQuestions(job);
  const action = application
    ? '<div class="vj-applied-box"><b>✓ You applied ' + portalEscape(dateLabel(application.submittedAt)) + '</b><button type="button" class="vj-secondary" data-application-conversation="' + portalEscape(application.id) + '">View conversation</button></div>'
    : underReview
      ? '<div class="vj-locked"><b>🔒 You can apply once you\'re approved</b><span>Our team is reviewing your profile. We\'ll email you as soon as you\'re approved.</span></div>'
      : '<a class="vj-apply" href="./application-questions.html?job=' + encodeURIComponent(job.id) + '">Apply now <span aria-hidden="true">→</span></a><p class="vj-free">Free for candidates. You never pay to apply or get hired.</p>';
  detail.innerHTML = '<button type="button" class="vj-back" data-job-back>← All jobs</button>'
    + '<p class="vj-posted">' + portalEscape(postedLabel(job.createdAt)) + '</p><h2>' + portalEscape(job.title || 'Open job') + '</h2>'
    + '<dl class="vj-facts"><div class="green"><dt>Pay</dt><dd>' + portalEscape(job.pay || 'Not listed') + '</dd></div><div class="violet"><dt>Job type</dt><dd>' + portalEscape(JOB_TYPE_HOURS[job.type] || job.type || 'Not listed') + '</dd></div><div class="blue"><dt>Where</dt><dd>' + portalEscape(job.arrangement || 'Remote') + '</dd></div><div class="rose"><dt>Hiring</dt><dd>' + portalEscape(JOB_TIMELINES[job.hiringTimeline] || job.hiringTimeline || 'Open') + '</dd></div></dl>'
    + action
    + '<section class="vj-section"><h3>About the job</h3><p class="vj-description">' + portalEscape(job.description || 'The hirer has not added a description yet.') + '</p></section>'
    + (job.responsibilities?.length ? '<section class="vj-section"><h3>What you’ll do</h3><ul>' + job.responsibilities.map(item => '<li>' + portalEscape(item) + '</li>').join('') + '</ul></section>' : '')
    + (job.skills?.length ? '<section class="vj-section"><h3>Skills that help</h3><div class="vj-chips">' + job.skills.map(skill => '<span>' + portalEscape(skill) + '</span>').join('') + '</div></section>' : '')
    + (questions.length ? '<section class="vj-section"><h3>Questions you’ll answer</h3><ol class="vj-questions">' + questions.map(question => '<li>' + portalEscape(question) + '</li>').join('') + '</ol></section>' : '');
  detail.scrollTop = 0;
}
function renderJobs() {
  const query = document.querySelector('#jobSearch').value.trim().toLowerCase();
  const type = document.querySelector('#jobType').value;
  const sort = document.querySelector('#jobSort').value;
  const matches = jobs.filter(job => [job.title,job.description,...(job.skills || [])].join(' ').toLowerCase().includes(query) && (!type || job.type === type))
    .sort((a, b) => sort === 'pay' ? hourlyPay(b) - hourlyPay(a) : String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  document.querySelector('#jobsStatus').textContent = matches.length + ' open job' + (matches.length === 1 ? '' : 's') + (query || type ? ' match your search' : '');
  const applied = new Set((dashboardData.applications || []).map(application => application.job?.id));
  if (!matches.some(job => job.id === selectedJobId)) selectedJobId = matches[0]?.id || '';
  document.querySelector('#jobBrowser').classList.toggle('is-empty', !matches.length);
  document.querySelector('#candidateJobs').innerHTML = matches.length ? matches.map(job => '<button type="button" class="vj-card" data-job-id="' + portalEscape(job.id) + '" aria-pressed="' + String(job.id === selectedJobId) + '"><span class="vj-card-top"><b>' + portalEscape(job.title || 'Open job') + '</b>' + (applied.has(job.id) ? '<em class="vj-pill applied">Applied</em>' : '') + '</span><span class="vj-card-posted">' + portalEscape(postedLabel(job.createdAt)) + '</span><span class="vj-meta"><span class="pay">' + portalEscape(job.pay || 'Pay not listed') + '</span><span>' + portalEscape(job.type || '') + '</span>' + (job.hiringTimeline ? '<span>Hiring ' + portalEscape(JOB_TIMELINES[job.hiringTimeline] || job.hiringTimeline) + '</span>' : '') + '</span></button>').join('') : emptyState(query || type ? 'No matching jobs.' : 'No open jobs right now.', query || type ? 'Try a different search or job type.' : 'Check back soon for new jobs.');
  renderJobDetail(matches.find(job => job.id === selectedJobId), applied.has(selectedJobId));
}
async function loadCandidateDashboard() {
  if (loading) return;
  loading = true;
  portalStatus.hidden = false; portalStatus.className = 'portal-status'; portalStatus.textContent = 'Loading your dashboard…';
  document.querySelector('#dashboardRetry').hidden = true;
  if (dashboardDemo) {
    dashboardData = demoData;
    // ?demo=1&review=1 previews the account of a VA whose profile is under review.
    underReview = new URLSearchParams(window.location.search).has('review');
    if (underReview) Object.assign(demoProfile, { verificationStatus: 'pending' });
    document.querySelector('#reviewBanner').hidden = !underReview;
    document.querySelector('#candidateReady').hidden = false;
    prepareConversations(demoData);
    renderApplications(demoData.applications);
    portalStatus.hidden = true;
    switchTab(activeTab, false);
    loading = false;
    return;
  }
  try {
    candidate = await window.getVerifiedCandidate();
    if (!candidate) { window.location.replace('./candidate-login.html?next=' + encodeURIComponent('./candidate-dashboard.html?tab=' + activeTab)); return; }
    const data = await window.savaPlatform.candidateRequest('candidateDashboard');
    const profile = data.profile || {};
    if (profile.resumeRequired) { window.location.replace('./candidate-resume.html?required=1&next=' + encodeURIComponent('./candidate-dashboard.html')); return; }
    // VAs under review can use their account and browse jobs; applying stays locked until approval.
    underReview = profile.verificationStatus === 'pending' && !profile.verificationBypass;
    const approved = profile.verificationStatus === 'verified' || Boolean(profile.verificationBypass);
    if (approved) {
      const onboarding = await onboardingRequest('status');
      if (onboarding.stage !== 'complete') { window.location.replace('./candidate-onboarding.html'); return; }
    }
    if (!profile.applicationReady && !underReview) {
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
    document.querySelector('#reviewBanner').hidden = !underReview;
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
  // Profile pictures must be the Hire From SA AI picture, so every photo button opens that page.
  if (event.target.closest('[data-pick-photo]') && !photoUploading) window.location.assign('./candidate-profile.html' + (dashboardDemo ? '?demo=1' : ''));
  const dialog = document.querySelector('#profileEditDialog');
  if (event.target.closest('[data-edit-profile]') && dialog) { dialog.hidden = false; document.body.classList.add('vp-dialog-open'); dialog.querySelector('input')?.focus(); }
  if (event.target.closest('[data-close-edit]') && dialog) { dialog.hidden = true; document.body.classList.remove('vp-dialog-open'); }
  const more = event.target.closest('[data-more-roles]');
  if (more) { document.querySelectorAll('.vp-extra-role').forEach(role => { role.hidden = false; }); more.remove(); }
});
document.addEventListener('keydown', event => {
  const dialog = document.querySelector('#profileEditDialog');
  if (event.key === 'Escape' && dialog && !dialog.hidden) { dialog.hidden = true; document.body.classList.remove('vp-dialog-open'); }
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
    if (dashboardDemo) Object.assign(demoProfile, { idealJobTitles: roles, requestedRateMinUsd: min ? Number(min) : null, requestedRateMaxUsd: max ? Number(max) : null, availableHoursPerWeek: hours ? Number(hours) : null, location, startAvailability, preferredJobNote, portfolioLinks: portfolioLinks.split(/\s+/).filter(Boolean) });
    else await window.savaPlatform.candidateRequest('updateCandidateProfileFacts', { idealJobTitles, requestedRateMinUsd: min, requestedRateMaxUsd: max, availableHoursPerWeek: hours, location, startAvailability, preferredJobNote, portfolioLinks });
    profileLoaded = false;
    document.body.classList.remove('vp-dialog-open');
    await loadProfile();
    showPhotoStatus(dashboardDemo ? 'Preview only: changes shown on this page, nothing was saved.' : 'Saved. Hirers now see your updated profile.');
  } catch (error) {
    status.textContent = error.message || 'Could not save profile details. Try again.';
    button.disabled = false;
  }
});
document.querySelector('#candidateReady').addEventListener('click', async event => {
  const action = event.target.closest('[data-open-tab], [data-view-application], [data-thread-id], [data-application-conversation], [data-retry-profile], [data-job-id], [data-job-back], [data-thread-back], [data-share-profile]');
  if (!action) return;
  if (action.dataset.openTab) switchTab(action.dataset.openTab);
  if ('viewApplication' in action.dataset) {
    switchTab('applications');
    const card = [...applicationsRoot.querySelectorAll('[data-application-id]')].find(item => item.dataset.applicationId === action.dataset.viewApplication);
    card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }
  if (action.dataset.threadId) { saveDraft(); selectedConversation = action.dataset.threadId; threadOpenOnPhone = true; renderMessages(); }
  if ('threadBack' in action.dataset) { saveDraft(); threadOpenOnPhone = false; renderMessages(); }
  if (action.dataset.applicationConversation) { saveDraft(); selectedConversation = conversations.find(thread => thread.applicationId === action.dataset.applicationConversation)?.id; threadOpenOnPhone = true; renderMessages(); switchTab('messages'); }
  if ('retryProfile' in action.dataset) { profileLoaded = false; loadProfile(); }
  if (action.dataset.jobId) { selectedJobId = action.dataset.jobId; renderJobs(); document.querySelector('#jobBrowser').classList.add('showing-detail'); if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo(0, 0); }
  if ('jobBack' in action.dataset) document.querySelector('#jobBrowser').classList.remove('showing-detail');
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
    const result = dashboardDemo ? {} : await window.savaPlatform.candidateRequest(thread.id.startsWith('application:') ? 'candidateSendMessage' : 'candidateSendThreadMessage', thread.id.startsWith('application:') ? { applicationId: thread.applicationId, message } : { threadId: thread.id, message });
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
document.querySelector('#candidateMessages').addEventListener('input', event => {
  if (event.target.id !== 'messageSearch') { saveDraft(); return; }
  messageSearch = event.target.value;
  const caret = event.target.selectionStart;
  saveDraft(); renderMessages();
  const search = document.querySelector('#messageSearch');
  search.focus(); search.setSelectionRange(caret, caret);
});
document.querySelector('#messageSort').addEventListener('change', () => { saveDraft(); renderMessages(); });
['#applicationStatus', '#applicationSort'].forEach(selector => document.querySelector(selector).addEventListener('change', () => renderApplications(dashboardData?.applications || [])));
// Only fetch while the inbox is visible. Drafts stay local and survive refreshes.
window.setInterval?.(() => { if (!document.hidden && activeTab === 'messages' && Date.now() - lastInboxRefresh >= 30000) refreshInbox(); }, 30000);
document.querySelector('#jobSearch').addEventListener('input', () => { if (jobsLoaded) renderJobs(); });
document.querySelector('#jobSort').addEventListener('change', () => { if (jobsLoaded) renderJobs(); });
document.querySelector('#jobType').addEventListener('change', () => { if (jobsLoaded) renderJobs(); });
document.querySelector('#jobsRetry').addEventListener('click', loadJobs);
document.querySelector('#dashboardRetry').addEventListener('click', loadCandidateDashboard);
// Payments: earnings, active jobs, payout method and history. Sample data in ?demo; real VAs see empty states until payouts are connected.
const demoPayments = {
  method: { type: 'Wise', detail: 'th•••@gmail.com' },
  nextPayout: { date: new Date(Date.now() + 9 * 864e5).toISOString(), amount: 410 },
  activeJobs: [{ title: 'Customer Support Assistant', company: 'Brightside Dental', rate: '$5 / hour', hours: 82, earned: 410 }],
  history: [
    { date: new Date(Date.now() - 2 * 864e5).toISOString(), company: 'Brightside Dental', title: 'Customer Support Assistant', period: 'Hours worked last month', amount: 800, status: 'Paid' },
    { date: new Date(Date.now() - 32 * 864e5).toISOString(), company: 'Brightside Dental', title: 'Customer Support Assistant', period: 'Hours worked two months ago', amount: 760, status: 'Paid' },
  ],
};
function money(value) { return '$' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function renderPayments() {
  const data = dashboardDemo ? demoPayments : { method: null, nextPayout: null, activeJobs: [], history: [] };
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const paidThisMonth = data.history.filter(item => new Date(item.date) >= monthStart).reduce((sum, item) => sum + item.amount, 0);
  const paidTotal = data.history.reduce((sum, item) => sum + item.amount, 0);
  const stat = (label, value, note) => '<div class="va-pay-stat"><small>' + label + '</small><b>' + value + '</b><span>' + note + '</span></div>';
  document.querySelector('#candidatePayments').innerHTML = `
    <div class="va-pay-top"><div><h1>Payments</h1><p>Hire From SA is free for you. You keep 100% of the rate you agree with the hirer.</p></div></div>
    <div class="va-pay-stats">
      ${stat('Next payout', data.nextPayout ? money(data.nextPayout.amount) : '–', data.nextPayout ? 'On ' + dateLabel(data.nextPayout.date) + ' · earned so far' : 'Starts after your first job')}
      ${stat('Paid this month', money(paidThisMonth), new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date()))}
      ${stat('Total paid to you', money(paidTotal), data.history.length ? data.history.length + ' payment' + (data.history.length === 1 ? '' : 's') : 'No payments yet')}
    </div>
    <section class="va-acct-card"><div class="va-pay-head"><h2>Jobs you're working</h2></div>
      ${data.activeJobs.length ? '<div class="va-pay-jobs">' + data.activeJobs.map(job => '<div class="va-pay-job"><div><b>' + portalEscape(job.title) + '</b><span>' + portalEscape(job.company) + ' · ' + portalEscape(job.rate) + '</span></div><div class="va-pay-job-earned"><b>' + money(job.earned) + '</b><span>' + job.hours + ' hrs this pay period</span></div></div>').join('') + '</div>'
        : '<div class="va-acct-empty"><b>No active jobs yet</b><span>When a hirer hires you, the job and what you have earned so far show here.</span><button type="button" class="va-acct-button" data-open-tab="jobs">Find jobs</button></div>'}
    </section>
    <section class="va-acct-card"><div class="va-pay-head"><h2>Payout method</h2>${data.method ? '<button type="button" class="vp-link" data-pay-method>Change</button>' : ''}</div>
      ${data.method ? '<div class="va-pay-method"><span class="va-pay-method-icon" aria-hidden="true">' + portalEscape(data.method.type.slice(0, 1)) + '</span><div><b>' + portalEscape(data.method.type) + '</b><span>' + portalEscape(data.method.detail) + '</span></div><i>Active</i></div>'
        : '<div class="va-acct-empty"><b>No payout method yet</b><span>You will add where you want to be paid once you are hired for your first job.</span></div>'}
      <p id="payMethodNote" class="va-acct-note" hidden>Changing your payout method is coming soon. Email <a href="mailto:support@hirefromsa.com?subject=Change%20my%20payout%20method">support@hirefromsa.com</a> for now.</p>
    </section>
    <section class="va-acct-card"><div class="va-pay-head"><h2>Payment history</h2></div>
      ${data.history.length ? '<div class="va-pay-table" role="table"><div class="va-pay-row head" role="row"><span role="columnheader">Date</span><span role="columnheader">Job</span><span role="columnheader">Amount</span><span role="columnheader">Status</span></div>' + data.history.map(item => '<div class="va-pay-row" role="row"><span role="cell">' + dateLabel(item.date) + '</span><span role="cell"><b>' + portalEscape(item.title) + '</b><small>' + portalEscape(item.company) + ' · ' + portalEscape(item.period) + '</small></span><span role="cell" class="amount">' + money(item.amount) + '</span><span role="cell"><i class="va-pay-status">' + portalEscape(item.status) + '</i></span></div>').join('') + '</div>'
        : '<div class="va-acct-empty"><b>No payments yet</b><span>Every payment shows here with the date, job and amount.</span></div>'}
    </section>
    <section class="va-acct-card"><h2>How you get paid</h2>
      <ul class="va-acct-steps">
        <li><b>Get hired.</b><span>The rate you agree with the hirer is the rate you are paid.</span></li>
        <li><b>Add your payout method.</b><span>We email you to set this up before your first payment.</span></li>
        <li><b>Get paid.</b><span>Payments land in your account and show in your history here. No fees for you.</span></li>
      </ul>
    </section>`;
}
document.querySelector('#candidatePayments').addEventListener('click', event => {
  if (event.target.closest('[data-pay-method]')) document.querySelector('#payMethodNote').hidden = false;
});
// Settings: name and password save to the signed-in account (Supabase auth), so they work without a backend change.
function settingsUser() { return candidate || window.savaAccountPreviewUser || { email: 'demo.candidate@example.com', user_metadata: { first_name: 'Thandi', last_name: 'Jacobs' } }; }
function fillSettings() {
  const user = settingsUser();
  const form = document.querySelector('#settingsNameForm');
  form.elements.firstName.value ||= user.user_metadata?.first_name || '';
  form.elements.lastName.value ||= user.user_metadata?.last_name || '';
  document.querySelector('#settingsEmail').value = user.email || '';
  const when = value => value && !Number.isNaN(new Date(value).getTime()) ? dateLabel(value) : '–';
  document.querySelector('#settingsJoined').textContent = when(user.created_at || (dashboardDemo ? new Date(Date.now() - 120 * 864e5).toISOString() : ''));
  document.querySelector('#settingsLastSignIn').textContent = user.last_sign_in_at ? dateLabel(user.last_sign_in_at, true) : dashboardDemo || window.savaAccountPreviewUser ? dateLabel(new Date().toISOString(), true) : '–';
}
document.querySelector('[data-show-passwords]').addEventListener('change', event => {
  document.querySelectorAll('#settingsPasswordForm input[type="password"], #settingsPasswordForm input[data-was-password]').forEach(input => {
    input.dataset.wasPassword = '1';
    input.type = event.target.checked ? 'text' : 'password';
  });
});
function settingsStatus(element, message, error = false) {
  const status = element.querySelector('.va-acct-status');
  status.textContent = message;
  status.classList.toggle('error', error);
}
const settingsPreview = () => dashboardDemo || Boolean(window.savaAccountPreviewUser);
document.querySelector('#settingsNameForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button');
  const data = { first_name: form.elements.firstName.value.trim(), last_name: form.elements.lastName.value.trim() };
  if (!data.first_name || !data.last_name) { settingsStatus(form, 'Add your first and last name.', true); return; }
  button.disabled = true; settingsStatus(form, 'Saving…');
  try {
    if (!settingsPreview()) { const { error } = await window.savaAuth.auth.updateUser({ data }); if (error) throw error; }
    settingsStatus(form, 'Saved.');
  } catch (error) { settingsStatus(form, error.message || 'Could not save. Try again.', true); }
  finally { button.disabled = false; }
});
document.querySelector('#settingsPasswordForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button');
  const password = form.elements.password.value;
  if (password.length < 8) { settingsStatus(form, 'Use at least 8 characters.', true); return; }
  if (password !== form.elements.confirm.value) { settingsStatus(form, 'The two passwords don’t match.', true); return; }
  button.disabled = true; settingsStatus(form, 'Changing password…');
  try {
    if (!settingsPreview()) { const { error } = await window.savaAuth.auth.updateUser({ password }); if (error) throw error; }
    form.reset(); settingsStatus(form, 'Password changed.');
  } catch (error) { settingsStatus(form, error.message || 'Could not change your password. Try again.', true); }
  finally { button.disabled = false; }
});
document.querySelector('#settingsSignOutAll').addEventListener('click', async event => {
  const button = event.currentTarget, card = button.closest('.va-acct-card');
  button.disabled = true; settingsStatus(card, 'Signing out…');
  try {
    if (settingsPreview()) { settingsStatus(card, 'Preview only: nothing was signed out.'); button.disabled = false; return; }
    const { error } = await window.savaAuth.auth.signOut({ scope: 'global' });
    if (error) throw error;
    window.location.assign('./candidate-login.html');
  } catch (error) { settingsStatus(card, error.message || 'Could not sign out. Try again.', true); button.disabled = false; }
});
// Help: filter questions by topic chip and search text.
let helpTopic = '';
function filterHelp() {
  const query = document.querySelector('#helpSearch').value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('[data-help-group]').forEach(group => {
    let groupShown = 0;
    group.querySelectorAll('details').forEach(item => {
      const match = (!helpTopic || group.dataset.helpGroup === helpTopic) && (!query || item.textContent.toLowerCase().includes(query));
      item.hidden = !match;
      if (match) { groupShown += 1; if (query) item.open = true; }
    });
    group.hidden = !groupShown;
    shown += groupShown;
  });
  document.querySelector('#helpEmpty').hidden = shown > 0;
}
document.querySelector('#helpSearch').addEventListener('input', filterHelp);
document.querySelector('#panel-help').addEventListener('click', event => {
  const chip = event.target.closest('[data-help-topic]');
  if (!chip) return;
  helpTopic = chip.dataset.helpTopic;
  document.querySelectorAll('[data-help-topic]').forEach(item => item.setAttribute('aria-pressed', String(item === chip)));
  filterHelp();
});
loadCandidateDashboard();
