const form = document.querySelector('#candidateForm');
const submitButton = document.querySelector('#submitProfile');
const formResult = document.querySelector('#formResult');
const REGISTER_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/register-candidate';
const requestedJob = new URLSearchParams(window.location.search).get('job');
if (requestedJob) {
  sessionStorage.setItem('sava-applying-job', requestedJob);
  document.querySelector('.account-switch-link').href = `./candidate-login.html?next=${encodeURIComponent(`./application-questions.html?job=${encodeURIComponent(requestedJob)}`)}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || submitButton.disabled) return;
  const email = document.querySelector('#email').value.trim().toLowerCase();
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account…';
  formResult.hidden = true;
  try {
    // The existing registration endpoint supports account-only JSON requests.
    // Keep its email verification logic unchanged; resume upload is a later step.
    const response = await fetch(REGISTER_ENDPOINT, { signal: AbortSignal.timeout(120000),
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
    submitButton.innerHTML = 'Create account <span aria-hidden="true">→</span>';
    formResult.textContent = error instanceof TypeError ? 'We could not reach the account service. Check your connection and try again.' : (['TimeoutError', 'AbortError'].includes(error?.name) ? 'The request took too long. Check your connection and try again. Your saved progress is kept.' : error.message) || 'Your account could not be created. Please try again.';
    formResult.className = 'portal-result error';
    formResult.hidden = false;
  }
});

document.querySelector('[data-toggle-password]')?.addEventListener('click', (event) => {
  const input = document.querySelector('#password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.currentTarget.textContent = show ? 'Hide' : 'Show';
  event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
