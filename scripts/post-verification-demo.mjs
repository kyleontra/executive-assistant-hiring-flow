import { onboardingStage } from '/supabase/functions/_shared/onboarding-state.mjs';
import { parsePortfolioLinks } from '/supabase/functions/_shared/portfolio-links.mjs';
import { guides } from '/onboarding-videos.mjs';

if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local demo only');
const storageKey = 'hfsa-post-verification-demo-v1';
const initial = () => ({ preferences: {}, profile: { resume_path: 'demo/resume.txt', verification_status: 'verified', onboarding_preferences_required: true }, progress: { platform_completed_at: new Date().toISOString(), contract_accepted_at: new Date().toISOString() } });
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey)) || initial(); } catch { saved = initial(); }
const persist = () => localStorage.setItem(storageKey, JSON.stringify(saved));
if (saved.progress.intro_completed_at && saved.progress.intro_guide_version !== guides.intro.src) {
  saved.progress.intro_completed_at = null;
  persist();
}
const database = new Promise((resolve, reject) => {
  const request = indexedDB.open(storageKey, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('recordings');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('Browser storage is unavailable. Allow site storage to test saving videos.'));
});
async function recording(method, value) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('recordings', method === 'get' ? 'readonly' : 'readwrite');
    const store = transaction.objectStore('recordings');
    const request = method === 'put' ? store.put(value, 'intro') : store[method]('intro');
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(new Error('Could not save the demo recording. Free some browser storage and retry.'));
    transaction.onabort = transaction.onerror;
  });
}
document.querySelector('#restartDemo').onclick = async () => {
  try { await recording('delete'); saved = initial(); persist(); location.assign('/scripts/post-verification-demo.html'); }
  catch (error) { document.querySelector('#onboardingRoot').textContent = error.message; }
};
window.getVerifiedCandidate = async () => ({ id: 'local-demo-candidate' });
window.getAccessToken = async () => 'local-demo-only';
const realFetch = window.fetch.bind(window);
let introUrl = '';
async function state() {
  if (saved.progress.intro_path && !introUrl) {
    const file = await recording('get');
    if (file) introUrl = URL.createObjectURL(file);
  }
  return { stage: onboardingStage(saved.profile, saved.progress), approved: true, verificationStatus: 'verified', surveyStep: saved.profile.career_survey_completed_at ? 2 : 1, preferences: saved.preferences, introSaved: Boolean(saved.progress.intro_path), introUrl, guideCompleted: { intro: Boolean(saved.progress.intro_completed_at) } };
}
window.fetch = async (url, options = {}) => {
  if (!String(url).includes('supabase.co')) return realFetch(url, options);
  if (!String(url).includes('/functions/v1/candidate-onboarding')) throw new Error('This demo saves only in your browser.');
  try {
    const form = options.body instanceof FormData ? options.body : null;
    const body = form ? { action: 'saveIntro' } : JSON.parse(options.body);
    const now = new Date().toISOString();
    const text = value => typeof value === 'string' ? value.trim() : '';
    switch (body.action) {
      case 'status': return Response.json(await state());
      case 'saveCareerSurvey': {
        const industries = text(body.jobIndustryPreferences), positions = text(body.desiredPositions);
        if (!industries || !positions || industries.length > 2000 || positions.length > 2000) throw new Error('Answer both questions using up to 2,000 characters each.');
        Object.assign(saved.preferences, { jobIndustryPreferences: industries, desiredPositions: positions });
        saved.profile.career_survey_completed_at = now;
        break;
      }
      case 'savePreferences': {
        if (!saved.profile.career_survey_completed_at) throw new Error('Complete the ideal job questions first.');
        const income = Number(body.monthlyIncomeGoalZar), employment = text(body.employmentPreference), start = text(body.startAvailability), note = text(body.preferredJobNote);
        if (!/^\d+(?:\.\d{1,2})?$/.test(String(body.monthlyIncomeGoalZar)) || !Number.isFinite(income) || income <= 0 || income > 10000000 || !['full_time','part_time','contractor','open_to_all'].includes(employment) || !['immediately','two_weeks','one_month','flexible'].includes(start) || note.length > 400) throw new Error('Enter a positive monthly income goal in rand and choose employment type and start availability.');
        Object.assign(saved.preferences, { monthlyIncomeGoalZar: income, employmentPreference: employment, startAvailability: start, portfolioLinks: parsePortfolioLinks(body.portfolioLinks), preferredJobNote: note });
        saved.profile.preferences_completed_at = now;
        break;
      }
      case 'completeGuide':
        if (body.guide !== 'intro' || !saved.profile.preferences_completed_at) throw new Error('Complete both forms before the intro guide.');
        saved.progress.intro_completed_at = now;
        saved.progress.intro_guide_version = guides.intro.src;
        break;
      case 'saveIntro': {
        if (!saved.profile.preferences_completed_at || !saved.progress.intro_completed_at) throw new Error('Complete your job preferences and intro guide first.');
        const file = form.get('video');
        if (!(file instanceof Blob) || !file.size || file.size > 25 * 1024 * 1024 || form.get('consent') !== 'true') throw new Error('Choose a video under 25 MB and confirm sharing.');
        await recording('put', file);
        if (introUrl) URL.revokeObjectURL(introUrl);
        introUrl = URL.createObjectURL(file);
        saved.progress.intro_path = 'browser-only-recording';
        saved.progress.intro_skipped_at = null;
        break;
      }
      case 'skipIntro':
        if (!saved.profile.preferences_completed_at || !saved.progress.intro_completed_at) throw new Error('Complete the intro guide first.');
        saved.progress.intro_skipped_at = now;
        break;
      case 'removeIntro':
        await recording('delete');
        saved.progress.intro_path = null;
        saved.progress.intro_skipped_at = now;
        if (introUrl) URL.revokeObjectURL(introUrl);
        introUrl = '';
        break;
      default: throw new Error('This action is unavailable in the post-verification demo.');
    }
    persist();
    return Response.json({ status: 'saved', ...await state() });
  } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
};

