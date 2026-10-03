const loginForm = document.querySelector('#candidateLoginForm');
const loginButton = document.querySelector('#candidateLoginButton');
const loginResult = document.querySelector('#loginResult');

function loginDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('./') ? next : './candidate-dashboard.html';
}

if (new URLSearchParams(window.location.search).get('reset') === 'success') {
  loginResult.textContent = 'Password reset successfully. Sign in with your new password.';
  loginResult.className = 'portal-result success';
  loginResult.hidden = false;
}

async function resolvedDestination() {
  try {
    const { profile } = await window.savaPlatform.candidateRequest('getProfile');
    if (!profile?.resumePath) {
      return `./candidate-resume.html?required=1&next=${encodeURIComponent(loginDestination())}`;
    }
  } catch { /* The destination page will show any account loading error. */ }
  return loginDestination();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!loginForm.reportValidity() || loginButton.disabled) return;
  loginButton.disabled = true;
  loginButton.textContent = 'Logging in…';
  loginResult.hidden = true;
  try {
    const { data, error } = await window.savaAuth.auth.signInWithPassword({
      email: document.querySelector('#loginEmail').value.trim().toLowerCase(),
      password: document.querySelector('#loginPassword').value,
    });
    if (error) throw error;
    if (data.user?.app_metadata?.account_role !== 'candidate') {
      await window.savaAuth.auth.signOut();
      throw new Error('That is a hirer account. Use Employer Login instead.');
    }
    window.location.assign(await resolvedDestination());
  } catch (error) {
    if (error.code === 'email_not_confirmed') {
      sessionStorage.setItem('sava-verification-email', document.querySelector('#loginEmail').value.trim().toLowerCase());
      window.location.assign('./check-email.html');
      return;
    }
    loginResult.textContent = /invalid login credentials/i.test(error.message || '') ? 'That email and password don\'t match. Try again or reset your password.' : error.message || 'Log in failed. Check your email and password.';
    loginResult.className = 'portal-result error';
    loginResult.hidden = false;
    loginButton.disabled = false;
    loginButton.innerHTML = 'Log in <span aria-hidden="true">→</span>';
  }
});

window.getVerifiedCandidate().then(async (user) => {
  if (user) window.location.replace(await resolvedDestination());
});

document.querySelector('[data-toggle-password]')?.addEventListener('click', (event) => {
  const input = document.querySelector('#loginPassword');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.currentTarget.textContent = show ? 'Hide' : 'Show';
  event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
