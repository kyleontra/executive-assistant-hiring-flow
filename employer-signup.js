// Hirer sign-up: details -> server creates the hirer account -> 6-digit email code + password -> start hiring.
(() => {
  const ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/register-employer';
  // Localhost-only preview (?demo): walks through both steps without creating anything.
  const demo = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('demo');
  const signupForm = document.querySelector('#employerSignupForm');
  const verifyForm = document.querySelector('#employerVerifyForm');
  let email = '';
  // Where to go after sign-up. Same allowlist idea as employer login; contacting a VA returns to their profile.
  const requestedNext = new URLSearchParams(location.search).get('next') || '';
  const next = ['./talent.html', './index.html', './posted-jobs.html', './inbox.html', './candidate-public-profile.html'].some((path) => requestedNext === path || requestedNext.startsWith(`${path}?`)) ? requestedNext : './index.html';
  // New hirers start by posting a job.
  if (next !== './index.html') document.querySelector('#employerLoginLink').href = `./employer-login.html?next=${encodeURIComponent(next)}`;
  let contactName = '';
  try { contactName = JSON.parse(sessionStorage.getItem('sava-contact-return') || 'null')?.name || ''; } catch { contactName = ''; }
  const fromContact = next.startsWith('./candidate-public-profile.html') && contactName;
  if (fromContact) {
    document.querySelector('#signupTitle').textContent = `Create an account to message ${contactName}`;
    document.querySelector('#signupLead').textContent = 'It takes under a minute.';
  }

  function normalizeWebsite(value) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
      return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) ? url.origin + (url.pathname === '/' ? '' : url.pathname) : '';
    } catch { return ''; }
  }
  function showError(node, message) { node.textContent = message; node.hidden = !message; }
  function invalid(field, message) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    showError(document.querySelector('#signupError'), message);
    return false;
  }
  function validate() {
    signupForm.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
    const f = signupForm.elements;
    if (!f.firstName.value.trim()) return invalid(f.firstName, 'Enter your first name.');
    if (!f.lastName.value.trim()) return invalid(f.lastName, 'Enter your last name.');
    if (!f.companyName.value.trim()) return invalid(f.companyName, 'Enter your company name.');
    const value = f.email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return invalid(f.email, 'Enter a valid email address.');
    const digits = f.phone.value.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 14) return invalid(f.phone, 'Enter a valid phone number.');
    if (!normalizeWebsite(f.website.value.trim())) return invalid(f.website, 'Enter your business website, like yourcompany.com.');
    if (!f.companySize.value) return invalid(signupForm.querySelector('[name="companySize"]'), 'Choose your company size.');
    return true;
  }

  signupForm.addEventListener('input', event => { event.target.removeAttribute?.('aria-invalid'); });

  signupForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#signupButton');
    if (button.disabled || !validate()) return;
    const f = signupForm.elements;
    email = f.email.value.trim().toLowerCase();
    const payload = {
      firstName: f.firstName.value.trim(), lastName: f.lastName.value.trim(), companyName: f.companyName.value.trim(), email,
      phone: f.countryCode.value.split(' ')[0] + ' ' + f.phone.value.trim(),
      website: normalizeWebsite(f.website.value.trim()), companySize: f.companySize.value,
    };
    button.disabled = true; button.textContent = 'Creating your account…';
    showError(document.querySelector('#signupError'), '');
    try {
      if (!demo) {
        const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'We could not create your account. Please try again.');
        const { error } = await window.savaAuth.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) throw error;
      }
      document.querySelector('#verifyEmail').textContent = email;
      signupForm.hidden = true; verifyForm.hidden = false;
      verifyForm.elements.code.focus();
      window.scrollTo(0, 0);
    } catch (error) {
      showError(document.querySelector('#signupError'), error instanceof TypeError ? 'We could not reach the server. Check your connection and try again.' : error.message);
    } finally { button.disabled = false; button.innerHTML = 'Sign Up <span aria-hidden="true">→</span>'; }
  });

  verifyForm.elements.code.addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6); });
  verifyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#verifyButton');
    const errorNode = document.querySelector('#verifyError');
    const code = verifyForm.elements.code.value;
    const password = verifyForm.elements.password.value;
    if (code.length !== 6) { showError(errorNode, 'Enter the 6-digit code from your email.'); return; }
    if (password.length < 8) { showError(errorNode, 'Use at least 8 characters for your password.'); return; }
    button.disabled = true; button.textContent = 'Setting up your account…';
    showError(errorNode, '');
    try {
      if (demo) { button.textContent = 'Preview only: nothing was created ✓'; return; }
      const { error } = await window.savaAuth.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw new Error('That code is wrong or expired. Check your email or send a new code.');
      const { error: passwordError } = await window.savaAuth.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      window.location.assign(fromContact ? './index.html' : next);
    } catch (error) {
      showError(errorNode, error.message || 'Something went wrong. Please try again.');
      button.disabled = false; button.innerHTML = 'Start hiring <span aria-hidden="true">→</span>';
    }
  });
  document.querySelector('#resendCode').addEventListener('click', async event => {
    const link = event.currentTarget;
    link.disabled = true;
    try {
      if (!demo) { const { error } = await window.savaAuth.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }); if (error) throw error; }
      link.textContent = 'code sent ✓';
    } catch (error) { showError(document.querySelector('#verifyError'), error.message || 'Could not send a new code. Wait a minute and try again.'); }
    setTimeout(() => { link.disabled = false; link.textContent = 'send a new code'; }, 30000);
  });
  document.querySelector('#changeEmail').addEventListener('click', () => { verifyForm.hidden = true; signupForm.hidden = false; signupForm.elements.email.focus(); });
})();
