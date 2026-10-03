import { requestCameraStream } from './camera-request.mjs';
import { onboardingRequest } from './onboarding-client.mjs';

const REVIEW_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-id-video';
const pageParams = new URLSearchParams(window.location.search);
let reviewReference = pageParams.get('review');
const demoMode = pageParams.get('demo') === '1' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const REFERENCE_PATTERN = /^SA-[A-Z0-9]{8}$/;
const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
let cameraStream;
let recorder;
let recordedVideo;
let recordedObjectUrl;
let recordTimer;
let scriptTimer;
let cameraFrame;
let visibleHeight;
let verified = false;
let recordingHasAudio = false;
let recordingReady = false;
let submittingVideo = false;
let releasePreviewCheck = () => {};

const $ = (selector) => document.querySelector(selector);

function showResult(message, type) {
  if (type === 'error' && /sign.in|expired/i.test(message)) document.querySelector('#signInAgain').hidden = false;
  const target = $('#cameraResult');
  target.textContent = message;
  target.hidden = false;
  target.className = `portal-result ${type}`;
}

function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = undefined;
}

function stopCleanPreview() {
  if (cameraFrame) cancelAnimationFrame(cameraFrame);
  cameraFrame = undefined;
}

function preferredRecorderType() {
  return ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/webm;codecs=vp9,opus'].find((type) => MediaRecorder.isTypeSupported(type));
}

function cameraFailureMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Camera access is blocked. Use the camera icon in your browser address bar to allow camera and microphone access, then try again.';
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return 'No available camera was found. Connect a camera or upload an MP4/WebM video instead.';
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return 'Your camera is busy in another app. Turn off the Loom camera bubble or close the other camera app, then try again—or upload a video instead.';
  return 'The camera could not start. Check browser permissions, close other camera apps, then try again or upload a video instead.';
}

async function requestCamera() {
  const video = { facingMode: { ideal: 'user' }, width: { ideal: 720, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 } };
  try {
    return await requestCameraStream({ video, audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    if (/timed out/i.test(error.message || '')) throw error;
    try { return await requestCameraStream({ video, audio: false }); }
    catch { throw error; }
  }
}

function showRecordedVideo(blob) {
  releasePreviewCheck();
  recordingReady = false;
  recordedVideo = blob;
  $('#submitReview').disabled = true;
  const preview = $('#recordedPreview');
  preview.pause();
  preview.removeAttribute('src');
  if (recordedObjectUrl) URL.revokeObjectURL(recordedObjectUrl);
  recordedObjectUrl = undefined;
  if (!blob?.size || blob.size > MAX_VIDEO_BYTES) {
    preview.hidden = true;
    showResult(blob?.size ? 'The video is larger than 4 MB. Choose a smaller MP4 or WebM file.' : 'The camera returned an empty recording. Try again or upload a video instead.', 'error');
    return;
  }
  recordedObjectUrl = URL.createObjectURL(blob);
  preview.hidden = false;
  preview.controls = true;
  preview.playsInline = true;
  preview.preload = 'metadata';
  $('.camera-stage').classList.remove('live');
  $('.camera-stage').classList.add('recorded');
  showResult('Recording kept on this page. Tap Play to check your video before continuing.', 'success');
  let timeout;
  let disposed = false;
  const inspect = () => {
    if (disposed || preview.readyState < 1) return;
    window.clearTimeout(timeout);
    if (!preview.videoWidth || !preview.videoHeight) {
      recordingReady = false;
      $('#submitReview').disabled = true;
      showResult('This file has no video track. Choose a recording that includes your camera picture.', 'error');
      return;
    }
    // Dimensions establish a video track. A dark frame or mobile preload delay
    // is not proof of a broken recording; the candidate and reviewer check it.
    recordingReady = true;
    $('#submitReview').disabled = submittingVideo || !verified;
    showResult(demoMode
      ? 'Demo video ready. Play it to check your picture, then complete the demo. Nothing will be uploaded.'
      : verified
      ? 'Video ready. Play it to check that your face and ID are visible, then save and continue.'
      : 'Video ready. Play it to check your picture. Confirm your email and complete the ID photo step before submitting.', 'success');
  };
  const failed = () => {
    if (disposed) return;
    window.clearTimeout(timeout);
    recordingReady = false;
    $('#submitReview').disabled = true;
    showResult('Your browser could not play this recording. It has been kept on this page. Try Play again, or upload an MP4 recorded with your phone’s Camera app.', 'error');
  };
  for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'playing']) preview.addEventListener(event, inspect);
  preview.addEventListener('error', failed);
  releasePreviewCheck = () => {
    disposed = true;
    window.clearTimeout(timeout);
    for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'playing']) preview.removeEventListener(event, inspect);
    preview.removeEventListener('error', failed);
  };
  timeout = window.setTimeout(() => {
    if (!disposed && !recordingReady) showResult('Your recording is still here. Tap Play in the preview to load it; you do not need to record again.', 'success');
  }, 8000);
  // Register handlers before loading, including for immediately cached metadata.
  preview.src = recordedObjectUrl;
  preview.load();
}

