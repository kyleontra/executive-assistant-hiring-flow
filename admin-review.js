const ADMIN_REVIEW_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/admin-review';
const ADMIN_SESSION_KEY = 'hirefromsa:review-admin-key';

const accessPanel = document.querySelector('#accessPanel');
const reviewDashboard = document.querySelector('#reviewDashboard');
const accessForm = document.querySelector('#accessForm');
const adminKeyInput = document.querySelector('#adminKey');
const accessError = document.querySelector('#accessError');
const reviewList = document.querySelector('#reviewList');
const reviewEmpty = document.querySelector('#reviewEmpty');
const reviewSummary = document.querySelector('#reviewSummary');
const acceptAllButton = document.querySelector('#acceptAll');
let adminKey = sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
let reviews = [];
let activeFilter = 'all';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function toast(message) {
  const target = document.querySelector('#reviewToast');
  target.textContent = message;
  target.classList.add('show');
  window.setTimeout(() => target.classList.remove('show'), 2800);
}

async function reviewRequest(action, payload = {}) {
  const response = await fetch(ADMIN_REVIEW_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, adminKey, ...payload }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The review service could not complete that request.');
  return result;
}

function formattedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently submitted' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function reviewMatches(review) {
  const status = review.candidate.verificationStatus;
  if (activeFilter === 'all') return true;
  if (activeFilter === 'incomplete') return (!review.ready || !review.hasProfile) && status !== 'verified' && status !== 'rejected';
  if (activeFilter === 'pending') return review.ready && review.hasProfile && status !== 'verified' && status !== 'rejected';
  return status === activeFilter;
}

function experienceMarkup(experience) {
  if (!experience?.length) return '<p class="missing">No experience supplied.</p>';
  return experience.map((entry) => `<article class="experience-row"><b>${escapeHtml(entry.jobTitle || 'Role')}</b><span>${escapeHtml(entry.companyName || '')}</span><small>${escapeHtml(entry.startDate || '')}${entry.currentRole ? ' – Present' : entry.endDate ? ` – ${escapeHtml(entry.endDate)}` : ''}</small><p>${escapeHtml(entry.description || '')}</p></article>`).join('');
}

function fileMarkup(review) {
  const files = review.files;
  return `<div class="evidence-grid">
    <figure>${files.frontUrl ? `<img src="${escapeHtml(files.frontUrl)}" alt="Front of submitted ID" />` : '<div class="missing-file">Not submitted</div>'}<figcaption>ID front</figcaption></figure>
    <figure>${files.backUrl ? `<img src="${escapeHtml(files.backUrl)}" alt="Back of submitted ID" />` : '<div class="missing-file">Not submitted</div>'}<figcaption>ID back</figcaption></figure>
    <figure class="video-evidence">${files.videoUrl ? `<video src="${escapeHtml(files.videoUrl)}" controls playsinline preload="metadata"></video>` : '<div class="missing-file">Waiting for video</div>'}<figcaption>ID video</figcaption></figure>
  </div>`;
}

