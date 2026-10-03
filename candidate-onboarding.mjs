import { requestCameraStream } from './camera-request.mjs';
import { mountRequiredVideo } from './required-video.mjs';
import { completionKey, guides, hasWatched } from './onboarding-videos.mjs';
import { onboardingRequest } from './onboarding-client.mjs';
import { backgroundOptions } from './virtual-background.mjs';
import { prepareVideoBackground } from './video-background-setup.mjs';

const root = document.querySelector('#onboardingRoot');
let player;
let stream;
let recorder;
let timer;
let objectUrl;
let selectedVideo;
let virtualBackground;
let sourceVideo;
let effectFailed = false;
let loading = false;
let currentStage = "";
const CONTRACT_URL = 'https://sendlink.co/documents/doc-form/6a99dcb2ea613131e9ac83f3?locale=en';
const manage = new URLSearchParams(location.search).get('manage') === '1';
// From My Profile: VAs under review can answer the job questions before approval.
const questionsMode = new URLSearchParams(location.search).get('questions') === '1' || new URLSearchParams(location.search).get('demo') === 'questions';
// From My Profile: VAs under review can record their 1-minute intro before approval.
const introMode = new URLSearchParams(location.search).get('intro') === '1' || new URLSearchParams(location.search).get('demo') === 'intro';
// Local preview only: ?demo=identity|platform|contract|waiting walks the sign-up stages without an account.
const DEMO_STAGES = ['identity', 'platform', 'contract', 'waiting', 'questions', 'intro'];
const demoParam = new URLSearchParams(location.search).get('demo');
let demoStage = ['localhost', '127.0.0.1'].includes(location.hostname) && DEMO_STAGES.includes(demoParam) ? demoParam : '';
const demoMode = Boolean(demoStage);
async function demoRequest(action, body = {}) {
  if (action === 'completeGuide') demoStage = body.guide === 'identity' ? 'platform' : 'contract';
  if (action === 'completeContract') demoStage = 'waiting';
  if (action === 'status' && demoStage === 'questions') return { stage: 'waiting', approved: false, preferences: {}, surveyStep: 1 };
  if (action === 'status' && demoStage === 'intro') return { stage: 'waiting', approved: false, introSaved: false };
  return { stage: demoStage, contractName: 'Thandi Jacobs' };
}
const request = demoMode ? demoRequest : onboardingRequest;
const introScript = 'Hi, I’m [name], based in [city]. I have experience in [your field], especially [key skill]. Recently, I [brief achievement]. I’d love to help your team with [type of work].';
const button = (id, label, secondary = false) => `<button id="${id}" type="button" class="journey-action${secondary ? ' secondary' : ''}">${label}</button>`;
const heading = (kicker, title, description) => `<div class="journey-heading"><p class="journey-kicker">${kicker}</p><h1>${title}</h1><p>${description}</p></div>`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function message(text, error = false) {
  const status = root.querySelector('#journeyStatus');
  if (status) { status.textContent = text; status.className = error ? 'journey-status-line journey-error' : 'journey-status-line'; }
}
const SIGNUP_STEPS = [['Create your account', 'Name, email and password'], ['Confirm your email', 'Enter the 6-digit code we send you'], ['Add your resume', 'Upload a file or paste a link'], ['Verify your ID', 'Photos of your ID and a short video'], ['Sign your contract', 'Watch a short video, then sign']];
const SIGNING_PARTS = ['Watch video', 'Sign contract'];
// Sign-up stages before approval use the same split layout as the other VA sign-up pages.
function renderSignupLayout({ side, part, card, allDone = false }) {
  document.body.className = 'es-page';
  document.body.dataset.accountMenu = 'off';
  document.querySelector('.journey-header')?.setAttribute('hidden', '');
  root.className = 'es-shell';
  const steps = SIGNUP_STEPS.map(([title, detail], index) => {
    const done = allDone || index < 4;
    return done
      ? `<li class="done"><b>✓</b><span>${title}<small>Done</small></span></li>`
      : `<li class="current"><b>${index + 1}</b><span>${title}<small>${detail}</small></span></li>`;
  }).join('');
  const parts = part ? `<ol class="es-substeps" aria-label="Signing your contract has two parts">${SIGNING_PARTS.map((label, index) => index + 1 < part ? `<li class="done"><b>✓</b>${label}</li>` : index + 1 === part ? `<li class="current"><b>${index + 1}</b>${label}</li>` : `<li><b>${index + 1}</b>${label}</li>`).join('')}</ol>` : '';
  root.innerHTML = `<aside class="es-side"><a href="./home.html" class="es-logo" aria-label="Hire From SA home"><img src="./assets/hire-from-sa-logo.jpeg" alt="Hire From SA" /></a><div class="es-side-copy"><h2>${side.title}</h2><ul>${side.points.map(point => `<li>${point}</li>`).join('')}</ul></div><div class="es-side-card es-steps-card" aria-hidden="true"><strong>Your profile in 5 steps</strong><ol>${steps}</ol></div></aside><section class="es-main"><div class="es-top"><a href="./home.html" class="es-logo es-logo-mobile" aria-label="Hire From SA home"><img src="./assets/hire-from-sa-logo.jpeg" alt="Hire From SA" /></a></div>${card(parts)}</section>`;
  root.querySelectorAll('.journey-action').forEach(item => item.classList.remove('journey-action', 'secondary'));
}
// A single required video with nothing else on the page.
function renderFocusLayout(html) {
  document.body.className = 'es-page';
  document.body.dataset.accountMenu = 'off';
  document.querySelector('.journey-header')?.setAttribute('hidden', '');
  root.className = 'es-focus-shell';
  root.innerHTML = html;
  root.querySelectorAll('.journey-action').forEach(item => item.classList.remove('journey-action', 'secondary'));
}
function restoreJourneyLayout() {
  if (!['es-shell', 'es-focus-shell', 'pp-shell'].some(name => root.classList.contains(name))) return;
  document.body.className = 'journey-page onboarding-page';
  delete document.body.dataset.accountMenu;
  document.querySelector('.journey-header')?.removeAttribute('hidden');
  root.className = 'journey-main';
}
const signupSide = { title: 'Almost done. Sign your contract.', points: ['Your ID is with our review team', 'One short video, then your contract', 'Then you can start applying to jobs'] };
function cleanup() {
  player?.destroy(); player = null;
  document.body.classList.remove('identity-video-only');
  if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); }
  virtualBackground?.stop(); virtualBackground = null;
  if (sourceVideo) { sourceVideo.pause(); sourceVideo.srcObject = null; sourceVideo = null; }
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  clearInterval(timer);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}
function renderIdentityVideo() {
  renderFocusLayout(`<section class="es-focus"><h1>Watch this video to continue</h1><div id="identityGuidePlayer" class="es-player es-focus-player"></div>${button('identityContinue', 'Continue <span aria-hidden="true">→</span>')}<p id="journeyStatus" role="status" class="journey-status-line"></p></section>`);
  const next = root.querySelector('#identityContinue');
  next.classList.add('es-submit');
  next.disabled = true;
  let finished = false;
  let advancing = false;
  const finish = async () => {
    if (!finished || advancing) return;
    advancing = true;
    next.disabled = true;
    message('Saving your progress…');
    try {
      await request('completeGuide', { guide: 'identity' });
      await load();
    } catch (error) {
      message(error.message || 'Could not save your progress. Retry without rewatching the video.', true);
      next.textContent = 'Retry saving and continue →';
      next.disabled = false;
    } finally { advancing = false; }
  };
  next.onclick = finish;
  player = mountRequiredVideo(root.querySelector('#identityGuidePlayer'), {
    ...guides.identity, autoplay: true, unpausable: true, minimal: true,
    onComplete() { finished = true; next.disabled = false; next.focus(); },
  });
  player.video.poster = guides.identity.src.replace('.mp4', '.jpg');
}
function bind(id, callback) {
  const el = root.querySelector(`#${id}`);
  if (!el) return;
  el.onclick = async () => {
    el.disabled = true;
    try { await callback(); } catch (error) { message(error.message, true); }
    finally { if (el.isConnected) el.disabled = false; }
  };
}
function renderPlatformGuide() {
  renderSignupLayout({ side: signupSide, part: 2, card: parts => `<section class="es-card es-login es-guide"><p class="es-kicker">STEP 5 OF 5</p><h1>How Hire From SA works</h1><p class="es-lead">This video covers how the platform works and what's in your contract. Watch it to the end, then you'll sign.</p>${parts}<div id="guidePlayer" class="es-player"></div>${button('guideContinue', 'Watch video to continue')}<p id="journeyStatus" role="status" class="journey-status-line"></p></section>` });
  const next = root.querySelector('#guideContinue');
  next.classList.add('es-submit');
  next.disabled = true;
  let finished = false;
  player = mountRequiredVideo(root.querySelector('#guidePlayer'), { ...guides.platform, autoplay: true, unpausable: true, onComplete() { finished = true; next.disabled = false; next.innerHTML = 'Continue to contract <span aria-hidden="true">→</span>'; } });
  player.video.poster = guides.platform.src.replace('.mp4', '.jpg');
  bind('guideContinue', async () => {
    if (!finished) return;
    message('Saving your progress…');
    const result = await request('completeGuide', { guide: 'platform' });
    if (result.stage === 'contract') {
      cleanup();
      renderContract({ contractName: result.contractName || '' });
      return;
    }
    await load();
  });
}
function renderGuide(guide) {
  if (guide === 'platform') { renderPlatformGuide(); return; }
  restoreJourneyLayout();
  const copy = {
    platform: ['BEFORE YOUR CONTRACT', 'Last step: Watch the video below and review the contract', '', '<h2>Your contract is next.</h2><p>After this video, review and sign the Candidate Platform Contract. Your identity review becomes pending only after the contract is complete.</p>'],
    intro: ['IDENTITY APPROVED · NEXT STEPS', 'Congrats on getting approved! Watch the video below to increase your chance of getting hired by over 50%', '', `<h2>Your suggested intro script</h2><p class="journey-script">${introScript}</p><p>Use your own words, keep your camera on, and take a few tries if needed. Your public introduction is separate from the private ID recording.</p><p><b>Recording an intro is optional.</b> You can continue without one.</p>`],
  }[guide];
  root.innerHTML = heading(...copy.slice(0, 3)) + `<div class="journey-columns"><div><div id="guidePlayer" class="required-video-player"></div><p class="journey-caption"><b>${guides[guide].title}</b><span>Required guide</span></p></div><section class="journey-panel">${copy[3]}${button('guideContinue', 'Watch video to continue')}<p id="journeyStatus" role="status" class="journey-status-line"></p></section></div>`;
  const next = root.querySelector('#guideContinue');
  next.disabled = true;
  let finished = false;
  player = mountRequiredVideo(root.querySelector('#guidePlayer'), { ...guides[guide], autoplay: true, unpausable: guide === 'platform', onComplete() { finished = true; next.disabled = false; next.textContent = guide === 'platform' ? 'Continue to contract →' : 'Continue →'; } });
  player.video.poster = guides[guide].src.replace('.mp4', '.jpg');
  bind('guideContinue', async () => {
    if (!finished) return;
    message('Saving your progress…');
    const result = await request('completeGuide', { guide });
    if (guide === 'platform' && result.stage === 'contract') {
      cleanup();
      renderContract({ contractName: result.contractName || '' });
      return;
    }
    await load();
  });
}
function renderContract(state) {
  const savedName = escapeHtml(state.contractName);
  renderSignupLayout({ side: signupSide, part: 2, card: parts => `<form id="contractForm" class="es-card es-login es-contract"><p class="es-kicker">STEP 5 OF 5</p><h1>Sign your contract</h1><p class="es-lead">Two quick parts: sign the contract in Sendlink, then confirm here.</p>${parts}<div class="es-contract-step"><span class="es-contract-num">1</span><div><b>Open and sign the contract</b><p>It opens in a new tab. Fill in every required field and submit it, then come back to this page.</p><a id="openContract" class="es-secondary es-contract-open" href="${CONTRACT_URL}" target="_blank" rel="noopener noreferrer">Open the contract ↗</a></div></div><div class="es-contract-step"><span class="es-contract-num">2</span><div><b>Confirm you signed it</b><label class="es-code-label">Full legal name<input id="contractName" name="contractName" type="text" value="${savedName}" autocomplete="name" minlength="2" maxlength="160" required /></label><label class="es-check"><input id="contractAccepted" name="contractAccepted" type="checkbox" required /><span>I completed and submitted the Hire From SA contract in Sendlink.</span></label></div></div><button id="submitContract" class="es-submit" type="submit">Submit for review <span aria-hidden="true">→</span></button><p id="journeyStatus" role="status" class="journey-status-line"></p></form>` });
  const form = root.querySelector('#contractForm');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = root.querySelector('#submitContract');
    submit.disabled = true;
    message('Submitting your profile for review…');
    try {
      await request('completeContract', { contractName: form.elements.contractName.value, accepted: form.elements.contractAccepted.checked });
      await load();
    } catch (error) {
      message(error.message, true);
      submit.disabled = false;
    }
  });
}
// After the contract: one video, then Check status opens their account (they can browse jobs while under review).
function renderWaiting(user) {
  const watched = hasWatched(user?.id || 'demo', 'waiting');
  renderFocusLayout(`<section class="es-focus"><h1>Watch this video for next steps</h1><div id="waitingGuidePlayer" class="es-player es-focus-player"></div>${button('checkStatus', 'View My Profile <span aria-hidden="true">→</span>')}<p id="journeyStatus" role="status" class="journey-status-line"></p></section>`);
  const next = root.querySelector('#checkStatus');
  next.classList.add('es-submit');
  next.disabled = !watched;
  player = mountRequiredVideo(root.querySelector('#waitingGuidePlayer'), {
    ...guides.waiting, autoplay: !watched, unpausable: true, minimal: true, completed: watched,
    onComplete() {
      try { localStorage.setItem(completionKey(user?.id || 'demo', 'waiting'), 'complete'); } catch { /* The button still unlocks. */ }
      next.disabled = false;
      next.focus();
    },
  });
  player.video.poster = guides.waiting.src.replace('.mp4', '.jpg');
  next.onclick = () => { if (next.disabled) return; cleanup(); location.assign(demoMode ? './candidate-dashboard.html?demo=1&review=1&tab=profile' : './candidate-dashboard.html?tab=profile'); };
}
function renderPreferences(state, step = state.surveyStep === 2 ? 2 : 1) {
  restoreJourneyLayout();
  const saved = state.preferences || {};
  const start = saved.startAvailability || '';
  const options = [['full_time', 'Full-time'], ['part_time', 'Part-time'], ['contractor', 'Contractor'], ['open_to_all', 'I’m open to all']];
  const questions = step === 1 ? `
    <section class="preferences-section">
      <label class="preferences-field"><span class="preferences-label-title">What type of job are you looking for, and which industries would you like to work in?</span><span class="preferences-help">Tell us about the work you enjoy and the industries that interest you. Be as specific as possible.</span><textarea name="jobIndustryPreferences" maxlength="2000" rows="4" required placeholder="For example, supporting a healthcare team or helping an online retail business with customer service">${escapeHtml(saved.jobIndustryPreferences || '')}</textarea></label>
      <label class="preferences-field"><span class="preferences-label-title">What position would you like to hold within those industries?</span><span class="preferences-help">Be as specific as possible about job titles, responsibilities, and the kind of work you want to do.</span><textarea name="desiredPositions" maxlength="2000" rows="4" required placeholder="For example, a medical virtual assistant managing appointments and patient enquiries">${escapeHtml(saved.desiredPositions || '')}</textarea></label>
    </section>` : `
    <section class="preferences-section">
      <label class="preferences-field"><span class="preferences-label-title">What is your monthly income goal?</span><span class="preferences-help">Enter the amount you would like to earn each month in South African rand (ZAR).</span><div class="preferences-currency"><span aria-hidden="true">R</span><input name="monthlyIncomeGoalZar" aria-label="Monthly income goal in South African rand" type="number" min="0.01" max="10000000" step="0.01" inputmode="decimal" required placeholder="For example, 20000" value="${escapeHtml(saved.monthlyIncomeGoalZar ?? '')}" /></div></label>
      <fieldset class="preferences-employment"><legend>What type of employment are you looking for?</legend><div class="preferences-choices">${options.map(([value, label]) => `<label><input type="radio" name="employmentPreference" value="${value}" required${saved.employmentPreference === value ? ' checked' : ''} /><span>${label}</span></label>`).join('')}</div></fieldset>
      <label class="preferences-field"><span class="preferences-label-title">When can you start?</span><select name="startAvailability" required><option value="">Choose one</option><option value="immediately"${start === 'immediately' ? ' selected' : ''}>Immediately</option><option value="two_weeks"${start === 'two_weeks' ? ' selected' : ''}>Within two weeks</option><option value="one_month"${start === 'one_month' ? ' selected' : ''}>Within a month</option><option value="flexible"${start === 'flexible' ? ' selected' : ''}>Flexible</option></select></label>
      <label class="preferences-field"><span class="preferences-label-title">Do you have a portfolio or work samples to share? <span class="preferences-optional">Optional</span></span><span class="preferences-help">Add up to five links, one per line, starting with https://. These appear on your profile for employers to view.</span><textarea name="portfolioLinks" maxlength="10244" rows="3" spellcheck="false" autocapitalize="none" placeholder="https://your-portfolio.com&#10;https://your-work-samples.com">${escapeHtml(Array.isArray(saved.portfolioLinks) ? saved.portfolioLinks.join('\n') : (saved.portfolioLinks || ''))}</textarea></label>
      <label class="preferences-field"><span class="preferences-label-title">Anything else that would help us find your perfect job? <span class="preferences-optional">Optional</span></span><span class="preferences-help">Share any preferences about your schedule, team, or working environment. Only our team sees this note.</span><textarea name="preferredJobNote" maxlength="400" rows="3" placeholder="Anything else you would like us to know">${escapeHtml(saved.preferredJobNote || '')}</textarea></label>
    </section>`;
  root.innerHTML = `<div class="preferences-onboarding">
    <aside class="preferences-onboarding-aside">
      <p class="journey-kicker">YOUR CANDIDATE PROFILE</p>
      <h2>Find work that fits you.</h2>
      <p>Tell us what you’re looking for so we can help you find the right opportunity.</p>
      ${state.approved === false ? `<ol class="preferences-onboarding-steps" aria-label="Next steps">
        <li${step === 1 ? ' aria-current="step"' : ' class="completed"'}><span>${step === 1 ? '1' : '✓'}</span><b>The work you want</b></li>
        <li${step === 2 ? ' aria-current="step"' : ''}><span>2</span><b>Goals and availability</b></li>
      </ol><p style="margin-top:28px"><a href="./candidate-dashboard.html?tab=profile" style="color:#fff;font-weight:700">← Back to My Profile</a></p>` : `<ol class="preferences-onboarding-steps" aria-label="Onboarding progress">
        <li class="completed"><span aria-label="Completed">✓</span><b>Identity approved</b></li>
        <li aria-current="step"><span>1</span><b>Job preferences</b></li>
        <li><span>2</span><b>Intro guide</b></li>
        <li><span>3</span><b>Your introduction</b></li>
      </ol>`}
    </aside>
    <section class="preferences-onboarding-main">
      <div class="preferences-onboarding-content">
        ${heading(state.approved === false ? 'BEFORE YOU APPLY · ' + step + ' OF 2' : 'IDENTITY APPROVED · YOUR JOB PREFERENCES', step === 1 ? 'Tell us about your ideal job.' : 'Your goals and availability.', step === 1 ? (state.approved === false ? 'Start with the industries and roles you’d like to work in.' : 'Your identity is approved. Start with the industries and roles you’d like to work in.') : 'A few more details to complete your job preferences.')}
        <form id="preferencesForm" class="preferences-form">
          ${questions}
          <div class="preferences-footer">${step === 2 ? '<button id="backToCareerSurvey" type="button" class="preferences-back secondary">← Back</button>' : ''}<button id="savePreferences" type="submit" class="journey-action">Continue →</button><p class="preferences-next">${step === 1 ? 'Next: your goals and availability' : state.approved === false ? 'Next: back to My Profile' : 'Next: your introduction guide'}</p><p id="journeyStatus" role="status" class="journey-status-line"></p></div>
        </form>
      </div>
    </section>
  </div>`;
  const form = root.querySelector('#preferencesForm');
  const keys = step === 1 ? ['jobIndustryPreferences', 'desiredPositions'] : ['monthlyIncomeGoalZar', 'employmentPreference', 'startAvailability', 'preferredJobNote', 'portfolioLinks'];
  const readValues = () => Object.fromEntries(keys.map(key => [key, form.elements[key].value.trim()]));
  root.querySelector('#backToCareerSurvey')?.addEventListener('click', () => {
    state.preferences = { ...saved, ...readValues() };
    renderPreferences(state, 1);
    root.querySelector('h1')?.scrollIntoView({ block: 'start' });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const payload = readValues();
    const submit = root.querySelector('#savePreferences');
    submit.disabled = true;
    if (root.querySelector('#backToCareerSurvey')) root.querySelector('#backToCareerSurvey').disabled = true;
    message('Saving your answers…');
    try {
      await request(step === 1 ? 'saveCareerSurvey' : 'savePreferences', payload);
      if (step === 1) {
        state.preferences = { ...saved, ...payload };
        state.surveyStep = 2;
        renderPreferences(state, 2);
        root.querySelector('h1')?.scrollIntoView({ block: 'start' });
      } else if (state.approved === false) location.assign(demoMode ? './candidate-dashboard.html?demo=1&review=1&tab=profile' : './candidate-dashboard.html?tab=profile');
      else await load();
    } catch (error) {
      message(error.message || 'Could not save your answers. Try again.', true);
      submit.disabled = false;
      if (root.querySelector('#backToCareerSurvey')) root.querySelector('#backToCareerSurvey').disabled = false;
    }
  });
}
async function inspectVideo(file) {
  if (!file || !['video/mp4', 'video/webm'].includes(file.type.split(';')[0]) || file.size > 25 * 1024 * 1024 || !file.size) throw new Error('Choose an MP4 or WebM video under 25 MB.');
  const url = URL.createObjectURL(file);
  const sample = document.createElement('video');
  sample.preload = 'metadata';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('This video could not be opened. Choose another recording.')), 10000);
      sample.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
      sample.onerror = () => { clearTimeout(timeout); reject(new Error('Choose a playable MP4 or WebM video.')); };
      sample.src = url;
    });
    if (!sample.videoWidth || !sample.videoHeight) throw new Error('This file does not contain a video picture.');
    if (Number.isFinite(sample.duration) && sample.duration > 125) throw new Error('Keep your introduction under two minutes.');
  } finally { sample.removeAttribute('src'); sample.load(); URL.revokeObjectURL(url); }
}
async function chooseVideo(file) {
  selectedVideo = null;
  root.querySelector('#saveIntro').disabled = true;
  await inspectVideo(file);
  selectedVideo = file;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  const screen = root.querySelector('#introScreen');
  screen.hidden = false; screen.srcObject = null; screen.src = objectUrl; screen.controls = true; screen.muted = false;
  screen.load();
  root.querySelector('#introPlaceholder').hidden = true;
  root.querySelector('#playIntro').disabled = false;
  try { await screen.play(); } catch { /* Native controls and Play recording remain available when autoplay is blocked. */ }
  root.querySelector('#saveIntro').disabled = !root.querySelector('#introConsent').checked;
  message('Watch your recording, confirm sharing with employers, then save it.');
}
// My Profile version: guide video and script on the left, the recorder on the right.
function profileIntroMarkup(state) {
  const back = demoMode ? './candidate-dashboard.html?demo=1&review=1&tab=profile' : './candidate-dashboard.html?tab=profile';
  return `<header class="pp-top"><a href="./home.html" class="es-logo" aria-label="Hire From SA home"><img src="./assets/hire-from-sa-logo.jpeg" alt="Hire From SA" /></a><a class="pp-back" href="${back}">← Back to My Profile</a></header><div class="pp-main"><div class="pp-heading"><h1>Record your 1-minute intro video</h1><p class="es-lead">Hirers watch this before they message you. Watch the video, then record yours using the script.</p></div><div class="pp-grid"><section class="pp-panel pi-guide"><p class="pp-step"><b>1</b>Watch how to do it</p><div id="introGuidePlayer" class="pp-video"><video src="${guides.intro.src}" poster="${guides.intro.src.replace('.mp4', '.jpg')}" controls playsinline preload="metadata" aria-label="${guides.intro.title}"></video></div><div class="pi-script"><b>Your script</b><p>${introScript}</p><small>Use your own words. Keep your ID and contact details out of the video.</small></div></section><section class="pp-panel pi-recorder"><p class="pp-step"><b>2</b>Record your video</p><div class="intro-preview-frame"><video id="introScreen" class="intro-screen" playsinline controls preload="auto" aria-label="Your introduction recording"></video><p id="introPlaceholder" class="intro-placeholder">Your recording will show here.</p></div><select id="introBackground" hidden><option value="brand" selected>Hire From SA background</option></select><label id="introBackgroundFileLabel" hidden><input id="introBackgroundFile" type="file" accept="image/jpeg,image/png,image/webp" /></label><p class="pi-note">The Hire From SA background is added to camera recordings automatically.</p><div class="pi-buttons">${button('startIntro', 'Record with camera')}${button('stopIntro', 'Stop', true)}${button('playIntro', 'Play back', true)}</div><p id="recordTimer" class="intro-timer"></p><label class="pi-upload">Or upload a video (MP4 or WebM, up to 2 minutes)<input id="introFile" type="file" accept="video/mp4,video/webm" /></label><label class="es-check"><input id="introConsent" type="checkbox" /><span>I agree to show this video on my profile to hirers using Hire From SA.</span></label>${button('saveIntro', 'Save my video →')}${state.introSaved ? button('removeIntro', 'Remove saved video', true) : ''}<p id="journeyStatus" role="status" class="journey-status-line"></p></section></div></div>`;
}
function renderRecorder(state, profileMode = false) {
  restoreJourneyLayout();
  selectedVideo = null;
  if (profileMode) {
    document.body.className = 'es-page pp-page pq-page pi-page';
    document.body.dataset.accountMenu = 'off';
    document.querySelector('.journey-header')?.setAttribute('hidden', '');
    root.className = 'pp-shell';
    root.innerHTML = profileIntroMarkup(state);
    root.querySelectorAll('.journey-action').forEach(item => item.classList.remove('journey-action'));
    root.querySelector('#saveIntro').classList.add('es-submit');
    root.querySelectorAll('.pi-buttons button').forEach(item => item.classList.add('es-secondary'));
    root.querySelector('#removeIntro')?.classList.add('es-secondary');
  } else root.innerHTML = heading('OPTIONAL PUBLIC INTRODUCTION', 'Record your video to increase your chances of getting hired!', 'Introduce yourself and your experience. Keep your ID and private contact details out of this video.') + `<div class="journey-columns"><div><div class="intro-preview-frame"><video id="introScreen" class="intro-screen" playsinline controls preload="auto" aria-label="Your introduction recording"></video><p id="introPlaceholder" class="intro-placeholder">Record with your camera or upload a video to preview it here.</p></div><div class="intro-background-controls"><label for="introBackground">Video background</label><select id="introBackground"><option value="brand" selected>Hire From SA background</option></select><label id="introBackgroundFileLabel" class="intro-background-file" hidden>Choose background image<input id="introBackgroundFile" type="file" accept="image/jpeg,image/png,image/webp" /></label><p>The Hire From SA background is applied automatically to new camera recordings. The branded background is included in the saved recording. Uploaded videos keep their original background.</p></div><div class="intro-buttons">${button('startIntro','Record with camera')}${button('stopIntro','Stop recording',true)}${button('playIntro','Play recording',true)}</div><p id="recordTimer" class="intro-timer"></p></div><section class="journey-panel"><h2>Make it your own.</h2><p class="journey-script">${introScript}</p><label class="intro-upload-label">Or upload your video<input id="introFile" type="file" accept="video/mp4,video/webm" /></label><p>Up to 2 minutes · MP4 or WebM · 25 MB maximum</p><label class="intro-consent"><input id="introConsent" type="checkbox" /><span>I agree to show this introduction on my candidate profile to employers using Hire From SA.</span></label>${button('saveIntro','Save introduction →')}${button('skipIntro',state.introSaved ? 'Keep saved video and continue' : 'Continue without an intro',true)}${state.introSaved ? button('removeIntro','Remove saved video',true) : ''}<p id="journeyStatus" role="status" class="journey-status-line"></p></section></div>`;
  const screen = root.querySelector('#introScreen');
  screen.hidden = !state.introUrl;
  root.querySelector('#playIntro').disabled = !state.introUrl;
  if (state.introUrl) { screen.src = state.introUrl; screen.load(); root.querySelector('#introPlaceholder').hidden = true; }
  screen.addEventListener('error', () => message('This recording could not play. Try recording again or upload an MP4 video.', true));
  bind('playIntro', async () => { screen.muted = false; if (screen.error) screen.load(); await screen.play(); });
  root.querySelector('#stopIntro').disabled = true;
  root.querySelector('#saveIntro').disabled = true;
  root.querySelector('#introConsent').onchange = () => { root.querySelector('#saveIntro').disabled = !selectedVideo || !root.querySelector('#introConsent').checked; };
  root.querySelector('#introBackground').onchange = event => { root.querySelector('#introBackgroundFileLabel').hidden = event.target.value !== 'custom'; };
  root.querySelector('#introFile').onchange = async event => { const file = event.target.files[0]; if (!file) return; try { await chooseVideo(file); } catch (error) { message(error.message, true); } };
  const lockRecorderActions = locked => {
    for (const id of ['skipIntro', 'removeIntro', 'introConsent']) { const control = root.querySelector(`#${id}`); if (control) control.disabled = locked; }
  };
  bind('startIntro', async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Camera recording is unavailable. You can upload a video instead.');
    const background = 'brand';
    if (!backgroundOptions.has(background)) throw new Error('Choose a video background.');
    const backgroundFile = root.querySelector('#introBackgroundFile').files?.[0];
    if (background === 'custom' && !backgroundFile) throw new Error('Choose a background image before recording.');
    lockRecorderActions(true);
    selectedVideo = null; root.querySelector('#saveIntro').disabled = true;
    effectFailed = false;
    stream = await requestCameraStream({ video: { width: { ideal: 720 }, height: { ideal: 405 }, facingMode: 'user' }, audio: true });
    sourceVideo = document.createElement('video');
    sourceVideo.srcObject = stream; sourceVideo.muted = true; sourceVideo.playsInline = true;
    await sourceVideo.play();
    if (background !== 'none') {
      message('Preparing your virtual background…');
      virtualBackground = await prepareVideoBackground({ video: sourceVideo, cameraStream: stream, mode: background, imageFile: backgroundFile, onError() {
        effectFailed = true;
        if (recorder?.state === 'recording') recorder.stop();
        message('The background effect stopped. This take was discarded. Retry the camera to record again with the Hire From SA background.', true);
      } });
    }
    screen.hidden = false; screen.removeAttribute('src'); screen.srcObject = virtualBackground.stream; screen.muted = true; screen.controls = false; root.querySelector('#introPlaceholder').hidden = true; root.querySelector('#playIntro').disabled = true; await screen.play();
    const mimeType = ['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    const chunks = [];
    recorder = new MediaRecorder(virtualBackground.stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1000000, audioBitsPerSecond: 96000 });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      clearInterval(timer);
      virtualBackground?.stop(); virtualBackground = null;
      if (sourceVideo) { sourceVideo.pause(); sourceVideo.srcObject = null; sourceVideo = null; }
      stream?.getTracks().forEach(track => track.stop()); stream = null;
      const file = new File(chunks, 'introduction', { type: recorder.mimeType || 'video/webm' });
      if (!root.querySelector('#introScreen')) return;
      lockRecorderActions(false);
      root.querySelector('#stopIntro').disabled = true; root.querySelector('#introFile').disabled = false; root.querySelector('#startIntro').disabled = false;
      root.querySelector('#introBackground').disabled = false; root.querySelector('#introBackgroundFile').disabled = false;
      root.querySelector('#startIntro').textContent = 'Record another take';
      if (effectFailed) { screen.srcObject = null; screen.hidden = true; root.querySelector('#introPlaceholder').hidden = false; return; }
      try { await chooseVideo(file); } catch (error) { message(error.message, true); }
    };
    recorder.start();
    root.querySelector('#stopIntro').disabled = false; root.querySelector('#introFile').disabled = true;
    root.querySelector('#introBackground').disabled = true; root.querySelector('#introBackgroundFile').disabled = true;
    // Keep Record disabled until the stop handler releases the camera.
    let seconds = 0;
    root.querySelector('#recordTimer').textContent = 'Recording · 0:00 / 2:00';
    timer = setInterval(() => { seconds++; root.querySelector('#recordTimer').textContent = `Recording · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} / 2:00`; if (seconds >= 120 && recorder.state === 'recording') recorder.stop(); }, 1000);
    message('Recording now. Click Stop when you are finished.');
  });
  // This guard also prevents a second recording while the asynchronous setup finishes.
  const start = root.querySelector('#startIntro');
  const startHandler = start.onclick;
  start.onclick = async () => { if (stream || recorder?.state === 'recording') return; await startHandler(); if (recorder?.state === 'recording') start.disabled = true; else { lockRecorderActions(false); virtualBackground?.stop(); virtualBackground = null; if (sourceVideo) { sourceVideo.pause(); sourceVideo.srcObject = null; sourceVideo = null; } stream?.getTracks().forEach(track => track.stop()); stream = null; } };
  bind('stopIntro', () => { if (recorder?.state === 'recording') recorder.stop(); });
  bind('saveIntro', async () => {
    if (!selectedVideo || !root.querySelector('#introConsent').checked) return;
    const form = new FormData(); form.append('video', selectedVideo, selectedVideo.type.includes('mp4') ? 'intro.mp4' : 'intro.webm'); form.append('consent','true');
    lockRecorderActions(true);
    root.querySelector('#startIntro').disabled = true; root.querySelector('#introFile').disabled = true;
    message('Uploading your introduction…');
    try { await request('saveIntro', form); cleanup(); location.assign(profileMode ? (demoMode ? './candidate-dashboard.html?demo=1&review=1&tab=profile' : './candidate-dashboard.html?tab=profile') : './candidate-dashboard.html'); }
    finally { lockRecorderActions(false); root.querySelector('#startIntro').disabled = false; root.querySelector('#introFile').disabled = false; }
  });
  bind('skipIntro', async () => { if (!state.introSaved) await request('skipIntro'); cleanup(); location.assign('./candidate-dashboard.html'); });
  bind('removeIntro', async () => { await request('removeIntro'); if (profileMode) { renderRecorder({ ...state, introSaved: false, introUrl: '' }, true); return; } await load(); });
  if (state.introPlaybackError) message(state.introPlaybackError, true);
}
async function load() {
  if (loading) return;
  loading = true;
  try {
    const user = demoMode ? { id: 'demo' } : await window.getVerifiedCandidate();
    if (!user) { location.replace('./candidate-login.html?next=./candidate-onboarding.html'); return; }
    const state = await request('status');
    currentStage = state.stage;
    cleanup();
    if (state.stage === 'resume') { location.replace('./candidate-resume.html?next=./candidate-next-steps.html'); return; }
    if (state.stage === 'preferences') { renderPreferences(state); return; }
    if (state.stage === 'profile') { location.replace('./candidate-profile.html'); return; }
    if (state.stage === 'verification') { location.replace(/^SA-[A-Z0-9]{8}$/.test(state.reviewReference || '') ? `./verification.html?review=${encodeURIComponent(state.reviewReference)}` : './id-verification.html'); return; }
    if (state.stage === 'identity') renderIdentityVideo();
    else if (state.stage === 'contract') renderContract(state);
    else if (state.stage === 'platform' && !state.approved) {
      // Sign-up goes straight from the review video to the contract; the platform video is not shown.
      const result = await request('completeGuide', { guide: 'platform' });
      if (result.stage !== 'contract') throw new Error('Your progress could not be saved. Please try again.');
      renderContract(state);
    }
    else if (['platform','intro'].includes(state.stage)) renderGuide(state.stage);
    else if (state.stage === 'waiting' && questionsMode) renderPreferences(state);
    else if (state.stage === 'waiting' && introMode) renderRecorder(state, true);
    else if (state.stage === 'waiting') renderWaiting(user);
    else if (state.stage === 'recording' || manage) renderRecorder(state);
    else location.replace('./candidate-dashboard.html');
  } catch (error) {
    restoreJourneyLayout();
    root.innerHTML = heading('YOUR ONBOARDING', 'We couldn’t load your progress.', 'Your saved account details are safe. Try again to continue.') + button('retry','Try again') + '<p id="journeyStatus" role="alert"></p>';
    message(error.message,true); bind('retry',load);
  } finally { loading = false; }
}
window.addEventListener('pagehide', cleanup);
load();
