const form = document.querySelector('#candidateForm');
const submitButton = document.querySelector('#submitProfile');
const formResult = document.querySelector('#formResult');
const confirmedEmail = document.querySelector('#confirmedEmail');
const REGISTER_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/register-candidate';

function showResult(message, type) {
  formResult.textContent = message;
  formResult.className = `form-result show ${type}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || submitButton.disabled) return;
  const payload = {
    firstName: document.querySelector('#firstName').value.trim(),
    lastName: document.querySelector('#lastName').value.trim(),
    email: document.querySelector('#email').value.trim(),
    password: document.querySelector('#password').value,
  };
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account…';
  try {
    const response = await fetch(REGISTER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Your account could not be created.');
    showResult('Account created. Look for an email from Supabase (noreply@mail.app.supabase.io) with the subject “Confirm your email address.” Open it and select “Confirm your email address.” Check Spam or Promotions if it is not in your inbox.', 'success');
    form.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    submitButton.textContent = 'Account created ✓';
    confirmedEmail.hidden = false;
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Create account <span>→</span>';
    showResult(error.message || 'Your account could not be created. Please try again.', 'error');
  }
});
