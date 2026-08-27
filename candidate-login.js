const loginForm = document.querySelector('#candidateLoginForm');
const loginButton = document.querySelector('#candidateLoginButton');
const loginResult = document.querySelector('#loginResult');

function loginDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('./') ? next : './candidate-dashboard.html';
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
  loginButton.textContent = 'Signing in…';
  loginResult.hidden = true;
  try {
    const { error } = await window.savaAuth.auth.signInWithPassword({
      email: document.querySelector('#loginEmail').value.trim().toLowerCase(),
      password: document.querySelector('#loginPassword').value,
    });
    if (error) throw error;
    window.location.assign(await resolvedDestination());
  } catch (error) {
    if (error.code === 'email_not_confirmed') {
      sessionStorage.setItem('sava-verification-email', document.querySelector('#loginEmail').value.trim().toLowerCase());
      window.location.assign('./check-email.html');
      return;
    }
    loginResult.textContent = error.message || 'Sign in failed. Check your email and password.';
    loginResult.className = 'portal-result error';
    loginResult.hidden = false;
    loginButton.disabled = false;
    loginButton.innerHTML = 'Sign in <span>→</span>';
  }
});

window.getVerifiedCandidate().then(async (user) => {
  if (user) window.location.replace(await resolvedDestination());
});