function visibleCameraHeight(video) {
  const sample = document.createElement('canvas');
  sample.width = 48;
  sample.height = 72;
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let blankRows = 0;
  for (let y = Math.floor(sample.height * 0.5); y < sample.height; y += 1) {
    let total = 0; let minimum = 255; let maximum = 0;
    for (let x = 0; x < sample.width; x += 1) {
      const offset = (y * sample.width + x) * 4;
      const brightness = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      total += brightness; minimum = Math.min(minimum, brightness); maximum = Math.max(maximum, brightness);
    }
    const blank = total / sample.width < 85 && maximum - minimum < 20;
    blankRows = blank ? blankRows + 1 : 0;
    if (blankRows >= 6) return Math.round(((y - blankRows + 1) / sample.height) * video.videoHeight);
  }
  return video.videoHeight;
}

function drawCleanFrame(video) {
  const canvas = $('#cameraCanvas');
  const sourceHeight = visibleHeight || video.videoHeight;
  const context = canvas.getContext('2d');
  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / sourceHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(video, 0, 0, video.videoWidth, sourceHeight, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
}

function startCleanPreview(video) {
  visibleHeight = video.videoHeight;
  let checks = 16;
  const render = () => {
    if (checks > 0) { const detected = visibleCameraHeight(video); if (detected < video.videoHeight * 0.9) visibleHeight = detected; checks -= 1; }
    drawCleanFrame(video);
    cameraFrame = requestAnimationFrame(render);
  };
  render();
}

async function requireVerifiedAccount() {
  verified = false;
  $('#startCamera').disabled = false;
  $('#submitReview').disabled = true;
  if (demoMode) {
    verified = true;
    $('#submitReview').disabled = submittingVideo || !recordingReady;
    $('#authStatus').textContent = 'Demo mode: your video is never uploaded';
    $('#authStatus').className = 'es-verified success';
    $('#startCamera').textContent = 'Turn on camera';
    $('#submitReview').innerHTML = 'Complete demo <span aria-hidden="true">→</span>';
    return;
  }
  const user = await window.getVerifiedCandidate();
  if (!user) {
    document.querySelector('#signInAgain').hidden = false;
    $('#authStatus').textContent = 'You can test your camera now. Sign in before sending your video.';
    $('#authStatus').className = 'es-verified';
    $('#startCamera').textContent = 'Test camera';
    return;
  }
  try {
    const state = await onboardingRequest('status');
    if (state.stage !== 'verification') { window.location.replace('./candidate-onboarding.html'); return; }
    reviewReference = state.reviewReference || '';
  } catch (error) {
    $('#authStatus').textContent = (['TimeoutError', 'AbortError'].includes(error?.name) ? 'The request took too long. Check your connection and try again. Your saved progress is kept.' : error.message) || 'Your saved ID photos could not be checked. Refresh to try again.';
    $('#authStatus').className = 'es-verified error';
    $('#retryAccount').hidden = false;
    return;
  }
  if (!REFERENCE_PATTERN.test(reviewReference)) {
    window.location.replace('./id-verification.html');
    return;
  }
  verified = true;
  $('#submitReview').disabled = submittingVideo || !recordingReady;
  $('#authStatus').textContent = `Signed in: ${user.email}`;
  $('#authStatus').className = 'es-verified success';
  $('#startCamera').textContent = 'Turn on camera';
}

$('#startCamera').addEventListener('click', async () => {
  const button = $('#startCamera');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { showResult('Video recording needs a modern browser over HTTPS.', 'error'); return; }
  button.textContent = 'Starting…'; button.disabled = true;
  try {
    stopCamera();
    cameraStream = await requestCamera();
    releasePreviewCheck();
    recordingReady = false;
    $('#submitReview').disabled = true;
    recordingHasAudio = cameraStream.getAudioTracks().length > 0;
    const video = $('#cameraPreview'); video.srcObject = cameraStream;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The camera did not start. Retry or upload a video instead.')), 15000);
      const ready = () => { clearTimeout(timeout); resolve(); };
      if (video.readyState >= 2) ready(); else video.addEventListener('loadeddata', ready, { once: true });
    });
    await video.play();
    $('#recordedPreview').hidden = true; $('#recordedPreview').removeAttribute('src'); $('#recordingScript').hidden = true;
    startCleanPreview(video); $('.camera-stage').classList.add('live'); $('.camera-stage').classList.remove('recorded');
    button.textContent = 'Camera on'; $('#recordId').disabled = false;
    showResult(recordingHasAudio
      ? 'Camera and microphone are ready. Follow the prompts and keep your ID in the frame.'
      : 'Camera is ready, but the microphone is unavailable. You can record silently, or allow microphone access and try again.', 'success');
  } catch (error) { stopCleanPreview(); stopCamera(); $('#recordId').disabled = true; button.textContent = verified ? 'Try camera again' : 'Test camera again'; button.disabled = false; showResult(cameraFailureMessage(error), 'error'); }
});

