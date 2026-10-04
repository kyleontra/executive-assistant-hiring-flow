import { mountRequiredVideo } from './required-video.mjs';

// Shown once, right after a VA confirms their email. The resume page does the account checks.
const VIDEO = { src: '/videos/welcome-v1.mp4', title: 'Welcome to Hire From SA' };
const KEY = `hirefromsa:watched:welcome:${VIDEO.src}`;
const demoMode = ['localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).has('demo');
const next = document.querySelector('#welcomeContinue');
let watched = false;
try { watched = !demoMode && localStorage.getItem(KEY) === 'complete'; } catch { /* Watching still unlocks Continue. */ }

next.disabled = !watched;
const player = mountRequiredVideo(document.querySelector('#welcomePlayer'), {
  ...VIDEO, autoplay: !watched, unpausable: true, minimal: true, completed: watched,
  onComplete() {
    try { localStorage.setItem(KEY, 'complete'); } catch { /* The button still unlocks. */ }
    next.disabled = false;
    goNext();
  },
});
player.video.poster = VIDEO.src.replace('.mp4', '.jpg');
// Move on by itself when the video ends; Continue stays for anyone who already watched it.
function goNext() {
  player.video.pause();
  window.location.assign(demoMode ? './candidate-resume.html?demo=1' : './candidate-resume.html');
}
next.onclick = () => { if (!next.disabled) goNext(); };
