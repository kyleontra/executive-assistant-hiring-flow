const ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/candidate-onboarding';
const RETRYABLE_ACTIONS = new Set(['status', 'completeGuide', 'completeContract', 'skipIntro', 'removeIntro', 'saveCareerSurvey', 'savePreferences']);
const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
export async function onboardingRequest(action, payload = {}) {
  const token = await window.getAccessToken();
  if (!token) throw new Error('Your sign-in expired. Sign in again to continue.');
  const multipart = payload instanceof FormData;
  const body = multipart ? payload : JSON.stringify({ action, ...payload });
  const attempts = RETRYABLE_ACTIONS.has(action) ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
        body, signal: AbortSignal.timeout(multipart ? 120000 : 20000),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result) return result;
      const error = new Error(result?.error || 'Your progress could not be saved. Please try again.');
      error.retryable = !result || [429, 500, 502, 503, 504].includes(response.status);
      throw error;
    } catch (error) {
      const timedOut = ['TimeoutError', 'AbortError'].includes(error.name);
      const retryable = error.retryable ?? (timedOut || error instanceof TypeError);
      if (!retryable || attempt === attempts - 1) {
        if (timedOut) throw new Error('The request took too long. Check your connection and retry. Your saved progress is kept.');
        throw error;
      }
    }
    await wait(250 * (2 ** attempt));
  }
}
