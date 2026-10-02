const employerLoginForm = document.querySelector('#employerLoginForm');
const employerLoginButton = document.querySelector('#employerLoginButton');
const employerLoginResult = document.querySelector('#employerLoginResult');
const employerAccountNotice = document.querySelector('#employerAccountNotice');

function employerDestination() {
  const next = new URLSearchParams(window.location.search).get('next') || '';
  const allowed = ['./index.html', './talent.html', './applicants.html', './posted-jobs.html', './scheduler-settings.html', './admin-review.html', './admin-resumes.html', './candidate-public-profile.html'];
  return allowed.some((path) => next === path || next.startsWith(`${path}?`)) ? next : './talent.html';
}

if (new URLSearchParams(window.location.search).get('reset') === 'success') {
  employerLoginResult.textContent = 'Password reset successfully. Sign in with your new password.';
  employerLoginResult.className = 'portal-result success';
  employerLoginResult.hidden = false;
}

employerLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!employerLoginForm.reportValidity() || employerLoginButton.disabled) return;
  employerLoginButton.disabled = true;
  employerLoginButton.textContent = 'Signing in…';
  employerLoginResult.hidden = true;
  try {
    const identity = document.querySelector('#employerLoginEmail').value.trim().toLowerCase();
    if (!identity.includes('@')) {
      await window.signInMaster(identity, document.querySelector('#employerLoginPassword').value);
      window.location.assign(employerDestination());
      return;
    }
    const { data, error } = await window.savaAuth.auth.signInWithPassword({
      email: document.querySelector('#employerLoginEmail').value.trim().toLowerCase(),
      password: document.querySelector('#employerLoginPassword').value,
    });
    if (error) throw error;
    if (data.user?.app_metadata?.account_role !== 'employer') {
      await window.savaAuth.auth.signOut();
      throw new Error('That is a candidate account. Use Candidate Sign In, or sign in with an employer account.');
    }
    window.location.assign(employerDestination());
  } catch (error) {
    if (error.code === 'email_not_confirmed') {
      const email = document.querySelector('#employerLoginEmail').value.trim().toLowerCase();
      sessionStorage.setItem('sava-verification-email', email);
      sessionStorage.setItem('sava-account-role', 'employer');
      sessionStorage.setItem('sava-employer-next', employerDestination());
      window.location.assign(`./email-confirmed.html?account=employer&email=${encodeURIComponent(email)}`);
      return;
    }
    employerLoginResult.textContent = error.message || 'Sign in failed. Check your email and password.';
    employerLoginResult.className = 'portal-result error';
    employerLoginResult.hidden = false;
    employerLoginButton.disabled = false;
    employerLoginButton.innerHTML = 'Sign in <span>→</span>';
  }
});

window.getVerifiedUser().then((user) => {
  if (!user) return;
  if (user.app_metadata?.account_role === 'employer') {
    window.location.replace(employerDestination());
    return;
  }
  employerAccountNotice.textContent = 'A candidate account is currently signed in. Sign in below with an employer account to continue.';
  employerAccountNotice.hidden = false;
});
