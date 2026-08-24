const form = document.querySelector('#referralForm');
const authStatus = document.querySelector('#authStatus');
const otherField = document.querySelector('#otherField');
const otherInput = document.querySelector('#referralOther');
const result = document.querySelector('#referralResult');
const submitButton = document.querySelector('#continueReferral');
const pageParams = new URLSearchParams(window.location.search);
const previewMode = ['localhost', '127.0.0.1'].includes(window.location.hostname) && pageParams.get('preview') === '1';
let candidate = null;

function showResult(message, type) {
  result.textContent = message;
  result.className = `status-box ${type}`;
  result.hidden = false;
}

function updateOtherField() {
  const isOther = form.elements.referralSource.value === 'other';
  otherField.hidden = !isOther;
  otherInput.required = isOther;
  if (!isOther) otherInput.value = '';
}

function destination(payload) {
  if (!payload.bypassVerification) return './candidate-experience.html';
  const applyingJob = sessionStorage.getItem('sava-applying-job');
  const completedDestination = applyingJob
    ? `./application-questions.html?job=${encodeURIComponent(applyingJob)}`
    : './candidate-dashboard.html';
  return payload.resumeRequired
    ? `./candidate-resume.html?required=1&next=${encodeURIComponent(completedDestination)}`
    : completedDestination;
}

form.addEventListener('change', (event) => {
  if (event.target.name === 'referralSource') updateOtherField();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!candidate || !form.reportValidity() || submitButton.disabled) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Saving…';
  try {
    const payload = await window.savaPlatform.candidateRequest('submitReferral', {
      source: form.elements.referralSource.value,
      other: otherInput.value.trim(),
    });
    const confirmation = payload.bypassVerification && payload.resumeRequired
      ? 'Saved. Add your resume to finish setting up your account…'
      : payload.bypassVerification
        ? 'Saved. Opening your candidate account…'
        : 'Saved. Continuing to your candidate profile…';
    showResult(confirmation, 'success');
    window.setTimeout(() => window.location.assign(destination(payload)), 500);
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Continue <span>→</span>';
    showResult(error.message || 'Your answer could not be saved. Please try again.', 'error');
  }
});

async function initialize() {
  candidate = previewMode ? { email: 'verified.candidate@example.com' } : await window.getVerifiedCandidate();
  if (!candidate) {
    window.location.replace('./candidate-login.html?next=./referral.html');
    return;
  }
  authStatus.textContent = `Email confirmed for ${candidate.email}.`;
  authStatus.className = 'status-box success';
}

initialize();
