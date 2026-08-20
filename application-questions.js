const form = document.querySelector('#questionsForm');
const result = document.querySelector('#applicationResult');
const submitButton = document.querySelector('#submitApplication');
let candidate = null;
let job = null;
let profile = null;

function showResult(message, type) {
  result.textContent = message;
  result.hidden = false;
  result.className = `status-box ${type}`;
}

async function initialize() {
  candidate = await window.getVerifiedCandidate();
  const requestedJob = new URLSearchParams(window.location.search).get('job') || sessionStorage.getItem('sava-applying-job');
  if (!candidate) {
    window.location.replace(`./candidate-signup.html${requestedJob ? `?job=${encodeURIComponent(requestedJob)}` : ''}`);
    return;
  }

  await window.savaLoadJobs?.();
  const jobs = window.savaJobBoard?.() || [];
  job = jobs.find((item) => item.id === requestedJob) || jobs[0];
  if (!job) {
    showResult('This job is no longer available.', 'error');
    submitButton.disabled = true;
    return;
  }

  sessionStorage.setItem('sava-applying-job', job.id);

  document.querySelector('#applicationRole').textContent = job.title;
  document.querySelector('#applicationCompany').textContent = job.company;
  try {
    ({ profile } = await window.savaPlatform.candidateRequest('getProfile'));
  } catch (error) {
    showResult(error.message || 'Your candidate account could not be loaded.', 'error');
    submitButton.disabled = true;
    return;
  }

  if (!profile?.resumePath) {
    const destination = `./application-questions.html?job=${encodeURIComponent(job.id)}`;
    window.location.replace(`./candidate-resume.html?next=${encodeURIComponent(destination)}`);
    return;
  }

  document.querySelector('#authStatus').textContent = `Signed in as ${candidate.email}.`;
  document.querySelector('#authStatus').className = 'status-box success';
  document.querySelector('#applicationResumeName').textContent = profile.resumeFileName || 'Connected resume';
  const openResume = document.querySelector('#applicationOpenResume');
  openResume.hidden = !profile.resumeUrl;
  if (profile.resumeUrl) openResume.href = profile.resumeUrl;
  document.querySelector('#applicationResume').hidden = false;
  submitButton.disabled = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!candidate || !job || !profile?.resumePath || submitButton.disabled) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting resume…';
  try {
    await window.savaPlatform.candidateRequest('submitApplication', {
      jobId: job.id,
      fullName: profile.fullName || `${candidate.user_metadata?.first_name || ''} ${candidate.user_metadata?.last_name || ''}`.trim(),
      calendarLink: profile.calendarLink || candidate.user_metadata?.calendar_link || '',
    });
    sessionStorage.removeItem('sava-applying-job');
    form.hidden = true;
    document.querySelector('#authStatus').hidden = true;
    document.querySelector('#applicationComplete').hidden = false;
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit resume <span>→</span>';
    showResult(error.message || 'Your resume application could not be submitted.', 'error');
  }
});

initialize();
