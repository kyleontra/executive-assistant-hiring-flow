import { onboardingRequest } from './onboarding-client.mjs';

// One-page job questions. Saves both parts the server already understands, then returns to My Profile.
const form = document.querySelector('#questionsForm');
const status = document.querySelector('#questionsStatus');
const result = document.querySelector('#questionsResult');
const button = document.querySelector('#saveQuestions');
const demoMode = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('demo') === '1';
const profileUrl = demoMode ? './candidate-dashboard.html?demo=1&review=1&tab=profile' : './candidate-dashboard.html?tab=profile';
document.querySelector('.pp-back').href = profileUrl;

function showResult(message, type) {
  result.textContent = message;
  result.className = `portal-result ${type}`;
  result.hidden = false;
}

function fill(preferences = {}) {
  const set = (name, value) => { if (value != null && value !== '') form.elements[name].value = value; };
  set('jobIndustryPreferences', preferences.jobIndustryPreferences);
  set('desiredPositions', preferences.desiredPositions);
  set('monthlyIncomeGoalZar', preferences.monthlyIncomeGoalZar);
  set('startAvailability', preferences.startAvailability);
  set('preferredJobNote', preferences.preferredJobNote);
  if (Array.isArray(preferences.portfolioLinks)) set('portfolioLinks', preferences.portfolioLinks.join('\n'));
  set('nickname', preferences.nickname);
  const zones = Array.isArray(preferences.workTimeZones) ? preferences.workTimeZones : [];
  form.querySelectorAll('input[name="workTimeZones"]').forEach((input) => { input.checked = zones.includes(input.value); });
  const choice = form.querySelector(`input[name="employmentPreference"][value="${preferences.employmentPreference}"]`);
  if (choice) choice.checked = true;
}

async function load() {
  if (demoMode) { status.textContent = 'Demo mode: your answers are never saved'; status.className = 'es-verified success'; return; }
  const user = await window.getVerifiedCandidate();
  if (!user) { location.replace(`./candidate-login.html?next=${encodeURIComponent('./candidate-questions.html')}`); return; }
  try {
    const state = await onboardingRequest('status');
    fill(state.preferences);
    status.textContent = `Signed in: ${user.email}`;
    status.className = 'es-verified success';
  } catch (error) {
    status.textContent = error.message || 'Your saved answers could not load. You can still fill in the form.';
    status.className = 'es-verified error';
  }
}

// "Any time zone" is exclusive: choosing it clears the specific zones, and choosing a zone clears it.
const zoneInputs = [...form.querySelectorAll('input[name="workTimeZones"]')];
zoneInputs.forEach((input) => input.addEventListener('change', () => {
  if (!input.checked) return;
  zoneInputs.forEach((other) => { if (other !== input && (input.value === 'ANY' || other.value === 'ANY')) other.checked = false; });
}));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled || !form.reportValidity()) return;
  const workTimeZones = zoneInputs.filter((input) => input.checked).map((input) => input.value);
  if (!workTimeZones.length) {
    showResult('Select at least one time zone you would be willing to work in.', 'error');
    zoneInputs[0].focus();
    return;
  }
  const value = name => form.elements[name].value.trim();
  button.disabled = true;
  button.textContent = 'Saving…';
  result.hidden = true;
  try {
    if (!demoMode) {
      await onboardingRequest('saveCareerSurvey', { jobIndustryPreferences: value('jobIndustryPreferences'), desiredPositions: value('desiredPositions') });
      await onboardingRequest('savePreferences', { monthlyIncomeGoalZar: value('monthlyIncomeGoalZar'), employmentPreference: value('employmentPreference'), startAvailability: value('startAvailability'), portfolioLinks: value('portfolioLinks'), preferredJobNote: value('preferredJobNote'), workTimeZones, nickname: value('nickname') });
    }
    showResult('Saved. Returning to My Profile…', 'success');
    setTimeout(() => location.assign(profileUrl), 600);
  } catch (error) {
    showResult(error.message || 'Your answers could not be saved. Please try again.', 'error');
    button.disabled = false;
    button.innerHTML = 'Save my answers <span aria-hidden="true">→</span>';
  }
});

load();
