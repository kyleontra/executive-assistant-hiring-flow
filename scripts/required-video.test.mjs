import test from 'node:test';
import assert from 'node:assert/strict';
import { WatchProgress, mountRequiredVideo } from '../required-video.mjs';
test('only watching through the end completes the video', () => {
  const watch = new WatchProgress();
  for (let i = 0; i < 41; i++) watch.observe(i, i + 1, 1, 41);
  assert.equal(watch.finished(41), true);
});
test('waiting or seeking to the end cannot complete the video', () => {
  const watch = new WatchProgress();
  watch.observe(0, 0, 500, 41);
  watch.observe(0, 40, 0.25, 41);
  watch.observe(40, 41, 1, 41);
  assert.equal(watch.frontier, 0);
  assert.equal(watch.finished(41), false);
});
test('replaying watched content does not earn duplicate progress', () => {
  const watch = new WatchProgress();
  for (let i = 0; i < 10; i++) watch.observe(i, i + 1, 1, 41);
  for (let i = 0; i < 10; i++) watch.observe(i, i + 1, 1, 41);
  assert.equal(watch.frontier, 10);
  assert.equal(watch.finished(41), false);
});
test('fast-forward, incomplete duration, and missing metadata stay locked', () => {
  const watch = new WatchProgress();
  watch.observe(0, 2, 1, 41);
  assert.equal(watch.frontier, 0);
  assert.equal(watch.finished(NaN), false);
  assert.equal(watch.finished(0), false);
  watch.observe(0, 40, 40, 41);
  assert.equal(watch.finished(41), false);
});

class Element extends EventTarget {
  style = {}; currentTime = 0; duration = 24; paused = true; playbackRate = 1; hidden = false; error = null;
  setAttribute() {}
  removeAttribute() {}
  load() { this.currentTime = 0; }
  play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
}
function playerFixture() {
  const doc = new EventTarget(); doc.hidden = false; doc.createElement = () => new Element();
  const root = {ownerDocument:doc,replaceChildren(...children){this.children=children}};
  const player = mountRequiredVideo(root,{src:'/guide.mp4',title:'Guide',unpausable:true});
  return {root,doc,player,video:player.video,play:root.children[1],status:root.children[3]};
}
test('resuming after a pause starts from the last credited frame rather than permanently stranding progress', async () => {
  const {video,player} = playerFixture();
  video.currentTime = 0.5;
  await video.play();
  assert.equal(video.currentTime,0);
  player.destroy();
});
test('an incomplete end or media failure always exposes a usable playback control', () => {
  const {video,play,status,player} = playerFixture();
  play.hidden = true; video.currentTime = video.duration;
  video.dispatchEvent(new Event('ended'));
  assert.equal(play.hidden,false); assert.equal(play.textContent,'Finish video');
  play.hidden = true;
  video.dispatchEvent(new Event('error'));
  assert.equal(play.hidden,false); assert.equal(play.textContent,'Retry video');
  assert.match(status.textContent,/Check your connection/);
  player.destroy();
});
