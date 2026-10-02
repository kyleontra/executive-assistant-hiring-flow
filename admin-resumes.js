import { enableCandidateExport, lockCandidateExport, loadSavedCandidateSpreadsheet } from './admin-candidate-export.mjs';
const ADMIN_REVIEW_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/admin-review';
const ADMIN_SESSION_KEY = 'hirefromsa:review-admin-key';

const accessPanel = document.querySelector('#accessPanel');
const resumeDashboard = document.querySelector('#resumeDashboard');
const accessForm = document.querySelector('#accessForm');
const adminKeyInput = document.querySelector('#adminKey');
const accessError = document.querySelector('#accessError');
const searchForm = document.querySelector('#resumeSearchForm');
const queryInput = document.querySelector('#resumeQuery');
const statusInput = document.querySelector('#verificationStatus');
const resultsNode = document.querySelector('#resumeResults');
const emptyNode = document.querySelector('#resumeEmpty');
const resultCount = document.querySelector('#resultCount');
const detailNode = document.querySelector('#resumeDetail');
let adminKey = sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
let candidates = [];
let activeCandidateId = '';
let activeResumeUrl = '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formattedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Index date unavailable' : `Indexed ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date)}`;
}

function toast(message) {
  const target = document.querySelector('#resumeToast');
  target.textContent = message;
  target.classList.add('show');
  window.setTimeout(() => target.classList.remove('show'), 2800);
}

