const postedJobsList = document.querySelector('#postedJobsList');
const postedJobsStatus = document.querySelector('#postedJobsStatus');
const postedJobSearch = document.querySelector('#postedJobSearch');
const postedJobStatus = document.querySelector('#postedJobStatus');

let postedJobs = [];
let postedJobApplications = [];
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

function countPostedJobApplications(applications) {
  return applications.reduce((counts, application) => {
    const jobId = String(application.jobId);
    counts.set(jobId, (counts.get(jobId) || 0) + 1);
    return counts;
  }, new Map());
}

function showPostedJobStatus(message, isError = false) {
  postedJobsStatus.textContent = message;
  postedJobsStatus.classList.toggle('error', isError);
  postedJobsStatus.hidden = false;
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
    return `<article class="posted-job-card"><div><div class="posted-job-title-row"><h2>${escapePostedJob(job.title)}</h2><span class="posted-job-status ${escapePostedJob(job.status)}">${escapePostedJob(job.status || 'draft')}</span></div><p class="posted-job-company">${escapePostedJob(job.company)} · ${escapePostedJob(postedDate(job.createdAt))}</p><div class="posted-job-meta"><span>${escapePostedJob(job.arrangement)}</span><span>${escapePostedJob(job.type)}</span><span>${escapePostedJob(job.location)}</span><span>${escapePostedJob(job.pay)}</span></div><div class="posted-job-count"><span>${applicantCount}</span> applicant${applicantCount === 1 ? '' : 's'}</div></div><div class="posted-job-actions"><a href="./job-detail.html?job=${encodeURIComponent(job.id)}">View listing</a><a class="primary" href="./applicants.html?job=${encodeURIComponent(job.id)}">View applicants →</a><button class="posted-job-delete" type="button" data-delete-job="${escapePostedJob(job.id)}">Delete</button></div></article>`;
  }).join('');
}

async function deletePostedJob(jobId, button) {
  const job = postedJobs.find((item) => String(item.id) === jobId);
  if (!job) return;
  const applicantCount = applicantCounts.get(jobId) || 0;
  const applicantWarning = applicantCount
    ? ` and ${applicantCount} applicant record${applicantCount === 1 ? '' : 's'}`
    : '';
  if (!window.confirm(`Delete “${job.title || 'this job'}”?\n\nThis permanently deletes the listing${applicantWarning}. This cannot be undone.`)) return;

  button.disabled = true;
  button.textContent = 'Deleting…';
  try {
    await window.savaPlatform.employerRequest('deleteJob', { jobId });
    postedJobs = postedJobs.filter((item) => String(item.id) !== jobId);
    postedJobApplications = postedJobApplications.filter((application) => String(application.jobId) !== jobId);
    applicantCounts = countPostedJobApplications(postedJobApplications);
    updatePostedJobSummary(postedJobApplications);
    renderPostedJobs();
    showPostedJobStatus(`“${job.title || 'Job'}” was deleted.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Delete';
    showPostedJobStatus(error.message || 'The job could not be deleted.', true);
  }
}

async function loadPostedJobs() {
  try {
    if (!window.savaPlatform) throw new Error('The hiring service did not load.');
    const dashboard = await window.savaPlatform.employerRequest('employerDashboard');
    postedJobs = dashboard.jobs || [];
    postedJobApplications = dashboard.applications || [];
    applicantCounts = countPostedJobApplications(postedJobApplications);
    updatePostedJobSummary(postedJobApplications);
    renderPostedJobs();
  } catch (error) {
    ['totalJobs', 'activeJobs', 'totalApplicants'].forEach((id) => { document.querySelector(`#${id}`).textContent = '—'; });
    postedJobsStatus.textContent = error.message || 'Your posted jobs could not be loaded.';
    postedJobsStatus.classList.add('error');
  }
}

postedJobSearch.addEventListener('input', renderPostedJobs);
postedJobStatus.addEventListener('change', renderPostedJobs);
postedJobsList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-job]');
  if (!button) return;
  deletePostedJob(String(button.dataset.deleteJob || ''), button);
});
loadPostedJobs();
