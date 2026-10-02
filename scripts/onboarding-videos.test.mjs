import test from 'node:test';
import assert from 'node:assert/strict';
import { mountDashboardGuides, mountGuide, completionKey } from '../onboarding-videos.mjs';
import { mountRequiredVideo } from '../required-video.mjs';

function fixture(t) {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const storage = new Map();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => { if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage; });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
  } });
  class Element extends EventTarget {
    constructor(doc) { super(); this.ownerDocument = doc; this.hidden = false; this.children = []; this.currentTime = 0; this.duration = 3; this.paused = true; this.playbackRate = 1; this.style = {}; }
    setAttribute() {}
    removeAttribute() {}
    replaceChildren(...children) { this.children = children; }
    scrollIntoView() {}
    load() {}
    async play() { this.paused = false; this.dispatchEvent(new Event('play')); }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  }
  const nodes = new Map();
  const doc = Object.assign(new EventTarget(), { hidden: false, createElement: () => new Element(doc), querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Element(doc)); return nodes.get(selector); } });
  const get = s => doc.querySelector(s);
  const watch = (video) => {
    video.play();
    for (let i = 0; i < 12; i++) { now += 250; video.currentTime += .25; video.dispatchEvent(new Event('timeupdate')); }
    video.dispatchEvent(new Event('ended'));
  };
  return { doc, get, storage, watch };
}

test('the platform video has no pause control and immediately resumes an attempted pause', async t => {
  const f = fixture(t);
  const root = f.get('#player');
  const player = mountGuide({ root, button: f.get('#next'), candidateId: 'alice', guide: 'platform', onContinue() {} });
  const playbackControl = root.children[1];
  playbackControl.dispatchEvent(new Event('click'));
  await Promise.resolve();
  assert.equal(player.video.paused, false);
  assert.equal(playbackControl.hidden, true);
  assert.notEqual(playbackControl.textContent, 'Pause video');
  player.video.pause();
  await Promise.resolve();
  assert.equal(player.video.paused, false);
});

test('guide playback starts with sound and the poster is clickable', async t => {
  const f = fixture(t);
  const root = f.get('#player');
  const player = mountRequiredVideo(root, { src: '/videos/video-intro-v2.mp4', title: 'Next steps', autoplay: true });
  await Promise.resolve();
  assert.equal(player.video.paused, false);
  assert.equal(player.video.muted, false);
  assert.equal(player.video.volume, 1);
  player.video.pause();
  player.video.dispatchEvent(new Event('click'));
  await Promise.resolve();
  assert.equal(player.video.paused, false);
});

test('blocked autoplay leaves a working Play video fallback', async t => {
  const f = fixture(t);
  const root = f.get('#player');
  const originalCreate = f.doc.createElement;
  f.doc.createElement = tag => {
    const el = originalCreate(tag);
    if (tag === 'video') el.play = async () => { throw new Error('NotAllowedError'); };
    return el;
  };
  const player = mountRequiredVideo(root, { src: '/videos/video-intro-v2.mp4', title: 'Next steps', autoplay: true });
  await Promise.resolve();
  assert.equal(root.children[1].hidden, false);
  assert.equal(root.children[1].textContent, 'Play video');
  assert.match(root.children[3].textContent, /start with sound/);
  assert.equal(player.video.paused, true);
});

test('approved candidates must finish both guides in order before seeing dashboard content', t => {
  const f = fixture(t);
  mountDashboardGuides({ document: f.doc, candidateId: 'alice', approved: true });
  const first = f.get('#platformOverviewContinue');
  assert.equal(first.disabled, true);
  assert.equal(f.get('#candidateApplications').hidden, true);
  first.onclick();
  assert.equal(f.get('#profileIntroVideo').hidden, true);
  const video = f.get('#platformOverviewPlayer').guidePlayer.video;
  video.currentTime = video.duration;
  video.dispatchEvent(new Event('seeking'));
  assert.equal(video.currentTime, 0);
  video.dispatchEvent(new Event('ended'));
  assert.equal(first.disabled, true);
  f.watch(video);
  assert.equal(first.disabled, false);
  assert.equal(f.get('#candidateApplications').hidden, true);
  first.onclick();
  assert.equal(f.get('#platformOverviewVideo').hidden, true);
  assert.equal(f.get('#profileIntroVideo').hidden, false);
  const second = f.get('#profileIntroContinue');
  assert.equal(second.disabled, true);
  f.watch(f.get('#profileIntroPlayer').guidePlayer.video);
  second.onclick();
  assert.equal(f.get('#candidateApplications').hidden, false);
  assert.equal(f.get('#candidateResumeCard').hidden, false);
});

test('completion is scoped to candidate and video version, and survives a remount', t => {
  const f = fixture(t);
  f.storage.set(completionKey('alice', 'platform'), 'complete');
  mountDashboardGuides({ document: f.doc, candidateId: 'alice', approved: true });
  assert.equal(f.get('#platformOverviewVideo').hidden, true);
  assert.equal(f.get('#profileIntroVideo').hidden, false);
  f.storage.set(completionKey('alice', 'intro'), 'complete');
  mountDashboardGuides({ document: f.doc, candidateId: 'alice', approved: true });
  assert.equal(f.get('#candidateApplications').hidden, false);
  mountDashboardGuides({ document: f.doc, candidateId: 'bob', approved: true });
  assert.equal(f.get('#platformOverviewVideo').hidden, false);
  assert.equal(f.get('#candidateApplications').hidden, true);
});

test('legacy guide component skips post-approval scripts when approval is absent', t => {
  const f = fixture(t);
  mountDashboardGuides({ document: f.doc, candidateId: 'alice', approved: false });
  assert.equal(f.get('#platformOverviewVideo').hidden, true);
  assert.equal(f.get('#profileIntroVideo').hidden, true);
  assert.equal(f.get('#candidateApplications').hidden, false);
});

test('preview completion does not save a real candidate completion and hidden playback pauses', t => {
  const f = fixture(t);
  let continued = false;
  const player = mountGuide({ root: f.get('#player'), button: f.get('#next'), candidateId: 'preview', guide: 'identity', remember: false, onContinue: () => { continued = true; } });
  player.video.play();
  f.doc.hidden = true;
  f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(player.video.paused, true);
  assert.equal(f.get('#next').disabled, true);
  f.doc.hidden = false;
  f.watch(player.video);
  f.get('#next').onclick();
  assert.equal(continued, true);
  assert.equal(f.storage.size, 0);
});