const current = await state();
if (current.stage === 'complete' && new URLSearchParams(location.search).get('manage') !== '1') {
  const root = document.querySelector('#onboardingRoot');
  root.innerHTML = '<div class="journey-heading"><p class="journey-kicker">ONBOARDING COMPLETE</p><h1>Your demo onboarding is complete.</h1><p>Your answers and optional introduction have been saved in this browser.</p></div><section class="journey-panel demo-result"><h2>Your saved answers</h2><dl id="demoAnswers"></dl><div id="demoVideo"></div><a class="journey-action" href="/scripts/post-verification-demo.html?manage=1">Review or change introduction</a></section>';
  const labels = { jobIndustryPreferences: 'Ideal jobs & industries', desiredPositions: 'Desired positions', monthlyIncomeGoalZar: 'Monthly income goal', employmentPreference: 'Employment type', startAvailability: 'Start availability', portfolioLinks: 'Portfolio links', preferredJobNote: 'Other preferences' };
  const values = { full_time: 'Full-time', part_time: 'Part-time', contractor: 'Contractor', open_to_all: 'Open to all', immediately: 'Immediately', two_weeks: 'Within two weeks', one_month: 'Within a month', flexible: 'Flexible' };
  for (const [key, label] of Object.entries(labels)) {
    const dt = document.createElement('dt'), dd = document.createElement('dd'), value = current.preferences[key];
    dt.textContent = label;
    dd.textContent = key === 'monthlyIncomeGoalZar' ? `R${Number(value).toLocaleString('en-ZA')}/month (ZAR)` : Array.isArray(value) ? value.join('\n') || 'None added' : values[value] || value || 'Not provided';
    root.querySelector('#demoAnswers').append(dt, dd);
  }
  if (current.introUrl) { const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.src = current.introUrl; video.setAttribute('aria-label', 'Saved demo introduction'); root.querySelector('#demoVideo').append(video); }
  else root.querySelector('#demoVideo').textContent = 'Introduction skipped.';
} else {
  // Mount the current production implementation; adapt only its destination to the demo completion screen.
  const response = await realFetch('/candidate-onboarding.mjs');
  if (!response.ok) throw new Error('Could not load the current onboarding screens.');
  const source = (await response.text()).replaceAll("'./candidate-dashboard.html'", "'/scripts/post-verification-demo.html'").replace(/from (['"])(\.\/|\/)([^'"]+)\1/g, (_match, quote, _prefix, path) => `from ${quote}${location.origin}/${path}${quote}`);
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  await import(moduleUrl);
  URL.revokeObjectURL(moduleUrl);
}
window.addEventListener('pagehide', () => { if (introUrl) URL.revokeObjectURL(introUrl); });
