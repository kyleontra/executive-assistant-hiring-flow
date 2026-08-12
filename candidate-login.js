const loginForm = document.querySelector('#candidateLoginForm');
const loginButton = document.querySelector('#candidateLoginButton');
const loginResult = document.querySelector('#loginResult');

function loginDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('./') ? next : './candidate-dashboard.html';
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
    window.location.assign(loginDestination());
  } catch (error) {
    loginResult.textContent = error.message || 'Sign in failed. Check your email and password.';
    loginResult.className = 'portal-result error';
    loginResult.hidden = false;
    loginButton.disabled = false;
    loginButton.innerHTML = 'Sign in <span>→</span>';
  }
});

window.getVerifiedCandidate().then((user) => {
  if (user) window.location.replace(loginDestination());
});