async function adminRequest(action, payload = {}) {
  const response = await fetch(ADMIN_REVIEW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(window.masterSessionToken?.() ? { Authorization: `Bearer ${window.masterSessionToken()}` } : {}) },
    body: JSON.stringify({ action, adminKey, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The private resume service could not complete that request.');
  return result;
}

function statusLabel(value) {
  return ({ draft: 'Draft', pending: 'Pending', verified: 'Verified', rejected: 'Rejected' })[value] || 'Draft';
}

function chips(values, limit = 4) {
  return (values || []).slice(0, limit).map((value) => `<span>${escapeHtml(value)}</span>`).join('');
}

function renderResults() {
  resultCount.textContent = `${candidates.length} resume${candidates.length === 1 ? '' : 's'}`;
  resultsNode.innerHTML = candidates.map((candidate) => {
    const roles = candidate.jobTitles?.length ? candidate.jobTitles : candidate.skills;
    const highlights = [...(roles || []), ...(candidate.software || [])].slice(0, 5);
    return `<button class="resume-result ${candidate.id === activeCandidateId ? 'active' : ''}" type="button" data-candidate-id="${escapeHtml(candidate.id)}">
      <span class="result-top"><span><strong>${escapeHtml(candidate.name)}</strong><small>${escapeHtml(candidate.email)}</small></span><em class="status ${escapeHtml(candidate.verificationStatus)}">${escapeHtml(statusLabel(candidate.verificationStatus))}</em></span>
      <span class="result-summary">${escapeHtml(candidate.resumeSummary || candidate.summary || 'Indexed candidate resume')}</span>
      <span class="result-chips">${chips(highlights)}</span>
      <span class="result-meta"><b>${Math.max(Number(candidate.resumeYearsExperience || 0), Number(candidate.relevantYears || 0)).toFixed(1)} yrs</b><small>${escapeHtml(formattedDate(candidate.resumeIndexedAt))}</small></span>
    </button>`;
  }).join('');
  emptyNode.hidden = candidates.length > 0;
  emptyNode.textContent = queryInput.value.trim() || statusInput.value
    ? 'No indexed resumes match this search.'
    : 'No candidate resumes yet. New resumes will appear here after candidates submit them.';
}

function detailGroup(title, values) {
  if (!values?.length) return '';
  return `<section class="detail-group"><h3>${escapeHtml(title)}</h3><div>${chips(values, 20)}</div></section>`;
}

function renderDetail(candidate) {
  if (activeResumeUrl) URL.revokeObjectURL(activeResumeUrl);
  activeResumeUrl = URL.createObjectURL(new Blob([candidate.resumeText || ''], { type: 'text/plain;charset=utf-8' }));
  const safeFileName = String(candidate.resumeFileName || 'redacted-resume.txt').replace(/[^a-z0-9._ -]/gi, '-');
  const download = `<a class="resume-download" href="${escapeHtml(activeResumeUrl)}" download="${escapeHtml(safeFileName)}">Download redacted resume</a>`;
  detailNode.innerHTML = `<header class="detail-header"><div><p class="eyebrow">INDEXED CANDIDATE</p><h2>${escapeHtml(candidate.name)}</h2><a href="mailto:${escapeHtml(candidate.email)}">${escapeHtml(candidate.email)}</a></div><span class="status ${escapeHtml(candidate.verificationStatus)}">${escapeHtml(statusLabel(candidate.verificationStatus))}</span></header>
    <div class="detail-metrics"><div><span>Resume experience</span><b>${Number(candidate.resumeYearsExperience || 0).toFixed(1)} years</b></div><div><span>Profile experience</span><b>${Number(candidate.relevantYears || 0).toFixed(1)} years</b></div><div><span>Search rank</span><b>${candidate.searchRank ? Number(candidate.searchRank).toFixed(3) : '—'}</b></div></div>
    <section class="detail-overview"><p>${escapeHtml(candidate.resumeSummary || candidate.summary || 'No summary extracted.')}</p><small>${escapeHtml(formattedDate(candidate.resumeIndexedAt))}</small></section>
    <div class="detail-groups">
      ${detailGroup('Job titles', candidate.jobTitles)}
      ${detailGroup('Software', candidate.software)}
      ${detailGroup('Skills', candidate.skills)}
      ${detailGroup('Industries', candidate.industries)}
      ${detailGroup('Companies', candidate.companies)}
      ${detailGroup('Education', candidate.education)}
      ${detailGroup('Certifications', candidate.certifications)}
      ${detailGroup('Languages', candidate.languages)}
    </div>
    <section class="resume-document"><header><div><h3>Redacted resume</h3><p>Contact details are removed before this file is indexed.</p></div>${download}</header><pre>${escapeHtml(candidate.resumeText || 'Resume preview unavailable.')}</pre></section>`;
}

async function loadCandidates() {
  resultsNode.innerHTML = '<p class="loading">Searching the private resume index…</p>';
  emptyNode.hidden = true;
  const { candidates: matches } = await adminRequest('searchResumes', { query: queryInput.value.trim(), verificationStatus: statusInput.value });
  candidates = matches || [];
  if (activeCandidateId && !candidates.some((candidate) => candidate.id === activeCandidateId)) {
    activeCandidateId = '';
    detailNode.innerHTML = '<div class="detail-placeholder"><span>DOC</span><h2>Select a candidate</h2><p>Click a search result to see their indexed experience and redacted resume.</p></div>';
  }
  renderResults();
}

async function openCandidate(candidateId) {
  activeCandidateId = candidateId;
  renderResults();
  detailNode.innerHTML = '<p class="loading">Opening the redacted resume…</p>';
  const { candidate } = await adminRequest('getResumeCandidate', { candidateId });
  renderDetail(candidate);
  if (window.matchMedia('(max-width: 900px)').matches) detailNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function unlock() {
  accessError.textContent = '';
  try {
    await loadCandidates();
    sessionStorage.setItem(ADMIN_SESSION_KEY, adminKey);
    accessPanel.hidden = true;
    resumeDashboard.hidden = false;
    await enableCandidateExport(adminRequest);
    if (location.hash === '#candidateExport') document.querySelector('#candidateExport').scrollIntoView({ block: 'start' });
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
  try { await unlock(); } catch { /* Error is shown next to the field. */ } finally { button.disabled = false; }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#searchResumes');
  button.disabled = true;
  try { await loadCandidates(); } catch (error) { toast(error.message); } finally { button.disabled = false; }
});

statusInput.addEventListener('change', () => loadCandidates().catch((error) => toast(error.message)));
resultsNode.addEventListener('click', (event) => {
  const button = event.target.closest('[data-candidate-id]');
  if (button) openCandidate(button.dataset.candidateId).catch((error) => { toast(error.message); renderResults(); });
});
document.querySelector('#refreshResumes').addEventListener('click', () => Promise.all([loadCandidates(), loadSavedCandidateSpreadsheet()]).catch((error) => toast(error.message)));
document.querySelector('#lockDashboard').addEventListener('click', async () => {
  if (window.masterSessionToken?.()) {
    try { await window.signOutAccount(); } catch (error) { toast(error.message); return; }
  }
  lockCandidateExport();
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  adminKey = '';
  adminKeyInput.value = '';
  resumeDashboard.hidden = true;
  accessPanel.hidden = false;
});

if (adminKey || window.masterSessionToken?.()) unlock().catch(() => { accessPanel.hidden = false; resumeDashboard.hidden = true; });
