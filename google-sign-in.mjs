import { safeGoogleDestination } from './google-auth-policy.mjs';

document.querySelectorAll('[data-google-sign-in]').forEach(button => {
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const role = button.dataset.googleSignIn;
    const signup = button.dataset.googleSignup === 'true';
    const result = document.getElementById(button.dataset.result);
    button.disabled = true;
    if (result) result.hidden = true;
    try {
      if (!window.savaAuth) throw new Error('Sign-in could not load. Refresh this page and try again.');
      if (!await window.googleSignInAvailable()) throw new Error('Google sign-in is being configured. Please use email sign-in for now.');
      sessionStorage.setItem('sava-google-context', JSON.stringify({
        role, signup, startedAt: Date.now(),
        next: safeGoogleDestination(new URLSearchParams(location.search).get('next'), role, signup),
      }));
      const { error } = await window.savaAuth.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL('./google-callback.html', location.href).href, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw error;
    } catch (error) {
      sessionStorage.removeItem('sava-google-context');
      if (result) {
        result.textContent = /not enabled|unsupported provider/i.test(error.message || '')
          ? 'Google sign-in is being configured. Please use email sign-in for now.'
          : error.message || 'Could not connect to Google. Please try again.';
        result.className = 'portal-result error'; result.hidden = false;
      }
      button.disabled = false;
    }
  });
});
