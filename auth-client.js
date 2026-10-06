const SUPABASE_URL = 'https://jyxamdvvnoylaxolhlht.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gz9khyKvk-yvFAVZqJPk4g_BC4n7FlY';

if (!window.supabase) throw new Error('The authentication library did not load. Refresh the page and try again.');

window.savaAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

window.googleSignInAvailable = async () => {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Could not reach sign-in. Check your connection and try again.');
  return Boolean((await response.json()).external?.google);
};

let verifiedUserRequest;
const MASTER_SESSION_KEY = 'hirefromsa:master-session';
// Master sign-ins are kept in localStorage so they survive new tabs and browser restarts.
const masterStore = { get: (key) => { try { return localStorage.getItem(key) || sessionStorage.getItem(key) || ''; } catch { return ''; } }, set: (key, value) => { try { localStorage.setItem(key, value); } catch { sessionStorage.setItem(key, value); } }, remove: (key) => { try { localStorage.removeItem(key); } catch { /* ignore */ } sessionStorage.removeItem(key); } };
window.masterStore = masterStore;
window.masterSessionToken = () => masterStore.get(MASTER_SESSION_KEY);
window.masterAuthRequest = async (action, payload = {}) => {
  const token = window.masterSessionToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/master-auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && action !== 'login') masterStore.remove(MASTER_SESSION_KEY);
    throw new Error(result.error || 'Unable to check your account. Please try again.');
  }
  return result;
};
window.signInMaster = async (username, password) => {
  const result = await window.masterAuthRequest('login', { username, password });
  await window.savaAuth.auth.signOut();
  masterStore.set(MASTER_SESSION_KEY, result.token);
  masterStore.set('hirefromsa:master-workspace', result.employerId);
  return result.user;
};
window.signOutAccount = async () => {
  if (window.masterSessionToken()) {
    try { await window.masterAuthRequest('logout'); }
    catch (error) { if (window.masterSessionToken()) throw error; }
    masterStore.remove(MASTER_SESSION_KEY);
    masterStore.remove('hirefromsa:master-workspace');
  }
  await window.savaAuth.auth.signOut();
};
async function resolveVerifiedUser() {
  if (verifiedUserRequest) return verifiedUserRequest;
  verifiedUserRequest = (async () => {
    if (window.masterSessionToken()) {
      try {
        const result = await window.masterAuthRequest('status');
        masterStore.set('hirefromsa:master-workspace', result.employerId);
        return result.user;
      } catch (error) {
        if (!window.masterSessionToken()) return null;
        throw error;
      }
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await window.savaAuth.auth.getUser();
      if (!error) return data?.user?.email_confirmed_at ? data.user : null;
      const temporary = error.name === 'AuthRetryableFetchError' || !error.status || error.status >= 500 || error.status === 429;
      if (!temporary) return null;
      if (attempt === 2) throw new Error('We could not check your sign-in. Your saved session has not been cleared. Check your connection and try again.');
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 300));
    }
  })();
  try { return await verifiedUserRequest; } finally { verifiedUserRequest = null; }
}
window.getVerifiedUser = async () => {
  try { return await resolveVerifiedUser(); } catch { return null; }
};

window.getVerifiedCandidate = async () => {
  // Keep temporary auth outages distinct from an expired session.
  const user = await resolveVerifiedUser();
  return user?.app_metadata?.account_role === 'candidate' ? user : null;
};

window.getVerifiedEmployer = async () => {
  // A temporary network error must not masquerade as a signed-out employer.
  const user = await resolveVerifiedUser();
  return user?.app_metadata?.account_role === 'employer' ? user : null;
};

window.getAccessToken = async () => {
  if (window.masterSessionToken()) return window.masterSessionToken();
  const { data: { session } } = await window.savaAuth.auth.getSession();
  return session?.access_token || null;
};

const accountPreviewRole = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? new URLSearchParams(window.location.search).get('accountPreview')
  : '';
if (accountPreviewRole === 'candidate' || accountPreviewRole === 'employer') {
  window.savaAccountPreviewUser = {
    id: 'local-account-preview',
    email: accountPreviewRole === 'employer' ? 'hirer@example.com' : 'candidate@example.com',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { account_role: accountPreviewRole },
    user_metadata: accountPreviewRole === 'employer'
      ? { first_name: 'Alex', last_name: 'Morgan', company_name: 'Northstar Studio' }
      : { first_name: 'Naledi', last_name: 'Mokoena' },
  };
  window.getVerifiedUser = async () => window.savaAccountPreviewUser;
  window.getVerifiedCandidate = async () => accountPreviewRole === 'candidate' ? window.savaAccountPreviewUser : null;
  window.getVerifiedEmployer = async () => accountPreviewRole === 'employer' ? window.savaAccountPreviewUser : null;
}

if (!document.querySelector('link[data-sava-account-styles]')) {
  const accountStyles = document.createElement('link');
  accountStyles.rel = 'stylesheet';
  accountStyles.href = './account-menu.css';
  accountStyles.dataset.savaAccountStyles = 'true';
  document.head.append(accountStyles);
}

if (!document.querySelector('script[data-sava-account-script]')) {
  const accountScript = document.createElement('script');
  accountScript.src = './account-menu.js';
  accountScript.dataset.savaAccountScript = 'true';
  document.head.append(accountScript);
}

if (!document.querySelector('script[data-onboarding-tracking]')) {
  const tracker = document.createElement('script'); tracker.src = './onboarding-tracking.js'; tracker.dataset.onboardingTracking = 'true'; document.head.append(tracker);
}
