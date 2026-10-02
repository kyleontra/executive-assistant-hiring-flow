const requestForm = document.querySelector('#requestResetForm');
const completeForm = document.querySelector('#completeResetForm');
const emailInput = document.querySelector('#resetEmail');
const emailSummary = document.querySelector('#resetEmailSummary');
const codeInput = document.querySelector('#resetCode');
const newPasswordInput = document.querySelector('#newPassword');
const confirmPasswordInput = document.querySelector('#confirmPassword');
const requestButton = document.querySelector('#requestResetButton');
const completeButton = document.querySelector('#completeResetButton');
const resendButton = document.querySelector('#resendResetCode');
const changeEmailButton = document.querySelector('#changeResetEmail');
const requestResult = document.querySelector('#requestResetResult');
const completeResult = document.querySelector('#completeResetResult');

const requestedAccount = new URLSearchParams(window.location.search).get('account') === 'employer' ? 'employer' : 'candidate';
const loginPage = requestedAccount === 'employer' ? './employer-login.html' : './candidate-login.html';
const storedEmail = sessionStorage.getItem('sava-password-reset-email') || '';

document.querySelector('#backToSignIn').href = loginPage;
emailInput.value = storedEmail;

function showResult(node, message, type) {
  node.textContent = message;
  node.className = `portal-result ${type}`;
  node.hidden = false;
}

function showCodeStep(email) {
  emailInput.value = email;
  emailSummary.textContent = email;
  requestForm.hidden = true;
  completeForm.hidden = false;
  completeResult.hidden = true;
  codeInput.focus();
}

async function requestResetCode(email) {
  const { error } = await window.savaAuth.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  sessionStorage.setItem('sava-password-reset-email', email);
}

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
});

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!requestForm.reportValidity() || requestButton.disabled) return;
  const email = emailInput.value.trim().toLowerCase();
  requestButton.disabled = true;
  requestButton.textContent = 'Sending…';
  requestResult.hidden = true;
  try {
    await requestResetCode(email);
    showCodeStep(email);
  } catch (error) {
    showResult(requestResult, error.message || 'We could not send a reset code. Please try again shortly.', 'error');
  } finally {
    requestButton.disabled = false;
    requestButton.innerHTML = 'Send reset code <span>→</span>';
  }
});

completeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!completeForm.reportValidity() || completeButton.disabled) return;
  if (newPasswordInput.value !== confirmPasswordInput.value) {
    showResult(completeResult, 'The two passwords do not match.', 'error');
    confirmPasswordInput.focus();
    return;
  }

  completeButton.disabled = true;
  completeButton.textContent = 'Resetting…';
  completeResult.hidden = true;
  try {
    const email = emailInput.value.trim().toLowerCase();
    const { data, error: verifyError } = await window.savaAuth.auth.verifyOtp({
      email,
      token: codeInput.value,
      type: 'email',
    });
    if (verifyError) throw verifyError;
    if (!data.session) throw new Error('That reset code could not establish a secure recovery session.');

    const { error: updateError } = await window.savaAuth.auth.updateUser({ password: newPasswordInput.value });
    if (updateError) throw updateError;
    const accountRole = data.user?.app_metadata?.account_role === 'employer' ? 'employer' : 'candidate';
    sessionStorage.removeItem('sava-password-reset-email');
    await window.savaAuth.auth.signOut();
    showResult(completeResult, 'Password reset. Returning to sign in…', 'success');
    window.location.assign(accountRole === 'employer' ? './employer-login.html?reset=success' : './candidate-login.html?reset=success');
  } catch (error) {
    showResult(completeResult, error.message || 'That code could not be verified. Request a new code and try again.', 'error');
    completeButton.disabled = false;
    completeButton.innerHTML = 'Reset password <span>→</span>';
  }
});

resendButton.addEventListener('click', async () => {
  if (resendButton.disabled) return;
  resendButton.disabled = true;
  resendButton.textContent = 'Sending…';
  completeResult.hidden = true;
  try {
    await requestResetCode(emailInput.value.trim().toLowerCase());
    showResult(completeResult, 'A fresh six-digit reset code is on its way.', 'success');
  } catch (error) {
    showResult(completeResult, error.message || 'We could not send a new code. Please try again shortly.', 'error');
  } finally {
    resendButton.disabled = false;
    resendButton.textContent = 'Send a new code';
  }
});

changeEmailButton.addEventListener('click', () => {
  sessionStorage.removeItem('sava-password-reset-email');
  completeForm.hidden = true;
  requestForm.hidden = false;
  emailInput.focus();
});

if (storedEmail) showCodeStep(storedEmail);
