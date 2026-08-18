const form = document.querySelector('#verificationForm');
const emailInput = document.querySelector('#verificationEmail');
const codeInput = document.querySelector('#verificationCode');
const result = document.querySelector('#confirmationResult');
const verifyButton = document.querySelector('#verifyCode');
const resendButton = document.querySelector('#resendCode');

emailInput.value = new URLSearchParams(window.location.search).get('email') || '';

function showResult(message, type) {
  result.textContent = message;
  result.className = `form-result show ${type}`;
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
    showResult('Email verified. Continuing to your candidate profile…', 'success');
    window.setTimeout(() => { window.location.assign('./candidate-resume.html'); }, 650);
  } catch (error) {
    showResult(error.message || 'That code could not be verified. Request a new code and try again.', 'error');
    verifyButton.disabled = false;
    verifyButton.innerHTML = 'Verify email <span>→</span>';
  }
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
