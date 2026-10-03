// Posted jobs v2: every job the hirer posted, with applicants, pay, timeline and promotion at a glance.
const pjList = document.querySelector('#pjList');
const pjStatusLine = document.querySelector('#pjStatusLine');
const pjSearch = document.querySelector('#pjSearch');
const pjStatus = document.querySelector('#pjStatus');
const pjSort = document.querySelector('#pjSort');
const pjDemo = ['localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).has('demo');

let pjJobs = [];
let pjApplications = [];

function pjEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function pjPostedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently posted' : `Posted ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)}`;
}

function pjCounts(jobId) {
  const applications = pjApplications.filter((application) => String(application.jobId) === String(jobId));
  return { total: applications.length, fresh: applications.filter((application) => (application.status || 'new') === 'new').length };
}

function pjPromotion(job) {
  const budget = Number(job.promotionBudget);
  if (!job.promoted || !(budget > 0)) return '';
  const plan = budget === 5 ? 'Standard' : budget === 10 ? 'Premium' : 'Custom';
  return `${plan} · $${budget}/day`;
}

function pjShowStatus(message, isError = false) {
  pjStatusLine.textContent = message;
  pjStatusLine.classList.toggle('error', isError);
  pjStatusLine.hidden = false;
}

function pjRenderStats() {
  document.querySelector('#pjActive').textContent = String(pjJobs.filter((job) => job.status === 'active').length);
  document.querySelector('#pjApplicants').textContent = String(pjApplications.length);
  document.querySelector('#pjPromoted').textContent = String(pjJobs.filter((job) => pjPromotion(job)).length);
}

function pjRender() {
  const query = pjSearch.value.trim().toLowerCase();
  const status = pjStatus.value;
  const visible = pjJobs
    .filter((job) => `${job.title || ''} ${job.company || ''}`.toLowerCase().includes(query))
    .filter((job) => status === 'all' || job.status === status)
    .sort((a, b) => {
      if (pjSort.value === 'applicants') return pjCounts(b.id).total - pjCounts(a.id).total;
      if (pjSort.value === 'az') return String(a.title).localeCompare(String(b.title));
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  pjStatusLine.hidden = true;
  if (!visible.length) {
    pjList.innerHTML = pjJobs.length
      ? '<div class="pj-empty"><h2>No jobs match those filters</h2><p>Try another search or status.</p></div>'
      : '<div class="pj-empty"><h2>No jobs posted yet</h2><p>Post your first job and it will show up here.</p><a class="pj-primary" href="./index.html" data-new-job>+ Post a job</a></div>';
    return;
  }

  pjList.innerHTML = visible.map((job) => {
    const counts = pjCounts(job.id);
    const promotion = pjPromotion(job);
    const meta = [job.type, job.pay, job.hiringTimeline ? `Hiring: ${job.hiringTimeline}` : ''].filter(Boolean);
    return `<article class="pj-card">
      <div>
        <div class="pj-title-row"><h2>${pjEscape(job.title)}</h2><span class="pj-pill ${pjEscape(job.status)}">${pjEscape(job.status || 'draft')}</span>${promotion ? `<span class="pj-pill promo">${pjEscape(promotion)}</span>` : ''}</div>
        <p class="pj-posted">${pjEscape(pjPostedDate(job.createdAt))}</p>
        <div class="pj-meta">${meta.map((item) => `<span>${pjEscape(item)}</span>`).join('')}</div>
      </div>
      <div class="pj-side">
        <div class="pj-actions">
          <a class="pj-listing" href="./job-detail.html?job=${encodeURIComponent(job.id)}">View listing</a>
          <a class="primary" href="./inbox.html?job=${encodeURIComponent(job.id)}${pjDemo ? '&demo' : ''}">View applicants →</a>
        </div>
        <div class="pj-count"><strong>${counts.total}</strong><span>applicant${counts.total === 1 ? '' : 's'}</span>${counts.fresh ? `<span class="pj-new">${counts.fresh} new</span>` : ''}</div>
      </div>
    </article>`;
  }).join('');
}

function pjDemoData() {
  const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const jobs = [
    { id: 'demo-wedding', title: 'Wedding Video Editor', status: 'active', type: 'Contract', pay: '$8–$15 / hour', hiringTimeline: 'ASAP', promoted: true, promotionBudget: 10, createdAt: daysAgo(3) },
    { id: 'demo-social', title: 'Social Media Video Editor', status: 'active', type: 'Part-time', pay: '$600–$900 / month', hiringTimeline: 'Within 1-2 weeks', promoted: true, promotionBudget: 5, createdAt: daysAgo(6) },
    { id: 'demo-ea', title: 'Executive Assistant', status: 'closed', type: 'Full-time', pay: '$5–$8 / hour', hiringTimeline: 'Within the month', promoted: false, createdAt: daysAgo(24) },
    { id: 'demo-bookkeeper', title: 'Bookkeeper', status: 'closed', type: 'Part-time', pay: '$700–$1,000 / month', hiringTimeline: 'Not urgently', promoted: true, promotionBudget: 5, createdAt: daysAgo(41) },
    { id: 'demo-setter', title: 'Appointment Setter', status: 'closed', type: 'Full-time', pay: '$4–$6 / hour', hiringTimeline: 'ASAP', promoted: false, createdAt: daysAgo(58) },
  ];
  const statuses = ['new', 'new', 'new', 'shortlisted', 'new', 'new', 'new', 'interviewing', 'new', 'shortlisted'];
  const many = (jobId, count, status = 'interviewing') => Array.from({ length: count }, (_, index) => ({ id: `${jobId}-${index}`, jobId, status }));
  const applications = [
    ...statuses.map((status, index) => ({ id: `w${index}`, jobId: 'demo-wedding', status })),
    ...['new', 'new', 'shortlisted'].map((status, index) => ({ id: `s${index}`, jobId: 'demo-social', status })),
    ...many('demo-ea', 6),
    ...many('demo-bookkeeper', 14),
    ...many('demo-setter', 21),
  ];
  return { jobs, applications };
}

async function pjLoad() {
  try {
    let dashboard;
    if (pjDemo) dashboard = pjDemoData();
    else {
      if (!window.savaPlatform) throw new Error('The hiring service did not load.');
      dashboard = await window.savaPlatform.employerRequest('employerDashboard');
    }
    pjJobs = dashboard.jobs || [];
    pjApplications = dashboard.applications || [];
    pjRenderStats();
    pjRender();
  } catch (error) {
    ['pjActive', 'pjApplicants', 'pjPromoted'].forEach((id) => { document.querySelector(`#${id}`).textContent = '-'; });
    pjShowStatus(error.message || 'Your posted jobs could not be loaded.', true);
  }
}

pjSearch.addEventListener('input', pjRender);
pjStatus.addEventListener('change', pjRender);
pjSort.addEventListener('change', pjRender);
// "Post a job" always starts a fresh draft.
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-new-job]')) {
    try { localStorage.removeItem('ea-hiring-role'); } catch { /* storage unavailable */ }
  }
});
pjLoad();
