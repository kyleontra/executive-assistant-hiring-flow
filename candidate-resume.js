const RESUME_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-resume';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const RESUME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const RESUME_EXTENSION = /\.(?:pdf|doc|docx)$/i;
const input = document.querySelector('#resumeInput');
const form = document.querySelector('#resumeForm');
const saveButton = document.querySelector('#saveResume');
const skipButton = document.querySelector('#skipResume');
const result = document.querySelector('#resumeResult');
const authStatus = document.querySelector('#authStatus');
const pickerTitle = document.querySelector('#resumePickerTitle');
const pickerDetail = document.querySelector('#resumePickerDetail');
const savedResume = document.querySelector('#savedResume');
const savedResumeName = document.querySelector('#savedResumeName');
const openResume = document.querySelector('#openResume');
const params = new URLSearchParams(window.location.search);
const demoMode = params.get('demo') === '1';
let candidate = null;
let profile = null;
let selectedResume = null;

function nextDestination() {
  const requested = params.get('next');
  if (requested?.startsWith('./')) return requested;
  return `./candidate-experience.html${demoMode ? '?demo=1' : ''}`;
}

function showResult(message, type) {
  result.textContent = message;
  result.hidden = false;
  result.className = `status-box ${type}`;
}

function validResume(file) {
  const type = file?.type?.split(';')[0].toLowerCase() || '';
  const acceptableType = RESUME_TYPES.has(type) || ((!type || type === 'application/octet-stream') && RESUME_EXTENSION.test(file?.name || ''));
  return file && acceptableType && file.size > 0 && file.size <= MAX_RESUME_BYTES;
}

function renderExisting() {
  if (!profile?.resumePath) return;
  savedResume.hidden = false;
  savedResumeName.textContent = profile.resumeFileName || 'Connected resume';
  openResume.hidden = !profile.resumeUrl;
  if (profile.resumeUrl) openResume.href = profile.resumeUrl;
  saveButton.disabled = false;
  saveButton.innerHTML = 'Continue with saved resume <span>→</span>';
}

async function initialize() {
  candidate = demoMode
    ? { id: 'demo-candidate', email: 'demo@hirefromsa.com', user_metadata: { first_name: 'Demo', last_name: 'Candidate' } }
    : await window.getVerifiedCandidate();
  if (!candidate) {
    authStatus.textContent = 'Your verified session is missing or has expired. Verify your email again to continue.';
    authStatus.className = 'status-box error';
    input.disabled = true;
    skipButton.disabled = true;
    return;
  }
  authStatus.textContent = demoMode ? 'Demo mode — your resume stays in this browser and is never uploaded.' : `Email confirmed for ${candidate.email}.`;
  authStatus.className = 'status-box success';
  if (demoMode) return;
  try {
    ({ profile } = await window.savaPlatform.candidateRequest('getProfile'));
    renderExisting();
  } catch {
    profile = null;
  }
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (!validResume(file)) {
    selectedResume = null;
    input.value = '';
    showResult('Choose a PDF, DOC, or DOCX resume no larger than 10 MB.', 'error');
    saveButton.disabled = !profile?.resumePath;
    return;
  }
  selectedResume = file;
  pickerTitle.textContent = file.name;
  pickerDetail.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · ready to connect`;
  saveButton.disabled = false;
  saveButton.innerHTML = `${profile?.resumePath ? 'Replace resume' : 'Connect resume'} and continue <span>→</span>`;
  result.hidden = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!candidate || saveButton.disabled || (!selectedResume && !profile?.resumePath)) return;
  if (!selectedResume) {
    window.location.assign(nextDestination());
    return;
  }
  saveButton.disabled = true;
  skipButton.disabled = true;
  saveButton.textContent = 'Connecting resume…';
  try {
    let resumePath = `demo-candidate/resume.${selectedResume.name.split('.').pop()?.toLowerCase() || 'pdf'}`;
    let resumeFileName = selectedResume.name;
    if (!demoMode) {
      const experience = profile?.experience || [];
      await window.savaPlatform.candidateRequest('saveProfile', {
        experience,
        resumePath: profile?.resumePath || '',
        resumeFileName: profile?.resumeFileName || '',
        fullName: `${candidate.user_metadata?.first_name || ''} ${candidate.user_metadata?.last_name || ''}`.trim(),
        calendarLink: candidate.user_metadata?.calendar_link || '',
      });
      const token = await window.getAccessToken();
      if (!token) throw new Error('Your sign-in expired. Verify your email again, then retry.');
      const data = new FormData();
      data.append('resume', selectedResume, selectedResume.name);
      const response = await fetch(RESUME_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: data });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Your resume could not be saved.');
      resumePath = payload.path;
      resumeFileName = payload.fileName;
      await window.savaPlatform.candidateRequest('saveProfile', {
        experience,
        resumePath,
        resumeFileName,
        fullName: `${candidate.user_metadata?.first_name || ''} ${candidate.user_metadata?.last_name || ''}`.trim(),
        calendarLink: candidate.user_metadata?.calendar_link || '',
      });
    }
    sessionStorage.setItem(`sava:resume-path:${candidate.id}`, resumePath);
    sessionStorage.setItem(`sava:resume-name:${candidate.id}`, resumeFileName);
    showResult(demoMode ? 'Demo resume connected locally. Continuing…' : 'Resume connected to your account. Continuing…', 'success');
    window.setTimeout(() => window.location.assign(nextDestination()), 500);
  } catch (error) {
    saveButton.disabled = false;
    skipButton.disabled = false;
    saveButton.innerHTML = 'Connect resume and continue <span>→</span>';
    showResult(error instanceof TypeError ? 'The resume service could not be reached. Check your connection and try again.' : error.message || 'Your resume could not be saved.', 'error');
  }
});

skipButton.addEventListener('click', () => window.location.assign(nextDestination()));

initialize();
