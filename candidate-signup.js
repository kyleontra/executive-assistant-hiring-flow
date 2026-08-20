const form = document.querySelector('#candidateForm');
const submitButton = document.querySelector('#submitProfile');
const formResult = document.querySelector('#formResult');
const confirmedEmail = document.querySelector('#confirmedEmail');
const resumeInput = document.querySelector('#resumeInput');
const resumePickerTitle = document.querySelector('#resumePickerTitle');
const resumePickerDetail = document.querySelector('#resumePickerDetail');
const REGISTER_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/register-candidate';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const RESUME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const RESUME_EXTENSION = /\.(?:pdf|doc|docx)$/i;

const requestedJob = new URLSearchParams(window.location.search).get('job');
if (requestedJob) {
  sessionStorage.setItem('sava-applying-job', requestedJob);
  const signInLink = document.querySelector('.account-switch a');
  if (signInLink) signInLink.href = `./candidate-login.html?next=${encodeURIComponent(`./application-questions.html?job=${requestedJob}`)}`;
}

function showResult(message, type) {
  formResult.textContent = message;
  formResult.className = `form-result show ${type}`;
}

function validResume(file) {
  const type = file?.type?.split(';')[0].toLowerCase() || '';
  const acceptableType = RESUME_TYPES.has(type) || ((!type || type === 'application/octet-stream') && RESUME_EXTENSION.test(file?.name || ''));
  return Boolean(file && acceptableType && file.size > 0 && file.size <= MAX_RESUME_BYTES);
}

resumeInput.addEventListener('change', () => {
  const file = resumeInput.files?.[0];
  if (!validResume(file)) {
    resumeInput.value = '';
    resumePickerTitle.textContent = 'Upload your resume';
    resumePickerDetail.textContent = 'PDF, DOC, or DOCX · maximum 10 MB';
    if (file) showResult('Choose a PDF, DOC, or DOCX resume no larger than 10 MB.', 'error');
    return;
  }
  resumePickerTitle.textContent = file.name;
  resumePickerDetail.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · ready to upload`;
  formResult.className = 'form-result';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || submitButton.disabled) return;
  const resume = resumeInput.files?.[0];
  if (!validResume(resume)) {
    showResult('Choose a PDF, DOC, or DOCX resume no larger than 10 MB.', 'error');
    resumeInput.focus();
    return;
  }
  const email = document.querySelector('#email').value.trim();
  const payload = new FormData();
  payload.append('firstName', document.querySelector('#firstName').value.trim());
  payload.append('lastName', document.querySelector('#lastName').value.trim());
  payload.append('email', email);
  payload.append('calendarLink', document.querySelector('#calendarLink').value.trim());
  payload.append('password', document.querySelector('#password').value);
  payload.append('resume', resume);
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account and uploading resume…';
  try {
    const response = await fetch(REGISTER_ENDPOINT, { method: 'POST', body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Your account could not be created.');
    showResult('Account and resume saved. Check your inbox for a six-digit verification code from Hire From SA. Check Spam or Promotions if it is not in your inbox.', 'success');
    form.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    submitButton.textContent = 'Account created ✓';
    confirmedEmail.href = `./email-confirmed.html?email=${encodeURIComponent(email)}`;
    confirmedEmail.hidden = false;
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Create account with resume <span>→</span>';
    showResult(error.message || 'Your account could not be created. Please try again.', 'error');
  }
});
