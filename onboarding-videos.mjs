import { mountRequiredVideo } from './required-video.mjs';

export const guides = {
  identity: { src: '/videos/contract-terms.mp4', title: 'Agree to Hire From SA terms and payments' },
  platform: { src: '/videos/platform-overview-v2.mp4', title: 'How Our Platform Works and Your Agreement' },
  waiting: { src: '/videos/video-intro-v2.mp4', title: 'Your application is submitted — what happens next' },
  intro: { src: '/videos/intro-recording-guide-v3.mp4', title: 'How to record your profile introduction' },
};

// Remember completed guides for this candidate and file version in this browser.
// This is a viewing requirement in the UI, not proof of attention or authorization.
export function completionKey(candidateId, guide) {
  return `hirefromsa:watched:${candidateId}:${guides[guide].src}`;
}
export function hasWatched(candidateId, guide) {
  try { return localStorage.getItem(completionKey(candidateId, guide)) === 'complete'; }
  catch { return false; }
}

export function mountGuide({ root, button, candidateId, guide, label = 'Continue →', onContinue, remember = true }) {
  let complete = remember && hasWatched(candidateId, guide);
  const unlock = () => { button.disabled = false; button.textContent = label; };
  button.disabled = !complete;
  button.textContent = complete ? label : 'Watch video to continue';
  root.guidePlayer?.destroy();
  root.guidePlayer = mountRequiredVideo(root, {
    ...guides[guide], completed: complete, unpausable: guide === 'platform',
    onComplete() {
      complete = true;
      if (remember) {
        try { localStorage.setItem(completionKey(candidateId, guide), 'complete'); } catch { /* Playback still unlocks when storage is unavailable. */ }
      }
      unlock();
    },
  });
  root.guidePlayer.video.poster = guides[guide].src.replace('.mp4', '.jpg');
  button.onclick = () => { if (complete) { root.guidePlayer.video.pause(); onContinue(); } };
  return root.guidePlayer;
}

export function mountDashboardGuides({ document: doc, candidateId, approved }) {
  const overview = doc.querySelector('#platformOverviewVideo');
  const intro = doc.querySelector('#profileIntroVideo');
  const applications = doc.querySelector('#candidateApplications');
  const resume = doc.querySelector('#candidateResumeCard');
  overview.hidden = true;
  intro.hidden = true;
  applications.hidden = false;
  resume.hidden = false;
  if (!approved) return;
  if (hasWatched(candidateId, 'platform') && hasWatched(candidateId, 'intro')) return;
  applications.hidden = true;
  resume.hidden = true;
  const finish = () => { intro.hidden = true; applications.hidden = false; resume.hidden = false; resume.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const showIntro = () => {
    overview.hidden = true;
    intro.hidden = false;
    mountGuide({ root: doc.querySelector('#profileIntroPlayer'), button: doc.querySelector('#profileIntroContinue'), candidateId, guide: 'intro', label: 'Go to my dashboard →', onContinue: finish });
  };
  if (hasWatched(candidateId, 'platform')) { showIntro(); return; }
  overview.hidden = false;
  mountGuide({ root: doc.querySelector('#platformOverviewPlayer'), button: doc.querySelector('#platformOverviewContinue'), candidateId, guide: 'platform', onContinue: showIntro });
}
