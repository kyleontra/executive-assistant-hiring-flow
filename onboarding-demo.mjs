import { mountGuide, guides } from './onboarding-videos.mjs';

const steps = [
  { guide: 'identity', stage: 'AFTER ID SUBMISSION', description: 'Your ID has been submitted for review. Watch what happens next before continuing.' },
  { guide: 'platform', stage: 'BEFORE YOUR CONTRACT', description: 'Learn how the platform and agreement work before reviewing your candidate contract.' },
  { guide: 'intro', stage: 'AFTER ID APPROVAL', description: 'Watch the next-steps guide to finish. Recording your own introduction remains optional.' },
];
let index = 0;
function showStep() {
  const step = steps[index];
  document.querySelector('#demoStep').textContent = `VIDEO ${index + 1} OF 3 · ${step.stage}`;
  document.querySelector('#demoTitle').textContent = guides[step.guide].title;
  document.querySelector('#demoDescription').textContent = step.description;
  document.querySelectorAll('.onboarding-steps li').forEach((item, i) => {
    if (i === index) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  });
  mountGuide({ root: document.querySelector('#demoPlayer'), button: document.querySelector('#demoContinue'), candidateId: 'preview', guide: step.guide, remember: false, label: index === 2 ? 'Finish preview →' : 'Continue →', onContinue() {
    index += 1;
    if (index < steps.length) showStep();
    else { document.querySelector('#demoPlayer').closest('section').hidden = true; document.querySelector('#demoFinished').hidden = false; }
  } });
}
showStep();
