(() => {
  const path = location.pathname.split('/').pop();
  const pages = { 'welcome.html':'welcome', 'candidate-resume.html':'resume', 'candidate-profile.html':'photo', 'id-verification.html':'id_photos', 'verification.html':'id_video', 'candidate-questions.html':'career' };
  const params = new URLSearchParams(location.search);
  // Local demos never send telemetry to production.
  if (location.pathname.startsWith('/scripts/') || (['localhost','127.0.0.1'].includes(location.hostname) && (params.has('demo') || params.has('preview') || params.has('accountPreview')))) return;
  if (!pages[path] && path !== 'candidate-onboarding.html') return;
  let lastStep = '', lastError = '';
  const send = async (action, step) => {
    try {
      if (!step) return;
      const { data } = await window.savaAuth.auth.getSession();
      if (!data.session?.access_token) return;
      await fetch('https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/onboarding-tracking', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`}, body:JSON.stringify({ action,step }), keepalive:true, signal:AbortSignal.timeout(5000) });
    } catch { /* Telemetry never prevents completing onboarding. */ }
  };
  window.trackOnboarding = send;
  document.addEventListener('play', event => {
    const video = event.target;
    if (video.closest?.('#introGuidePlayer')) send('visit','intro');
    if (video.closest?.('#waitingGuidePlayer')) send('visit','next_steps');
  }, true);
  document.addEventListener('ended', event => {
    const video = event.target;
    if (video.closest?.('#introGuidePlayer')) send('videoComplete','intro');
    if (video.closest?.('#waitingGuidePlayer')) send('videoComplete','next_steps');
  }, true);
  const check = () => {
    const step = document.documentElement.dataset.onboardingStep || pages[path];
    if (step && step !== lastStep) { lastStep = step; send('visit',step); }
    const error = document.querySelector('.portal-result.error:not([hidden]), .journey-status-line.error:not([hidden]), .es-error:not([hidden])');
    if (error?.textContent && error.textContent !== lastError) { lastError = error.textContent; send('error',step); }
    if (!error?.textContent) lastError = '';
  };
  let scheduled = false;
  new MutationObserver(() => { if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; check(); }); } }).observe(document.documentElement, { attributes:true, childList:true, subtree:true, characterData:true });
  check();
})();
