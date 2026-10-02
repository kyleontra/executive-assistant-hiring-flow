import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../verification.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function harness({demo = true, user = null, status = {stage:'verification',reviewReference:'SA-ABCDEF12'}} = {}) {
  const navigations = [];
  const nodes = new Map(); const timers = new Map(); const revoked = []; let timer = 0;
  class Node extends EventTarget {
    hidden = false; disabled = false; readyState = 0; videoWidth = 0; videoHeight = 0;
    textContent = ''; className = ''; src = ''; loadCount = 0;
    classList = {add(){},remove(){}};
    pause() {} load() {this.loadCount++;}
    removeAttribute(name) {this[name]='';}
  }
  const get = selector => {if (!nodes.has(selector)) nodes.set(selector,new Node()); return nodes.get(selector);};
  const window = {
    location:{search:demo?'?demo=1':'',hostname:'localhost',replace:url=>navigations.push(url)},
    setTimeout: fn => {timers.set(++timer,fn);return timer;},
    clearTimeout:id=>timers.delete(id), addEventListener(){},
    savaAuth:{auth:{onAuthStateChange(){}}}, getVerifiedCandidate: async () => user,
  };
  const context = vm.createContext({window,document:{querySelector:get},URLSearchParams,Blob,console,
    URL:{createObjectURL:()=>`blob:fixture-${revoked.length}`,revokeObjectURL:url=>revoked.push(url)},
    onboardingRequest: async () => status,
    MediaRecorder:{isTypeSupported:type=>type==='video/mp4'||type==='video/webm'},
  });
  vm.runInContext(source,context);
  return {get,revoked,navigations,flush:()=>new Promise(resolve=>setImmediate(resolve)),
    show(blob = new Blob([new Uint8Array(12000)],{type:'video/mp4'})) {context.fixture = blob;vm.runInContext('showRecordedVideo(fixture)',context);},
    metadata(width=640,height=480,event='loadedmetadata') {const p=get('#recordedPreview');p.readyState=1;p.videoWidth=width;p.videoHeight=height;p.dispatchEvent(new Event(event));},
    timeout(){for(const fn of [...timers.values()])fn();timers.clear();},
    run:code=>vm.runInContext(code,context),
  };
}
test('visible preview loads metadata without autoplay, a hidden probe or seeking',()=>{
  const h=harness();h.show();const preview=h.get('#recordedPreview');
  assert.equal(preview.hidden,false);assert.equal(preview.controls,true);assert.equal(preview.preload,'metadata');assert.equal(preview.loadCount,1);
  h.metadata();assert.equal(h.get('#submitReview').disabled,false);
  assert.equal(h.run('recordingReady'),true);
});
test('mobile preload timeout preserves the recording and later Play can validate it',()=>{
  const h=harness();h.show();const original=h.run('recordedVideo');h.timeout();
  assert.equal(h.run('recordedVideo'),original);assert.equal(h.get('#recordedPreview').hidden,false);
  assert.equal(h.get('#submitReview').disabled,true);assert.match(h.get('#cameraResult').textContent,/do not need to record again/);
  h.metadata(640,480,'playing');assert.equal(h.get('#submitReview').disabled,false);
});
test('valid small recordings are not rejected by arbitrary byte or brightness thresholds',()=>{
  const h=harness();h.show(new Blob([new Uint8Array(1000)],{type:'video/mp4'}));h.metadata();
  assert.equal(h.run('recordingReady'),true);assert.doesNotMatch(source,/brightnessTotal|blob\.size < 25000/);
});
test('audio-only metadata cannot enable submission',()=>{
  const h=harness();h.show();h.metadata(0,0);assert.equal(h.get('#submitReview').disabled,true);
  assert.equal(h.run('recordingReady'),false);assert.match(h.get('#cameraResult').textContent,/no video track/);
});
test('decoder errors retain the file but block submission',()=>{
  const h=harness();h.show();h.metadata();h.get('#recordedPreview').dispatchEvent(new Event('error'));
  assert.equal(h.get('#submitReview').disabled,true);assert.ok(h.run('recordedVideo'));assert.match(h.get('#cameraResult').textContent,/could not play/);
});
test('empty and oversized files cannot enable submission',()=>{
  for(const size of [0,4*1024*1024+1]) {const h=harness();h.show(new Blob([new Uint8Array(size)]));assert.equal(h.get('#submitReview').disabled,true);assert.equal(h.run('recordingReady'),false);assert.equal(h.get('#recordedPreview').loadCount,0);}
});
test('a playable preview never bypasses account verification',()=>{
  const h=harness({demo:false});h.show();h.metadata();assert.equal(h.get('#submitReview').disabled,true);assert.equal(h.run('recordingReady'),true);
});
test('replacing the preview resets readiness and releases the old object URL',()=>{
  const h=harness();h.show();h.metadata();h.show();assert.equal(h.run('recordingReady'),false);assert.equal(h.get('#submitReview').disabled,true);assert.equal(h.revoked.length,1);
});
test('prefer supported MP4 recording for native mobile playback',()=>{
  const h=harness();assert.equal(h.run('preferredRecorderType()'),'video/mp4');
});

test('returning candidates recover ID photos from their account without a URL reference or browser cache', async()=>{
  const h=harness({demo:false,user:{id:'owner',email:'fixture@example.invalid'}});await h.flush();
  assert.equal(h.run('reviewReference'),'SA-ABCDEF12');assert.equal(h.run('verified'),true);
  assert.match(h.get('#authStatus').textContent,/ID photo reference is ready/);assert.equal(h.navigations.length,0);
});
test('missing account photo progress returns the candidate to ID uploads', async()=>{
  const h=harness({demo:false,user:{id:'owner'},status:{stage:'verification',reviewReference:''}});await h.flush();
  assert.deepEqual(h.navigations,['./id-verification.html']);assert.equal(h.run('verified'),false);
});
test('finished ID video steps resume the next onboarding stage', async()=>{
  const h=harness({demo:false,user:{id:'owner'},status:{stage:'contract',reviewReference:'SA-ABCDEF12'}});await h.flush();
  assert.deepEqual(h.navigations,['./candidate-onboarding.html']);assert.equal(h.run('verified'),false);
});
