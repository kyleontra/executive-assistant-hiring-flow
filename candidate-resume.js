const RESUME_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-resume';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const RESUME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text',
]);
const RESUME_EXTENSION = /\.(?:pdf|doc|docx|txt|rtf|odt)$/i;
const input = document.querySelector('#resumeInput');
const form = document.querySelector('#resumeForm');
const saveButton = document.querySelector('#saveResume');
const result = document.querySelector('#resumeResult');
const authStatus = document.querySelector('#authStatus');
const pickerTitle = document.querySelector('#resumePickerTitle');
const pickerDetail = document.querySelector('#resumePickerDetail');
const savedResume = document.querySelector('#savedResume');
const savedResumeName = document.querySelector('#savedResumeName');
const openResume = document.querySelector('#openResume');
const params = new URLSearchParams(window.location.search);
const demoMode = ['localhost', '127.0.0.1'].includes(window.location.hostname) && params.get('demo') === '1';
let candidate = null;
let profile = null;
let selectedResume = null;

function nextDestination() {
  const requested = params.get('next');
  if (/^\.\/(?:candidate-dashboard|application-questions|candidate-next-steps|candidate-profile|id-verification|jobs)\.html(?:\?|$)/.test(requested || '')) return requested;
  return `./candidate-dashboard.html${demoMode ? '?demo=1' : ''}`;
}

function showResult(message, type) {
  if (type === 'error' && /sign.in|expired/i.test(message)) document.querySelector('#signInAgain').hidden = false;
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
    document.querySelector('#signInAgain').hidden = false;
    window.location.replace(`./candidate-login.html?next=${encodeURIComponent('./candidate-resume.html')}`);
    return;
  }
  authStatus.textContent = demoMode ? 'Demo mode — your resume stays in this browser and is never uploaded.' : `Email confirmed for ${candidate.email}.`;
  authStatus.className = 'status-box success';
  if (demoMode) return;
  try {
    ({ profile } = await window.savaPlatform.candidateRequest('getProfile'));
    renderExisting();
  } catch (error) { accountLoadFailed(error); }
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (!validResume(file)) {
    selectedResume = null;
    input.value = '';
    showResult('Choose a PDF, DOC, DOCX, TXT, RTF, or ODT resume no larger than 10 MB.', 'error');
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
  input.disabled = true;
  saveButton.textContent = 'Connecting resume…';
  try {
    if (!demoMode) {
      const token = await window.getAccessToken();
      if (!token) throw new Error('Your sign-in expired. Verify your email again, then retry.');
      const data = new FormData();
      data.append('resume', selectedResume, selectedResume.name);
      const response = await fetch(RESUME_ENDPOINT, { signal: AbortSignal.timeout(120000), method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: data });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Your resume could not be saved.');
    }
    showResult(demoMode ? 'Demo resume connected locally. Continuing…' : 'Resume connected to your account. Continuing…', 'success');
    window.setTimeout(() => window.location.assign(nextDestination()), 500);
  } catch (error) {
    input.disabled = false;
    saveButton.disabled = false;
    saveButton.innerHTML = 'Connect resume and continue <span>→</span>';
    showResult(error instanceof TypeError ? 'The resume service could not be reached. Check your connection and try again.' : (['TimeoutError', 'AbortError'].includes(error?.name) ? 'The request took too long. Check your connection and try again. Your saved progress is kept.' : error.message) || 'Your resume could not be saved.', 'error');
  }
});

initialize().catch(accountLoadFailed);

function accountLoadFailed(error) {
  const status = document.querySelector('#authStatus');
  status.textContent = error.message || 'Your account could not be checked. Retry to continue.';
  status.className = 'status-box error';
  if (/sign.in|expired/i.test(error.message || '')) document.querySelector('#signInAgain').hidden = false;
  document.querySelector('#retryAccount').hidden = false;
}
document.querySelector('#retryAccount').onclick = async () => {
  const retry = document.querySelector('#retryAccount');
  retry.disabled = true;
  retry.hidden = true;
  try { await initialize(); } catch (error) { accountLoadFailed(error); }
  finally { retry.disabled = false; }
};
