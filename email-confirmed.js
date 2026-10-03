const form = document.querySelector('#verificationForm');
const emailInput = document.querySelector('#verificationEmail');
const codeInput = document.querySelector('#verificationCode');
const result = document.querySelector('#confirmationResult');
const verifyButton = document.querySelector('#verifyCode');
const resendButton = document.querySelector('#resendCode');

emailInput.value = new URLSearchParams(window.location.search).get('email') || sessionStorage.getItem('sava-verification-email') || '';
// check-email.html never asks for the email again: it comes from sign-up or VA Login.
// Without it, VA Login signs them in and sends unconfirmed accounts straight back here.
const sentTo = document.body.dataset?.page === 'check-email' && document.querySelector('#sentTo');
if (sentTo) {
  // Local preview only: ?demo shows the screen without a real sign-up.
  if (!emailInput.value && window.location.hostname === 'localhost' && new URLSearchParams(window.location.search).has('demo')) emailInput.value = 'thandi.jacobs@example.com';
  if (emailInput.value) {
    document.querySelector('#sentToEmail').textContent = emailInput.value;
    sentTo.hidden = false;
  } else {
    window.location.replace('./candidate-login.html');
  }
}
const resultBase = (result.className || '').includes('portal-result') ? 'portal-result' : 'form-result show';
const requestedAccount = new URLSearchParams(window.location.search).get('account') || sessionStorage.getItem('sava-account-role') || 'candidate';

function verifiedDestination(user) {
  if (user?.app_metadata?.account_role === 'employer' || requestedAccount === 'employer') {
    return sessionStorage.getItem('sava-employer-next') || './talent.html';
  }
  return './candidate-resume.html';
}

if (requestedAccount === 'employer' && document.querySelector('#verificationIntro')) {
  document.querySelector('#verificationIntro').textContent = 'One quick confirmation, then you can search candidates and start hiring.';
  document.querySelector('#verificationSteps').innerHTML = '<span>✓</span><b>Account created</b><span>2</span><b>Confirm email</b><span>3</span><b>Search talent</b>';
}

function showResult(message, type) {
  result.textContent = message;
  result.className = `${resultBase} ${type}`;
  result.hidden = false;
}

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || verifyButton.disabled) return;
  const email = emailInput.value.trim().toLowerCase();
  const token = codeInput.value.trim();
  verifyButton.disabled = true;
  verifyButton.textContent = 'Verifying…';
  try {
    const { error } = await window.savaAuth.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    sessionStorage.removeItem('sava-verification-email');
    showResult(requestedAccount === 'employer' ? 'Email verified. Opening your hirer workspace…' : 'Email verified. Add your resume to finish setting up your account…', 'success');
    sessionStorage.removeItem('sava-account-role');
    window.location.assign(requestedAccount === 'employer' ? (sessionStorage.getItem('sava-employer-next') || './talent.html') : './candidate-resume.html');
  } catch (error) {
    showResult(/expired|invalid/i.test(error.message || '') ? 'That code is wrong or has expired. Check your latest email, or tap Resend code for a new one.' : error.message || 'That code could not be verified. Request a new code and try again.', 'error');
    verifyButton.disabled = false;
    verifyButton.innerHTML = 'Verify email <span>→</span>';
  }
});

// Confirmation links establish the session through the existing auth client.
const getVerifiedAccount = window.getVerifiedUser || window.getVerifiedCandidate;
getVerifiedAccount().then((user) => {
  if (user) window.location.replace(verifiedDestination(user));
});

resendButton.addEventListener('click', async () => {
  if (!emailInput.reportValidity() || resendButton.disabled) return;
  resendButton.disabled = true;
  resendButton.textContent = 'Sending…';
  try {
    const { error } = await window.savaAuth.auth.resend({
      type: 'signup',
      email: emailInput.value.trim().toLowerCase(),
    });
    if (error) throw error;
    showResult('A fresh six-digit code is on its way. Check your inbox, Spam, and Promotions.', 'success');
  } catch (error) {
    showResult(error.message || 'We could not send a new code. Please try again shortly.', 'error');
  } finally {
    resendButton.disabled = false;
    resendButton.textContent = 'Resend code';
  }
});
