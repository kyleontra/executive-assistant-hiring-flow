const postedJobsList = document.querySelector('#postedJobsList');
const postedJobsStatus = document.querySelector('#postedJobsStatus');
const postedJobSearch = document.querySelector('#postedJobSearch');
const postedJobStatus = document.querySelector('#postedJobStatus');

let postedJobs = [];
let applicantCounts = new Map();

function escapePostedJob(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function postedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently posted' : `Posted ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)}`;
}

function updatePostedJobSummary(applications) {
  document.querySelector('#totalJobs').textContent = String(postedJobs.length);
  document.querySelector('#activeJobs').textContent = String(postedJobs.filter((job) => job.status === 'active').length);
  document.querySelector('#totalApplicants').textContent = String(applications.length);
}

function renderPostedJobs() {
  const query = postedJobSearch.value.trim().toLowerCase();
  const status = postedJobStatus.value;
  const visibleJobs = postedJobs.filter((job) => {
    const matchesSearch = `${job.title || ''} ${job.company || ''}`.toLowerCase().includes(query);
    return matchesSearch && (status === 'all' || job.status === status);
  });

  postedJobsStatus.hidden = true;
  if (!visibleJobs.length) {
    postedJobsList.innerHTML = `<div class="posted-jobs-empty"><h2>${postedJobs.length ? 'No jobs match those filters' : 'No jobs posted yet'}</h2><p>${postedJobs.length ? 'Try another search or status.' : 'Publish your first role and it will appear here.'}</p>${postedJobs.length ? '' : '<a href="./index.html">Post your first job →</a>'}</div>`;
    return;
  }

  postedJobsList.innerHTML = visibleJobs.map((job) => {
    const applicantCount = applicantCounts.get(String(job.id)) || 0;
    return `<article class="posted-job-card"><div><div class="posted-job-title-row"><h2>${escapePostedJob(job.title)}</h2><span class="posted-job-status ${escapePostedJob(job.status)}">${escapePostedJob(job.status || 'draft')}</span></div><p class="posted-job-company">${escapePostedJob(job.company)} · ${escapePostedJob(postedDate(job.createdAt))}</p><div class="posted-job-meta"><span>${escapePostedJob(job.arrangement)}</span><span>${escapePostedJob(job.type)}</span><span>${escapePostedJob(job.location)}</span><span>${escapePostedJob(job.pay)}</span></div><div class="posted-job-count"><span>${applicantCount}</span> applicant${applicantCount === 1 ? '' : 's'}</div></div><div class="posted-job-actions"><a href="./job-detail.html?job=${encodeURIComponent(job.id)}">View listing</a><a class="primary" href="./applicants.html?job=${encodeURIComponent(job.id)}">View applicants →</a></div></article>`;
  }).join('');
}

async function loadPostedJobs() {
  try {
    if (!window.savaPlatform) throw new Error('The hiring service did not load.');
    const dashboard = await window.savaPlatform.employerRequest('employerDashboard');
    postedJobs = dashboard.jobs || [];
    applicantCounts = (dashboard.applications || []).reduce((counts, application) => {
      const jobId = String(application.jobId);
      counts.set(jobId, (counts.get(jobId) || 0) + 1);
      return counts;
    }, new Map());
    updatePostedJobSummary(dashboard.applications || []);
    renderPostedJobs();
  } catch (error) {
    ['totalJobs', 'activeJobs', 'totalApplicants'].forEach((id) => { document.querySelector(`#${id}`).textContent = '—'; });
    postedJobsStatus.textContent = error.message || 'Your posted jobs could not be loaded.';
    postedJobsStatus.classList.add('error');
  }
}

postedJobSearch.addEventListener('input', renderPostedJobs);
postedJobStatus.addEventListener('change', renderPostedJobs);
loadPostedJobs();
