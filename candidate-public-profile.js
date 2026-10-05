const publicProfileRoot = document.querySelector('#publicProfile');
const publicProfileStatus = document.querySelector('#publicProfileStatus');
const publicProfileError = document.querySelector('#publicProfileError');
const PUBLIC_MESSAGES_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/candidate-messages';
let activePublicProfile = null;
const BLACK_VIDEO_POSTER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='16' height='9' fill='%23000'/%3E%3C/svg%3E";

function profileIcon(name) {
  const paths = {
    back: '<path d="m15 18-6-6 6-6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    share: '<path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M5 13v7h14v-7"/>',
    briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18m-11 0v2h4v-2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    location: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    tools: '<path d="M14 7a5 5 0 0 0 6 6l-7.5 7.5a2 2 0 0 1-3-3L17 10a5 5 0 0 0 4-6l-4 4-3-1-1-3 4-4a5 5 0 0 0-6 6"/>',
    message: '<path d="M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.3A8 8 0 1 1 20 11.5Z"/>',
    play: '<path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>',
    more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function publicEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
function publicAsset(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function candidateInitials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'SA';
}
function monthLabel(value) {
  if (/^\d{4}$/.test(value || '')) return value;
  if (!/^\d{4}-\d{2}$/.test(value || '')) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + '-01T00:00:00Z'));
}
function experienceLabel(entry) {
  return [monthLabel(entry.startDate), entry.currentRole ? 'Present' : monthLabel(entry.endDate)].filter(Boolean).join(' – ');
}
function publicList(value, limit = 20) {
  return (Array.isArray(value) ? value : []).filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()).filter((item, index, values) => values.indexOf(item) === index).slice(0, limit);
}
function publicName(name) {
  return String(name || 'Candidate').trim().split(/\s+/)[0];
}
function publicFact(icon, value, label, color) {
  return `<div class="public-profile-fact"><span class="public-profile-fact-icon ${color}" aria-hidden="true">${icon === 'rate' ? '$' : profileIcon(icon)}</span><span><strong>${publicEscape(value)}</strong><small>${publicEscape(label)}</small></span></div>`;
}
function publicBackgroundTags(items, visibleCount = 5) {
  const tags = list => `<div class="public-profile-background-tags">${list.map(item => `<span>${publicEscape(item)}</span>`).join('')}</div>`;
  const rest = items.slice(visibleCount);
  return tags(items.slice(0, visibleCount)) + (rest.length ? `<details class="public-profile-background-more"><summary>Show ${rest.length} more</summary>${tags(rest)}</details>` : '');
}
function renderPublicProfile(profile) {
  activePublicProfile = profile;
  const name = String(profile.name || 'Hire From SA candidate').trim();
  const firstName = publicName(name);
  const role = String(profile.primaryRole || 'Remote professional').trim();
  const photo = publicAsset(profile.photoUrl);
  const intro = publicAsset(profile.introUrl);
  const summary = String(profile.summary || '').trim();
  const portfolioLinks = publicList(profile.portfolioLinks, 5).map(publicAsset).filter(link => {
    if (!link) return false;
    const url = new URL(link);
    return !url.username && !url.password;
  });
  const portfolioPanel = portfolioLinks.length ? `<section class="public-profile-panel public-profile-portfolio-panel"><div class="public-profile-panel-heading"><h2>Portfolio & Work Samples</h2></div><div class="public-profile-portfolio-links">${portfolioLinks.map(link => `<a href="${publicEscape(link)}" target="_blank" rel="noopener noreferrer">${publicEscape(new URL(link).hostname.replace(/^www\./, '') + (new URL(link).pathname === '/' ? '' : new URL(link).pathname))} <span aria-hidden="true">↗</span></a>`).join('')}</div></section>` : '';
  const idealJobs = publicList(profile.idealJobTitles, 5);
  const skills = publicList(profile.skills);
  const software = publicList(profile.software);
  const industries = publicList(profile.industries);
  const education = publicList(profile.education, 12);
  const certifications = publicList(profile.certifications, 12);
  const languages = publicList(profile.languages);
  const years = Math.max(0, Number(profile.relevantYears) || 0);
  const yearsLabel = years ? (years < 1 ? 'Under 1 year' : `${Math.floor(years)} ${Math.floor(years) === 1 ? 'Year' : 'Years'}`) : 'Not added';
  const rateMin = Number(profile.requestedRateMinUsd);
  const rateMax = Number(profile.requestedRateMaxUsd);
  const requestedRate = rateMin > 0 && rateMax >= rateMin ? `$${rateMin.toLocaleString('en-US', { maximumFractionDigits: 2 })}${rateMax > rateMin ? `–$${rateMax.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''}/hr` : 'Not added';
  const hours = Number(profile.availableHoursPerWeek);
  const availability = Number.isInteger(hours) && hours > 0 ? `${hours} hrs/week` : 'Not added';
  const startLabels = { immediately: 'Available now', two_weeks: 'Starts within 2 weeks', one_month: 'Starts within a month', flexible: 'Flexible start' };
  const timeZones = publicList(profile.workTimeZones, 4).join(' · ') || 'Not added';
  const experience = (Array.isArray(profile.experience) ? profile.experience : []).filter(entry => entry && (entry.jobTitle || entry.companyName)).slice(0, 20);
  const facts = [
    publicFact('rate', requestedRate, 'Requested Rate', 'green'),
    publicFact('briefcase', yearsLabel, 'Experience', 'violet'),
    publicFact('clock', availability, startLabels[profile.startAvailability] || 'Availability', 'blue'),
    publicFact('globe', timeZones, 'Time Zones', 'rose'),
  ].join('');
  const roleMarkup = experience.map((entry, index) => `<article class="public-profile-role${index > 1 ? ' public-profile-extra-role' : ''}"${index > 1 ? ' hidden' : ''}><h3>${publicEscape(entry.jobTitle)}</h3><small>${publicEscape([entry.companyName, experienceLabel(entry)].filter(Boolean).join('  ·  '))}</small>${entry.description ? `<p>${publicEscape(entry.description)}</p>` : ''}</article>`).join('');
  const backgroundGroups = [
    education.length ? `<div class="public-profile-background-group"><p class="public-profile-eyebrow">EDUCATION</p>${publicBackgroundTags(education, 3)}</div>` : '',
    certifications.length ? `<div class="public-profile-background-group"><p class="public-profile-eyebrow">CERTIFICATIONS</p>${publicBackgroundTags(certifications)}</div>` : '',
    languages.length ? `<div class="public-profile-background-group"><p class="public-profile-eyebrow">LANGUAGES</p>${publicBackgroundTags(languages)}</div>` : '',
  ].filter(Boolean).join('');
  const careerContent = experience.length ? `<div class="public-profile-experience">${roleMarkup}</div>` : '';
  const backgroundMarkup = backgroundGroups ? `<details class="public-profile-more-background"><summary>More background <span aria-hidden="true">→</span></summary><div>${backgroundGroups}</div></details>` : '';
  const careerPanel = careerContent ? `<section class="public-profile-panel public-profile-experience-panel"><div class="public-profile-panel-heading"><h2><span class="public-profile-heading-icon" aria-hidden="true">${profileIcon('briefcase')}</span> ${experience.length ? 'Work Experience' : 'Background'}${experience.length && profile.experienceSource === 'resume' ? '<small class="public-profile-resume-source">From resume</small>' : ''}</h2>${experience.length > 2 ? '<button type="button" class="public-profile-view-experience" data-expand-experience aria-expanded="false">View Full Experience <span aria-hidden="true">→</span></button>' : ''}</div>${careerContent}</section>` : '';
  const toolMarkup = software.map(tool => {
    const key = tool.toLowerCase();
    const brand = key.includes('google') ? 'google' : key.includes('slack') ? 'slack' : key.includes('notion') ? 'notion' : key.includes('microsoft') || key.includes('office') ? 'microsoft' : key.includes('zoom') ? 'zoom' : 'generic';
    const mark = brand === 'slack' ? '#' : brand === 'microsoft' ? '▦' : tool.slice(0, 1).toUpperCase();
    return `<span><i class="tool-brand-${brand}" aria-hidden="true">${publicEscape(mark)}</i>${publicEscape(tool)}</span>`;
  }).join('');
  const skillAndTools = skills.length || industries.length || software.length ? `<div class="public-profile-columns">
    ${skills.length ? `<section class="public-profile-panel public-profile-skills-panel"><div class="public-profile-panel-heading"><h2>Skills</h2><small class="public-profile-resume-source">From resume</small></div><div class="public-profile-skills">${skills.map(skill => `<span>${publicEscape(skill)}</span>`).join('')}</div></section>` : ''}
    ${industries.length ? `<section class="public-profile-panel public-profile-industries-panel"><div class="public-profile-panel-heading"><h2>Industries</h2></div><div class="public-profile-skills">${industries.map(industry => `<span>${publicEscape(industry)}</span>`).join('')}</div></section>` : ''}
    ${software.length ? `<section class="public-profile-panel public-profile-tools-panel"><div class="public-profile-panel-heading"><h2><span class="public-profile-heading-icon" aria-hidden="true">${profileIcon('tools')}</span> Tools & Software</h2><small class="public-profile-resume-source">From resume</small></div><div class="public-profile-tools">${toolMarkup}</div></section>` : ''}
  </div>` : '';
  const avatar = photo ? `<img src="${publicEscape(photo)}" alt="${publicEscape(name)}" />` : publicEscape(candidateInitials(name));
  const saved = isPublicProfileSaved();

  document.title = `${name} — Hire From SA`;
  document.querySelector('meta[name="description"]').content = `${role} profile on Hire From SA.`;
  publicProfileRoot.innerHTML = `
    <article class="public-profile-card">
      <nav class="public-profile-mobile-topbar" aria-label="Profile actions">
        <a class="public-profile-back" href="/talent.html" aria-label="Back to talent search">${profileIcon('back')}</a>
        <div>
          <button type="button" data-save-public aria-pressed="${saved}" aria-label="${saved ? 'Remove saved profile' : 'Save profile'}">${profileIcon('heart')}</button>
          <button type="button" data-share-public aria-label="Share ${publicEscape(name)}'s profile">${profileIcon('share')}</button>
          <details class="public-profile-more"><summary aria-label="More profile options">${profileIcon('more')}</summary><div><button type="button" data-share-public>Copy profile link</button><a href="/talent.html">Browse talent</a></div></details>
        </div>
      </nav>
      <header class="public-profile-hero">
        <span class="public-profile-avatar">${avatar}</span>
        <div class="public-profile-identity">
          <div class="public-profile-name-line"><h1>${publicEscape(name)}</h1>${profile.verified ? '<span class="public-profile-verified"><span aria-hidden="true">✓</span> Vetted by our team</span>' : ''}</div>
          <p class="public-profile-role-line">${publicEscape(role)}${years ? ` <span aria-hidden="true">·</span> ${publicEscape(yearsLabel)} experience` : ''}</p>
          ${idealJobs.length ? `<p class="public-profile-ideal-jobs">Seeking ${publicEscape(idealJobs.join(' · '))}</p>` : ''}
        </div>
        <div class="public-profile-actions"><button type="button" data-save-public aria-pressed="${saved}">${profileIcon('heart')}<span>${saved ? 'Saved' : 'Save'}</span></button><button type="button" data-share-public>${profileIcon('share')}<span>Share</span></button><button type="button" class="public-profile-contact-top" data-contact-public>${profileIcon('message')}<span>Contact Now</span></button></div>
      </header>
      <div class="public-profile-body ${intro ? 'has-video' : ''}">
        <div class="public-profile-facts">${facts}</div>
        <div class="public-profile-intro ${intro ? 'has-video' : ''}">
          ${intro ? `<section class="public-profile-video-wrap" aria-label="Video introduction"><video class="public-profile-video" src="${publicEscape(intro)}" controls playsinline preload="metadata" poster="${BLACK_VIDEO_POSTER}" aria-label="${publicEscape(name)} video introduction"></video><span class="public-profile-video-duration" aria-label="Video duration">Video intro</span><button type="button" class="public-profile-play" aria-label="Play ${publicEscape(name)}'s introduction">${profileIcon('play')}</button><span class="public-profile-video-caption">Watch ${publicEscape(firstName)}'s introduction</span></section>` : ''}
          <section class="public-profile-story"><h2>About ${publicEscape(firstName)}</h2>${summary ? `<p>${publicEscape(summary)}</p>` : '<p>Explore this candidate’s skills, tools, and career background below.</p>'}</section>
        </div>
        <div class="public-profile-detail-layout">${careerPanel}${skillAndTools}${portfolioPanel}</div>
        <section class="public-profile-cta"><div><p class="public-profile-cta-icon" aria-hidden="true">${profileIcon('message')}</p><div><h2>Interested in ${publicEscape(firstName)}?</h2><p>Send ${publicEscape(firstName)} a message to start a conversation.</p></div></div><div class="public-profile-cta-actions"><button type="button" data-contact-public>${profileIcon('message')} Contact Now</button></div></section>
      </div>
      <footer class="public-profile-footer">Contact details are kept private. Hirers connect with candidates through Hire From SA.</footer>
    </article>
    <div class="public-profile-mobile-cta"><button type="button" data-contact-public>${profileIcon('message')} Contact Now</button></div>
    <div id="publicContactDialog" class="public-contact-dialog" hidden><button class="public-contact-backdrop" type="button" data-close-contact aria-label="Close message panel"></button><section class="public-contact-panel" role="dialog" aria-modal="true" aria-labelledby="publicContactTitle"><header><div><p class="public-profile-eyebrow">HIRING CONVERSATION</p><h2 id="publicContactTitle">Contact ${publicEscape(firstName)}</h2></div><button type="button" data-close-contact aria-label="Close message panel">×</button></header><div id="publicContactGate" class="public-contact-gate" hidden><p class="public-contact-gate-icon" aria-hidden="true">${profileIcon('message')}</p><h3>Create an account to message ${publicEscape(firstName)}</h3><p>It's free and takes under a minute.</p><button type="button" data-contact-signup>Create my account <span aria-hidden="true">→</span></button><a href="${publicEscape(profileLoginUrl())}" data-contact-login>Already have an account? Log in</a></div><div id="publicContactMessages" class="public-contact-messages" role="log" aria-label="Conversation messages"></div><form id="publicContactForm"><label id="publicContactJobRow" class="public-contact-job" hidden>Which job is this about?<select id="publicContactJob"></select></label><label for="publicContactBody">Your message</label><textarea id="publicContactBody" maxlength="2000" rows="5" required placeholder="Introduce yourself and the opportunity…"></textarea><div><span id="publicContactStatus" role="status" aria-live="polite"></span><button type="submit">Send message <span aria-hidden="true">→</span></button></div></form></section></div>
    <span id="sharePublicStatus" class="public-profile-toast" role="status" aria-live="polite"></span>`;
  const video = publicProfileRoot.querySelector?.('.public-profile-video');
  if (video) {
    import('./video-thumbnail.mjs').then(({ applyVideoThumbnail }) => applyVideoThumbnail(video, { fallback: photo })).catch(() => {});
    const play = publicProfileRoot.querySelector('.public-profile-play');
    const duration = publicProfileRoot.querySelector('.public-profile-video-duration');
    video.addEventListener('loadedmetadata', () => { if (Number.isFinite(video.duration)) duration.textContent = `${Math.floor(video.duration / 60)}:${String(Math.floor(video.duration % 60)).padStart(2, '0')}`; });
    const caption = publicProfileRoot.querySelector('.public-profile-video-caption');
    // Phones: hide the native control bar until playback so the caption can sit at the bottom of the video.
    if (window.matchMedia('(max-width: 680px)').matches) video.removeAttribute('controls');
    video.addEventListener('play', () => { play.hidden = true; video.controls = true; if (caption) caption.hidden = true; });
    video.addEventListener('pause', () => { play.hidden = false; });
    video.addEventListener('ended', () => { play.hidden = false; });
  }
  publicProfileStatus.hidden = true;
  publicProfileRoot.hidden = false;
}
async function sharePublicProfile() {
  const status = document.querySelector('#sharePublicStatus');
  try {
    if (navigator.share) await navigator.share({ title: document.title, url: location.href });
    else await navigator.clipboard.writeText(location.href);
    status.textContent = navigator.share ? 'Shared' : 'Link copied';
  } catch (error) {
    if (error?.name !== 'AbortError') status.textContent = 'Copy the link from your browser';
  }
}
function isPublicProfileSaved() {
  try { return JSON.parse(localStorage.getItem('hirefromsa:saved-profiles') || '[]').includes(new URLSearchParams(location.search).get('profile')); }
  catch { return false; }
}
function togglePublicProfileSaved() {
  const slug = new URLSearchParams(location.search).get('profile');
  try {
    const saved = JSON.parse(localStorage.getItem('hirefromsa:saved-profiles') || '[]');
    const next = (Array.isArray(saved) ? saved : []).filter(item => item !== slug);
    if (!saved.includes(slug)) next.push(slug);
    localStorage.setItem('hirefromsa:saved-profiles', JSON.stringify(next));
    const isSaved = next.includes(slug);
    publicProfileRoot.querySelectorAll('[data-save-public]').forEach(button => {
      button.setAttribute('aria-pressed', String(isSaved));
      button.setAttribute('aria-label', isSaved ? 'Remove saved profile' : 'Save profile');
      const label = button.querySelector('span');
      if (label) label.textContent = isSaved ? 'Saved' : 'Save';
    });
    document.querySelector('#sharePublicStatus').textContent = isSaved ? 'Saved on this device' : 'Removed from saved profiles';
  } catch { document.querySelector('#sharePublicStatus').textContent = 'Saving is unavailable in this browser'; }
}
function profileContactUrl() {
  const slug = new URLSearchParams(location.search).get('profile') || '';
  return `./candidate-public-profile.html?profile=${encodeURIComponent(slug)}&contact=message`;
}
function profileLoginUrl() {
  return `/employer-login.html?next=${encodeURIComponent(profileContactUrl())}`;
}
// Remember which VA the hirer wanted, so sign-up, Post a job and the job-live screen can bring them back.
function rememberContact() {
  try { sessionStorage.setItem('sava-contact-return', JSON.stringify({ url: profileContactUrl(), name: publicName(activePublicProfile.name) })); } catch { /* storage unavailable */ }
}
function startSignupForContact() {
  rememberContact();
  location.assign(`/employer-signup.html?next=${encodeURIComponent(profileContactUrl())}`);
}
// Hirers must post a job before messaging. The job page explains why and links back after publishing.
function startJobForContact() {
  rememberContact();
  try { localStorage.removeItem('ea-hiring-role'); } catch { /* The job can still be posted. */ }
  location.assign('./index.html');
}
async function publicMessageRequest(action, body = '') {
  const token = await window.getAccessToken?.();
  if (!token) throw new Error('Sign in with a hirer account to send a message.');
  const identity = window.savaPlatform.employerIdentity();
  const response = await fetch(PUBLIC_MESSAGES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, employerId: identity.employerId, editToken: identity.editToken,
      candidateKey: `profile:${new URLSearchParams(location.search).get('profile')}`,
      candidateName: activePublicProfile.name, roleName: activePublicProfile.primaryRole, jobId: document.querySelector('#publicContactJob')?.value || '', ...(body ? { body } : {}) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Messages could not connect.');
  return result;
}
function renderPublicMessages(messages) {
  const root = document.querySelector('#publicContactMessages');
  root.innerHTML = messages.length ? messages.map(message => `<article class="public-contact-message ${message.sender === 'candidate' ? 'candidate' : 'employer'}"><p>${publicEscape(message.body)}</p><small>${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.createdAt))}</small></article>`).join('') : '<p class="public-contact-empty">No messages yet. Introduce yourself to start the conversation.</p>';
  root.scrollTop = root.scrollHeight;
}
async function openPublicContact() {
  let employer = null;
  try { employer = await window.getVerifiedEmployer?.(); }
  catch (error) {
    document.querySelector('#sharePublicStatus').textContent = error.message || 'Sign-in check unavailable. Try again.';
    return;
  }
  const dialog = document.querySelector('#publicContactDialog');
  const status = document.querySelector('#publicContactStatus');
  const body = document.querySelector('#publicContactBody');
  const gate = document.querySelector('#publicContactGate');
  const form = document.querySelector('#publicContactForm');
  const messagesRoot = document.querySelector('#publicContactMessages');
  const firstName = publicName(activePublicProfile.name);
  document.querySelector('#publicContactTitle').textContent = `Contact ${firstName}`;
  gate.hidden = true; form.hidden = true; messagesRoot.hidden = false;
  body.value = '';
  status.textContent = '';
  dialog.hidden = false;
  document.body.classList.add('public-dialog-open');
  if (!employer) { messagesRoot.hidden = true; gate.hidden = false; gate.querySelector('button').focus(); return; }
  messagesRoot.innerHTML = '<p class="public-contact-empty">Loading…</p>';
  let activeJobs = [];
  try {
    // Localhost-only preview: ?accountPreview=employer&previewJobs=0 (no jobs) or =2 (two jobs).
    const previewJobs = ['localhost', '127.0.0.1'].includes(location.hostname) ? new URLSearchParams(location.search).get('previewJobs') : null;
    const dashboard = previewJobs !== null
      ? { jobs: Array.from({ length: Number(previewJobs) || 0 }, (_, index) => ({ id: `preview-${index}`, title: ['Executive Assistant', 'Bookkeeper'][index % 2], status: 'active' })) }
      : await window.savaPlatform.employerRequest('employerDashboard');
    activeJobs = (dashboard.jobs || []).filter(job => job.status === 'active');
  } catch (error) { messagesRoot.innerHTML = `<p class="public-contact-empty error">${publicEscape(error.message || 'Your jobs could not be loaded. Try again.')}</p>`; return; }
  if (!activeJobs.length) { startJobForContact(); return; }
  const jobSelect = document.querySelector('#publicContactJob');
  jobSelect.innerHTML = activeJobs.map(job => `<option value="${publicEscape(job.id)}">${publicEscape(job.title)}</option>`).join('');
  document.querySelector('#publicContactJobRow').hidden = activeJobs.length < 2;
  form.hidden = false;
  messagesRoot.innerHTML = '<p class="public-contact-empty">Loading conversation…</p>';
  try { const result = await publicMessageRequest('list'); renderPublicMessages(result.messages || []); }
  catch (error) { messagesRoot.innerHTML = `<p class="public-contact-empty error">${publicEscape(error.message)}</p>`; }
  body.focus();
}
function closePublicContact() {
  const dialog = document.querySelector('#publicContactDialog');
  if (!dialog) return;
  dialog.hidden = true;
  document.body.classList.remove('public-dialog-open');
}
async function loadPublicProfile() {
  // Localhost-only sample profiles (?demo=demo-1 … demo-20) from the gitignored local-preview folder.
  const demoId = new URLSearchParams(location.search).get('demo') || '';
  if (['localhost', '127.0.0.1'].includes(location.hostname) && /^demo-\d+$/.test(demoId)) {
    try {
      const people = await (await fetch('./local-preview/demo-candidates.json')).json();
      const person = people.find((item) => item.id === demoId);
      if (!person) throw new Error('Sample profile not found');
      renderPublicProfile(person);
    } catch {
      publicProfileStatus.hidden = true;
      publicProfileError.hidden = false;
    }
    return;
  }
  const shareSlug = new URLSearchParams(location.search).get('profile') || '';
  if (!/^[0-9a-f]{32}$/.test(shareSlug)) { publicProfileStatus.hidden = true; publicProfileError.hidden = false; return; }
  try {
    const result = await window.savaPlatform.publicRequest('publicCandidateProfile', { shareSlug });
    if (!result.profile) throw new Error('Profile unavailable');
    // Local-only: overlay draft profile text from local-preview/ (gitignored) when previewing on localhost.
    const draft = new URLSearchParams(location.search).get('draft') || '';
    if (['localhost', '127.0.0.1'].includes(location.hostname) && /^[a-z0-9-]+$/.test(draft)) {
      const response = await fetch(`./local-preview/${draft}.json`);
      if (response.ok) Object.assign(result.profile, await response.json(), { experienceSource: 'draft' });
    }
    renderPublicProfile(result.profile);
    const intent = new URLSearchParams(location.search).get('contact');
    if (intent === 'message' || intent === 'interview') openPublicContact();
  } catch {
    publicProfileStatus.hidden = true;
    publicProfileError.hidden = false;
  }
}
publicProfileRoot.addEventListener('click', event => {
  if (event.target.closest('[data-share-public]')) sharePublicProfile();
  if (event.target.closest('[data-save-public]')) togglePublicProfileSaved();
  if (event.target.closest('[data-contact-public]')) openPublicContact();
  if (event.target.closest('[data-close-contact]')) closePublicContact();
  if (event.target.closest('[data-contact-signup]')) startSignupForContact();
  if (event.target.closest('[data-contact-login]')) rememberContact();
  if (event.target.closest('.public-profile-play')) publicProfileRoot.querySelector('.public-profile-video')?.play();
  const expand = event.target.closest('[data-expand-experience]');
  if (expand) {
    const expanded = expand.getAttribute('aria-expanded') === 'true';
    publicProfileRoot.querySelectorAll('.public-profile-extra-role').forEach(role => { role.hidden = expanded; });
    expand.setAttribute('aria-expanded', String(!expanded));
    expand.innerHTML = expanded ? 'View Full Experience <span aria-hidden="true">→</span>' : 'Show Less <span aria-hidden="true">↑</span>';
  }
});
publicProfileRoot.addEventListener('submit', async event => {
  if (event.target.id !== 'publicContactForm') return;
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const body = form.querySelector('textarea').value.trim();
  const button = form.querySelector('button[type="submit"]');
  const status = document.querySelector('#publicContactStatus');
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    const result = await publicMessageRequest('send', body);
    renderPublicMessages(result.messages || []);
    form.querySelector('textarea').value = '';
    status.textContent = result.emailNotification === 'sent' ? 'Sent. Candidate notified by email.' : 'Message sent.';
  } catch (error) { status.textContent = error.message || 'Message could not be sent. Try again.'; }
  finally { button.disabled = false; }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePublicContact(); });
loadPublicProfile();