$('#recordId').addEventListener('click', () => {
  if (!cameraStream) { showResult('Turn on the camera before recording.', 'error'); return; }
  const video = $('#cameraPreview');
  if (!video.videoWidth) { showResult('The camera is still loading. Wait a moment, then try again.', 'error'); return; }
  const chunks = [];
  const script = [['PROMPT 1 OF 5', 'Say clearly: “My name is [your full name].”'], ['PROMPT 2 OF 5', 'Say clearly: “I am from [your city and province].”'], ['PROMPT 3 OF 5', 'Hold the front of your South African ID in the frame.'], ['PROMPT 4 OF 5', 'Tilt the ID gently left, then right, to reduce glare.'], ['PROMPT 5 OF 5', 'Hold the ID steady while we finish recording.']];
  const setScript = (index) => { $('#scriptStep').textContent = script[index][0]; $('#scriptText').textContent = script[index][1]; $('#recordingScript').hidden = false; };
  const mimeType = preferredRecorderType();
  const videoTrack = cameraStream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState !== 'live' || !videoTrack.enabled || videoTrack.muted) {
    showResult('The camera is not sending a picture. Turn it off, check the preview, and try again.', 'error');
    return;
  }
  try {
    recorder = new MediaRecorder(cameraStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1100000, audioBitsPerSecond: 96000 });
  } catch {
    showResult('This browser could not start recording. Upload an MP4 from your phone’s Camera app instead.', 'error');
    return;
  }
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', async () => {
    clearInterval(recordTimer); clearInterval(scriptTimer); stopCleanPreview();
    const candidateVideo = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    $('#recordingScript').hidden = true;
    $('#cameraPreview').srcObject = null;
    stopCamera();
    $('#startCamera').disabled = false;
    $('#startCamera').textContent = 'Retake video';
    $('#recordId').disabled = true;
    showRecordedVideo(candidateVideo);
  });
  let seconds = 10; let scriptIndex = 0; $('#recordId').disabled = true; $('#startCamera').disabled = true; $('#submitReview').disabled = true;
  try { recorder.start(); } catch { stopCamera(); $('#startCamera').disabled = false; $('#startCamera').textContent = 'Try camera again'; showResult('Recording could not start. Retry the camera or upload a video instead.', 'error'); return; }
  recorder.addEventListener('error', () => { if (recorder.state === 'recording') recorder.stop(); showResult('The recording was interrupted. Retry the camera or upload a video instead.', 'error'); });
  setScript(0); showResult(`Recording your ID video… ${seconds}s`, 'success');
  scriptTimer = setInterval(() => { scriptIndex += 1; if (scriptIndex < script.length) setScript(scriptIndex); }, 2000);
  recordTimer = setInterval(() => { seconds -= 1; if (seconds > 0) showResult(`Recording your ID video… ${seconds}s`, 'success'); }, 1000);
  window.setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 10000);
});

