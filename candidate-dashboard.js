const applicationsRoot = document.querySelector('#candidateApplications');
const portalStatus = document.querySelector('#portalStatus');

function portalEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function statusLabel(status) {
  return ({ new: 'Application received', shortlisted: 'Shortlisted', interviewing: 'Interview stage', rejected: 'Not moving forward', hired: 'Hired' })[status] || status;
}

function renderApplications(applications) {
  if (!applications.length) {
    applicationsRoot.innerHTML = '<section class="portal-empty"><h2>No applications yet.</h2><p>Find a role that fits your experience and submit your profile.</p><a href="./jobs.html">Browse open roles →</a></section>';
    return;
  }
  applicationsRoot.innerHTML = applications.map((application) => {
    const messages = application.messages || [];
    return `<article class="portal-application" data-application-id="${portalEscape(application.id)}"><header><div><span>${portalEscape(application.job.company)}</span><h2>${portalEscape(application.job.title)}</h2><p>${portalEscape(application.job.arrangement)} · ${portalEscape(application.job.type)} · ${portalEscape(application.job.location)}</p></div><strong class="application-status ${portalEscape(application.status)}">${portalEscape(statusLabel(application.status))}</strong></header><div class="application-details"><span>Applied ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(application.submittedAt))}</span><span>${Number(application.match || 0)}% profile match</span></div><section class="candidate-conversation"><div class="conversation-heading"><div><p class="portal-kicker">MESSAGES</p><h3>Conversation with ${portalEscape(application.job.company)}</h3></div></div><div class="candidate-thread">${messages.length ? messages.map((message) => `<article class="candidate-message ${message.sender}"><p>${portalEscape(message.body)}</p><time>${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.createdAt))}</time></article>`).join('') : '<p class="thread-empty">No messages yet. You can ask the hirer a question below.</p>'}</div><form class="candidate-message-form"><label>Message<textarea name="message" maxlength="2000" rows="3" placeholder="Write a message to the hirer…" required></textarea></label><div><span class="send-status" aria-live="polite"></span><button type="submit">Send message <span>→</span></button></div></form></section></article>`;
  }).join('');
}

async function loadCandidateDashboard() {
  const user = await window.getVerifiedCandidate();
  if (!user) {
    window.location.replace(`./candidate-login.html?next=${encodeURIComponent('./candidate-dashboard.html')}`);
    return;
  }
  document.querySelector('#candidateWelcome').textContent = `Signed in as ${user.email}. Track applications and interview conversations here.`;
  try {
    const { applications } = await window.savaPlatform.candidateRequest('candidateDashboard');
    portalStatus.hidden = true;
    renderApplications(applications || []);
  } catch (error) {
    portalStatus.textContent = error.message || 'Your applications could not be loaded.';
    portalStatus.className = 'portal-status error';
  }
}

applicationsRoot.addEventListener('submit', async (event) => {
  const form = event.target.closest('.candidate-message-form');
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const applicationId = form.closest('[data-application-id]').dataset.applicationId;
  const message = form.elements.message.value.trim();
  const button = form.querySelector('button');
  const status = form.querySelector('.send-status');
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    await window.savaPlatform.candidateRequest('candidateSendMessage', { applicationId, message });
    status.textContent = 'Sent.';
    await loadCandidateDashboard();
  } catch (error) {
    status.textContent = error.message || 'Message failed to send.';
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#candidateSignOut').addEventListener('click', async () => {
  await window.savaAuth.auth.signOut();
  window.location.assign('./jobs.html');
});

loadCandidateDashboard();
