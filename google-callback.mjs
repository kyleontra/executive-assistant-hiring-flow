import { safeGoogleDestination, validGoogleContext } from './google-auth-policy.mjs';

const ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/google-account';
const status = document.querySelector('#callbackStatus');
const errorNode = document.querySelector('#callbackError');
const employerForm = document.querySelector('#googleEmployerForm');
const retry = document.querySelector('#retryGoogleCallback');
const back = document.querySelector('#backToLogin');
let context;
try { context = JSON.parse(sessionStorage.getItem('sava-google-context') || 'null'); } catch { context = null; }
const params = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
const providerError = params.get('error_description') || fragment.get('error_description');
let busy = false;

function showError(error) {
  document.querySelector('#callbackTitle').textContent = 'Let’s finish signing you in';
  status.textContent = 'Your account information has been preserved.';
  errorNode.textContent = error.message || 'Could not finish sign-in. Please try again.';
  errorNode.hidden = false; back.hidden = false;
  retry.hidden = Boolean(providerError) || !validGoogleContext(context);
}

async function finish(company) {
  if (busy) return;
  busy = true; retry.disabled = true;
  const submit = employerForm.querySelector('button'); submit.disabled = true;
  errorNode.hidden = true;
  try {
    if (providerError) throw new Error('Google sign-in was cancelled or declined. Return to sign in and try again.');
    if (!validGoogleContext(context)) throw new Error('This sign-in request expired. Return to sign in and choose Google again.');
    back.href = context.role === 'employer' ? './employer-login.html' : './candidate-login.html';
    // getSession waits for the auth client to finish consuming the OAuth callback.
    const { data, error } = await window.savaAuth.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('Google did not return a signed-in session. Please start sign-in again.');
    // Remove callback tokens from browser history only after Supabase has persisted them.
    history.replaceState(null, '', './google-callback.html');
    const response = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ role: context.role, company }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not finish account setup. Please try again.');
    if (result.needsCompanyDetails) {
      document.querySelector('#callbackTitle').textContent = 'Welcome to Hire from SA';
      status.textContent = `Google confirmed ${data.session.user.email}.`;
      employerForm.hidden = false;
      const metadata = data.session.user.user_metadata || {};
      const names = String(metadata.full_name || metadata.name || '').split(' ');
      employerForm.elements.firstName.value ||= metadata.given_name || names.shift() || '';
      employerForm.elements.lastName.value ||= metadata.family_name || names.join(' ');
      back.hidden = false;
      return;
    }
    const { error: refreshError } = await window.savaAuth.auth.refreshSession();
    if (refreshError) throw refreshError;
    window.masterStore?.remove('hirefromsa:master-session');
    if (result.role !== context.role) {
      status.textContent = `This email already has a ${result.role === 'candidate' ? 'VA' : 'hirer'} account. Opening that account.`;
    }
    let destination = safeGoogleDestination(result.role === context.role ? context.next : '', result.role, context.signup);
    if (result.role === 'candidate') {
      const { profile } = await window.savaPlatform.candidateRequest('getProfile');
      if (!profile?.resumePath) destination = './candidate-resume.html?required=1';
    }
    sessionStorage.removeItem('sava-google-context');
    window.location.replace(destination);
  } catch (error) { showError(error); }
  finally { busy = false; retry.disabled = false; submit.disabled = false; }
}

employerForm.addEventListener('submit', event => {
  event.preventDefault();
  if (employerForm.reportValidity()) finish(Object.fromEntries(new FormData(employerForm)));
});
retry.addEventListener('click', () => finish(employerForm.hidden ? undefined : Object.fromEntries(new FormData(employerForm))));
finish();
