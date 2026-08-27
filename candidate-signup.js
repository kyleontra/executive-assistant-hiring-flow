const form = document.querySelector('#candidateForm');
const submitButton = document.querySelector('#submitProfile');
const formResult = document.querySelector('#formResult');
const REGISTER_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/register-candidate';
const requestedJob = new URLSearchParams(window.location.search).get('job');
if (requestedJob) {
  sessionStorage.setItem('sava-applying-job', requestedJob);
  document.querySelector('.account-switch a').href = `./candidate-login.html?next=${encodeURIComponent(`./application-questions.html?job=${encodeURIComponent(requestedJob)}`)}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || submitButton.disabled) return;
  const email = document.querySelector('#email').value.trim().toLowerCase();
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account…';
  formResult.className = 'form-result';
  try {
    // The existing registration endpoint supports account-only JSON requests.
    // Keep its email verification logic unchanged; resume upload is a later step.
    const response = await fetch(REGISTER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: document.querySelector('#firstName').value.trim(),
        lastName: document.querySelector('#lastName').value.trim(),
        email,
        password: document.querySelector('#password').value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Your account could not be created.');
    sessionStorage.setItem('sava-verification-email', email);
    window.location.assign('./check-email.html');
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Create account <span>→</span>';
    formResult.textContent = error instanceof TypeError ? 'We could not reach the account service. Check your connection and try again.' : error.message || 'Your account could not be created. Please try again.';
    formResult.className = 'form-result show error';
  }
});
