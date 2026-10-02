import layout from './signup-preview-layout.css?inline';
import { renderJourneyStage } from './signup-preview-stages.mjs';

const steps = [
  ['Sign in', 'candidate-login', 'Preview the sign-in screen. Click Sign in or Next page without entering anything.'],
  ['Create account', 'candidate-signup', 'The account form is shown with sample details. Nothing is submitted.'],
  ['Check inbox', 'check-email', 'This simulates the email being sent. No email is sent in preview mode.'],
  ['Verify email', 'email-confirmed', 'The code is simulated. Continue without checking an inbox.'],
  ['Add resume', 'candidate-resume', 'No resume is needed. Click Next page to continue.'],
  ['Next steps', 'candidate-next-steps', 'See the remaining candidate onboarding steps.'],
  ['Profile photo', 'candidate-profile', 'No photo or camera access is needed for this preview.'],
  ['ID photos', 'id-verification', 'No identity documents are collected in this preview.'],
  ['ID recording', 'verification', 'Record and replay a private local demo. Nothing is uploaded.', 'camera-demo'],
  ['Verification video', 'verification', 'After ID submission: the review video autoplays, then advances automatically.', 'submitted'],
  ['Platform + agreement', 'candidate-dashboard', 'Before the contract: watch how the platform and agreement work.', 'platform-before-contract'],
  ['Candidate contract', 'candidate-dashboard', 'The candidate completes the contract before identity review becomes pending.', 'contract'],
  ['Verification cutoff', 'candidate-dashboard', 'After signing, the candidate is stopped here until identity approval.', 'waiting'],
  ['Approved · next steps', 'candidate-dashboard', 'After approval: watch the next-steps guide beside the optional intro script.', 'approved'],
  ['Optional intro recording', 'candidate-dashboard', 'A public profile video is optional and separate from the private ID recording.', 'intro-recording'],
  ['Candidate dashboard', 'candidate-dashboard', 'Sample dashboard with no real candidate data.'],
  ['Referral question', 'referral', 'Optional referral screen. No answer is required.'],
  ['Reset password', 'reset-password', 'Preview password recovery without sending a code or changing a password.'],
];
const select = document.querySelector('#previewPage');
const frame = document.querySelector('#pagePreview');
const back = document.querySelector('#previousPage');
const next = document.querySelector('#nextPage');
steps.forEach(([label], i) => select.add(new Option(`${i + 1}. ${label}`, String(i))));
let index = Math.max(0, Math.min(steps.length - 1, Math.floor(Number(new URLSearchParams(location.search).get('step'))) || 0));
function showPage() {
  select.value = String(index);
  back.disabled = index === 0;
  next.textContent = index === steps.length - 1 ? 'Restart preview ↻' : 'Next page →';
  document.querySelector('#previewContext').textContent = `${index + 1} of ${steps.length} · ${steps[index][2]}`;
  history.replaceState(null, '', `?step=${index}`);
  frame.src = steps[index][3] === 'camera-demo'
    ? '/verification.html?demo=1&embedded=1'
    : `/flow-preview/${steps[index][1]}.html?view=${index}`;
}
function advance() { index = (index + 1) % steps.length; showPage(); }
back.onclick = () => { if (index > 0) { index--; showPage(); } };
next.onclick = advance;
select.onchange = () => { index = Number(select.value); showPage(); };
frame.onload = () => {
  const doc = frame.contentDocument;
  if (!doc) return;
  const interactiveCamera = steps[index][3] === 'camera-demo';
  const customStage = renderJourneyStage(steps[index][3]);
  if (customStage) {
    doc.body.className = 'journey-page';
    doc.body.innerHTML = customStage;
  }
  const style = doc.createElement('style');
  style.textContent = layout;
  doc.head.append(style);
  if (interactiveCamera) {
    doc.body.dataset.previewReady = String(index);
    return;
  }
  const find = s => doc.querySelector(s);
  const text = (s, value) => { if (find(s)) find(s).textContent = value; };
  const hide = (s, value = true) => { if (find(s)) find(s).hidden = value; };
  doc.querySelectorAll('form').forEach(form => form.addEventListener('submit', e => e.preventDefault()));
  doc.querySelectorAll('input').forEach(input => {
    input.disabled = true;
    input.autocomplete = 'off';
    if (input.type === 'email') input.value = 'preview@example.com';
    if (input.type === 'password') input.value = 'PreviewOnly123';
    if (/firstName/i.test(input.id)) input.value = 'Demo';
    if (/lastName/i.test(input.id)) input.value = 'Candidate';
    if (/code/i.test(input.id)) input.value = '123456';
  });
  doc.querySelectorAll('button').forEach(button => { button.disabled = false; button.type = 'button'; });
  doc.addEventListener('click', e => {
    const action = e.target.closest('a, button');
    if (!action) return;
    e.preventDefault();
    if (action.dataset.previewStep !== undefined) {
      index = Number(action.dataset.previewStep);
      showPage();
    } else {
      advance();
    }
  });
  text('#authStatus', 'Preview mode · No account or uploads required.');
  text('#nextStepsStatus', 'Preview mode · Continue through every step without entering personal information.');
  hide('#continueVerification', false);
  text('#candidateWelcome', 'Welcome, Demo Candidate. This is a sample account preview.');
  text('#candidateResumeTitle', 'Sample resume.pdf');
  text('#candidateResumeDetail', 'Example only — no resume has been uploaded.');
  text('#resumePickerTitle', 'Sample resume.pdf');
  text('#resumePickerDetail', 'Preview only · No upload needed');
  hide('#portalStatus');
  hide('#candidateGate');
  hide('#candidateReady', false);
  hide('#platformOverviewVideo');
  hide('#profileIntroVideo');
  if (find('#candidateApplications')) find('#candidateApplications').innerHTML = '<section class="portal-empty"><h2>No applications yet.</h2><p>Your applications and conversations will appear here.</p></section>';
  // Only the current journey stage creates a video element with a source.
  // The original page snapshots never mount their hidden dashboard guides.
  if (!customStage) {
    doc.querySelectorAll('video').forEach(video => video.removeAttribute('src'));
  }

  const identityVideo = find('#previewIdentityVideo');
  if (identityVideo) {
    const identityFrame = identityVideo.closest('.identity-video-frame');
    identityVideo.controls = false;
    identityVideo.muted = false;
    identityVideo.defaultMuted = false;
    identityVideo.volume = 1;
    identityVideo.disablePictureInPicture = true;
    const playIdentity = async () => {
      try { await identityVideo.play(); identityFrame.classList.remove('autoplay-blocked'); }
      catch { identityFrame.classList.add('autoplay-blocked'); identityVideo.setAttribute('aria-label', 'Next steps video. Tap the video to play.'); }
    };
    identityVideo.addEventListener('click', playIdentity);
    identityVideo.addEventListener('playing', () => identityFrame.classList.remove('autoplay-blocked'));
    identityVideo.addEventListener('ended', advance, { once: true });
    playIdentity();
  }

  doc.body.dataset.previewReady = String(index);
};
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  if (steps[index][3] === 'camera-demo' && event.data?.type === 'hirefromsa:camera-demo-complete') advance();
});
showPage();
