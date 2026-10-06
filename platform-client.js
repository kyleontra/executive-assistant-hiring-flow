const HIRING_PLATFORM_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/hiring-platform';
const EMPLOYER_IDENTITY_KEY = 'sava-employer-messaging-identity';

function platformEmployerIdentity() {
  const masterToken = window.masterSessionToken?.();
  const masterWorkspace = window.masterStore?.get('hirefromsa:master-workspace') || sessionStorage.getItem('hirefromsa:master-workspace');
  if (masterToken && masterWorkspace) return { employerId: masterWorkspace, editToken: masterToken };
  try {
    const saved = JSON.parse(localStorage.getItem(EMPLOYER_IDENTITY_KEY) || 'null');
    if (saved?.employerId && saved?.editToken) return saved;
  } catch { /* Create a fresh workspace identity below. */ }
  const randomId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const identity = { employerId: randomId(), editToken: `${randomId()}${randomId()}` };
  localStorage.setItem(EMPLOYER_IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

async function platformRequest(action, payload = {}, token = '') {
  const response = await fetch(HIRING_PLATFORM_ENDPOINT, {
    signal: AbortSignal.timeout(30000),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The server could not complete that request.');
  return result;
}

window.savaPlatform = {
  publicRequest: (action, payload) => platformRequest(action, payload),
  // Sends whoever is signed in (candidate, hirer or master) so the server can tailor what it returns, e.g. job pay.
  viewerRequest: async (action, payload = {}) => {
    const token = await window.getAccessToken?.();
    const identity = token ? platformEmployerIdentity() : {};
    return platformRequest(action, { ...identity, ...payload }, token || '');
  },
  employerRequest: async (action, payload = {}) => {
    // Forward any active Supabase session so the server can keep candidate
    // accounts out of hirer-only actions.
    const token = await window.getAccessToken?.();
    // Jobs and workspaces use the company name from sign-up unless the hirer typed another one.
    if (!payload.companyName || payload.companyName === 'Your company') {
      try {
        const { data } = await window.savaAuth.auth.getSession();
        const saved = String(data?.session?.user?.user_metadata?.company_name || '').trim();
        if (saved) payload = { ...payload, companyName: saved };
      } catch { /* Fall back to whatever the page sent. */ }
    }
    return platformRequest(action, { ...platformEmployerIdentity(), ...payload }, token || '');
  },
  candidateRequest: async (action, payload = {}) => {
    const token = await window.getAccessToken?.();
    if (!token) throw new Error('Sign in with your verified candidate account to continue.');
    return platformRequest(action, payload, token);
  },
  employerIdentity: platformEmployerIdentity,
};