$('#videoUpload').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  const type = file?.type?.split(';')[0].toLowerCase() || '';
  if (!file || !['video/mp4', 'video/webm'].includes(type) || !file.size || file.size > MAX_VIDEO_BYTES) {
    input.value = '';
    showResult('Choose an MP4 or WebM video no larger than 4 MB.', 'error');
    return;
  }
  if (recorder?.state === 'recording') {
    input.value = '';
    showResult('Wait for the current recording to finish before choosing a file.', 'error');
    return;
  }
  clearInterval(recordTimer); clearInterval(scriptTimer); stopCleanPreview(); stopCamera();
  recordingHasAudio = false;
  $('#cameraPreview').srcObject = null; $('#recordingScript').hidden = true;
  $('.camera-stage').classList.remove('live'); $('.camera-stage').classList.add('recorded');
  $('#startCamera').disabled = false; $('#startCamera').textContent = 'Use camera'; $('#recordId').disabled = true;
  showRecordedVideo(file);
});

$('#submitReview').addEventListener('click', async () => {
  if (submittingVideo) return;
  if (!recordedVideo || !recordingReady) { showResult('Play your recorded video so the browser can check it before submitting.', 'error'); return; }
  if (demoMode) {
    if (pageParams.get('embedded') === '1' && window.parent !== window) window.parent.postMessage({ type: 'hirefromsa:camera-demo-complete' }, location.origin);
    else window.location.assign('./onboarding-demo.html');
    return;
  }
  submittingVideo = true;
  const button = $('#submitReview');
  button.disabled = true; button.textContent = 'Sending…';
  $('#videoUpload').disabled = true; $('#startCamera').disabled = true;
  showResult('Uploading your private review video…', 'success');
  try {
    const token = await window.getAccessToken();
    if (!token) throw new Error('Your sign-in expired. Sign in again, then retry.');
    const extension = recordedVideo.type.includes('mp4') ? 'mp4' : 'webm';
    const formData = new FormData();
    formData.append('video', recordedVideo, `south-africa-id.${extension}`); formData.append('reviewReference', reviewReference);
    const response = await fetch(REVIEW_ENDPOINT, { signal: AbortSignal.timeout(120000), method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'The video could not be sent.');
    window.location.assign('./candidate-onboarding.html');
  } catch (error) {
    button.innerHTML = 'Save video and continue <span aria-hidden="true">→</span>';
    showResult(['TimeoutError', 'AbortError'].includes(error?.name) ? 'The request took too long. Your recording is still here. Check your connection and retry.' : error.message || 'The video could not be sent. Please try again.', 'error');
  } finally {
    submittingVideo = false;
    button.disabled = !verified || !recordingReady;
    $('#videoUpload').disabled = false; $('#startCamera').disabled = false;
  }
});

window.addEventListener('beforeunload', () => {
  releasePreviewCheck();
  stopCamera();
  if (recordedObjectUrl) URL.revokeObjectURL(recordedObjectUrl);
});
if (!demoMode) window.savaAuth.auth.onAuthStateChange(() => { window.setTimeout(() => requireVerifiedAccount().catch(accountLoadFailed), 0); });
requireVerifiedAccount().catch(accountLoadFailed);

function accountLoadFailed(error) {
  const status = document.querySelector('#authStatus');
  status.textContent = error.message || 'Your account could not be checked. Retry to continue.';
  status.className = 'es-verified error';
  if (/sign.in|expired/i.test(error.message || '')) document.querySelector('#signInAgain').hidden = false;
  document.querySelector('#retryAccount').hidden = false;
}
document.querySelector('#retryAccount').onclick = async () => {
  const retry = document.querySelector('#retryAccount');
  retry.disabled = true;
  retry.hidden = true;
  try { await requireVerifiedAccount(); } catch (error) { accountLoadFailed(error); }
  finally { retry.disabled = false; }
};