function renderReviews() {
  const visible = reviews.filter(reviewMatches);
  reviewList.innerHTML = visible.map((review) => {
    const candidate = review.candidate;
    const accepted = candidate.verificationStatus === 'verified';
    const rejected = candidate.verificationStatus === 'rejected';
    const state = accepted
      ? 'Accepted'
      : rejected
        ? 'Rejected'
        : !review.hasSubmission
          ? review.hasProfile ? 'Profile started' : candidate.emailConfirmed ? 'Account created' : 'Email not confirmed'
          : !review.hasProfile ? 'Profile unavailable' : review.ready ? 'Ready for review' : 'Waiting for video';
    return `<article class="review-card" data-reference="${escapeHtml(review.reference)}">
      <header><div class="candidate-heading">${candidate.profilePhotoUrl ? `<img src="${escapeHtml(candidate.profilePhotoUrl)}" alt="" />` : '<span class="profile-placeholder">?</span>'}<div><p>${escapeHtml(review.reference)} · ${escapeHtml(formattedDate(review.submittedAt))}</p><h2>${escapeHtml(candidate.name)}</h2><a href="mailto:${escapeHtml(candidate.email)}">${escapeHtml(candidate.email)}</a></div></div><span class="review-state ${accepted ? 'accepted' : rejected ? 'rejected' : review.ready && review.hasProfile ? 'ready' : 'waiting'}">${state}</span></header>
      <div class="candidate-summary"><div><span>Relevant experience</span><b>${Number(candidate.relevantYears || 0).toFixed(1)} years</b></div><p>${escapeHtml(candidate.summary)}</p></div>
      ${fileMarkup(review)}
      <details><summary>View full experience</summary><div class="experience-list">${experienceMarkup(candidate.experience)}</div></details>
      <footer><button class="reject" type="button" data-action="reject" ${rejected || !review.hasProfile || !review.hasSubmission ? 'disabled' : ''}>Reject</button><button type="button" data-action="accept" ${!review.ready || !review.hasProfile || accepted ? 'disabled' : ''}>${accepted ? 'Accepted ✓' : !review.hasSubmission ? 'Documents required' : !review.hasProfile ? 'Profile unavailable' : review.ready ? 'Accept candidate' : 'Video required'}</button></footer>
    </article>`;
  }).join('');
  reviewEmpty.hidden = visible.length > 0;
  const ready = reviews.filter((review) => review.ready && review.hasProfile && !['verified', 'rejected'].includes(review.candidate.verificationStatus));
  acceptAllButton.disabled = ready.length === 0;
  acceptAllButton.textContent = ready.length ? `Accept all ready (${ready.length})` : 'Accept all ready';
  const accounts = reviews.filter((review) => !review.hasSubmission).length;
  reviewSummary.textContent = `${reviews.length} candidate${reviews.length === 1 ? '' : 's'} · ${accounts} awaiting documents · ${ready.length} ready for approval`;
}

async function loadReviews() {
  reviewList.innerHTML = '<p class="loading">Loading private review files…</p>';
  reviewEmpty.hidden = true;
  const result = await reviewRequest('listReviews');
  reviews = result.reviews || [];
  renderReviews();
}

async function unlock() {
  accessError.textContent = '';
  try {
    await loadReviews();
    sessionStorage.setItem(ADMIN_SESSION_KEY, adminKey);
    accessPanel.hidden = true;
    reviewDashboard.hidden = false;
  } catch (error) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    accessError.textContent = error.message;
    throw error;
  }
}

accessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  adminKey = adminKeyInput.value.trim();
  const button = accessForm.querySelector('button');
  button.disabled = true;
  try { await unlock(); } catch { /* Error is shown beside the field. */ } finally { button.disabled = false; }
});

document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === button));
  renderReviews();
}));

reviewList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const card = event.target.closest('[data-reference]');
  if (!button || !card) return;
  button.disabled = true;
  try {
    const accepting = button.dataset.action === 'accept';
    await reviewRequest(accepting ? 'acceptReview' : 'rejectReview', { reference: card.dataset.reference });
    toast(accepting ? 'Candidate accepted' : 'Candidate rejected');
    await loadReviews();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});

acceptAllButton.addEventListener('click', async () => {
  acceptAllButton.disabled = true;
  try {
    const { accepted } = await reviewRequest('acceptAll');
    toast(`${accepted} candidate${accepted === 1 ? '' : 's'} accepted`);
    await loadReviews();
  } catch (error) {
    toast(error.message);
    acceptAllButton.disabled = false;
  }
});

document.querySelector('#refreshReviews').addEventListener('click', () => loadReviews().catch((error) => toast(error.message)));
document.querySelector('#lockDashboard').addEventListener('click', () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  adminKey = '';
  adminKeyInput.value = '';
  reviewDashboard.hidden = true;
  accessPanel.hidden = false;
});

if (adminKey) unlock().catch(() => { accessPanel.hidden = false; reviewDashboard.hidden = true; });
