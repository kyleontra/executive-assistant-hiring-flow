const reviewReference = new URLSearchParams(window.location.search).get('review');
const reviewNote = document.querySelector('#reviewNote');
const form = document.querySelector('#candidateForm');
const submitButton = document.querySelector('#submitProfile');
const formResult = document.querySelector('#formResult');
const REGISTER_ENDPOINT = 'https://lwzietvhuxgelwehpjag.supabase.co/functions/v1/register-candidate';

function showResult(message, type) {
  formResult.textContent = message;
  formResult.className = `form-result show ${type}`;
}

if (!/^SA-[A-Z0-9]{8}$/.test(reviewReference || '')) {
  reviewNote.textContent = 'This account setup link is missing its video review reference. Complete the ID video step first.';
  reviewNote.className = 'review-note show error';
  submitButton.disabled = true;
} else {
  reviewNote.textContent = `Video review ${reviewReference} is ready. Your details will be attached to it privately.`;
  reviewNote.className = 'review-note show';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || submitButton.disabled) return;
  const payload = {
    reviewReference,
    firstName: document.querySelector('#firstName').value.trim(),
    lastName: document.querySelector('#lastName').value.trim(),
    email: document.querySelector('#email').value.trim(),
    phone: document.querySelector('#phone').value.trim(),
    password: document.querySelector('#password').value,
  };
  submitButton.disabled = true;
  submitButton.innerHTML = 'Saving…';
  try {
    const response = await fetch(REGISTER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Your account details could not be saved.');
    showResult('Your account is created and linked to your video review. We’ll be in touch after review.', 'success');
    form.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    submitButton.innerHTML = 'Profile created ✓';
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Create candidate profile <span>→</span>';
    showResult(error.message || 'Your account details could not be saved. Please try again.', 'error');
  }
});
