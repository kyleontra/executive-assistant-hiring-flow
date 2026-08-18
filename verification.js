const REVIEW_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-id-video';
const pageParams = new URLSearchParams(window.location.search);
const reviewReference = pageParams.get('review');
const demoMode = pageParams.get('demo') === '1';
const REFERENCE_PATTERN = /^SA-[A-Z0-9]{8}$/;
let cameraStream;
let recorder;
let recordedVideo;
let recordedObjectUrl;
let recordTimer;
let scriptTimer;
let cameraFrame;
let visibleHeight;
let verified = false;

const $ = (selector) => document.querySelector(selector);

function showResult(message, type) {
  const target = $('#cameraResult');
  target.textContent = message;
  target.hidden = false;
  target.className = `status-box ${type}`;
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
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
}

async function recordedVideoHasPicture(blob) {
  if (!(blob instanceof Blob) || blob.size < 25000) return false;
  const preview = document.createElement('video');
  const sample = document.createElement('canvas');
  const objectUrl = URL.createObjectURL(blob);
  preview.muted = true;
  preview.playsInline = true;
  preview.preload = 'auto';
  preview.src = objectUrl;
  try {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Video preview timed out.')), 6000);
      preview.addEventListener('loadeddata', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      preview.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('Video preview failed.')); }, { once: true });
    });
    if (!preview.videoWidth || !preview.videoHeight) return false;
    if (Number.isFinite(preview.duration) && preview.duration > 0.5) {
      preview.currentTime = Math.min(1, preview.duration / 2);
      await new Promise((resolve) => preview.addEventListener('seeked', resolve, { once: true }));
    }
    sample.width = 64;
    sample.height = 36;
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(preview, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let brightnessTotal = 0;
    let brightest = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const brightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      brightnessTotal += brightness;
      brightest = Math.max(brightest, brightness);
    }
    return brightnessTotal / (pixels.length / 4) >= 8 || brightest >= 20;
  } catch {
    return false;
  } finally {
    preview.removeAttribute('src');
    URL.revokeObjectURL(objectUrl);
  }
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
    document.querySelector('.video-aside h1').textContent = 'Finish the demo.';
    document.querySelector('.video-aside > p').textContent = 'Record and preview a short test video locally. Demo recordings are never uploaded.';
    document.querySelector('.help-text').textContent = 'This recording stays in your browser and is discarded when you leave or restart the demo.';
    $('#authStatus').textContent = 'Demo mode — record and preview the full video locally. Nothing will be uploaded or added to the review queue.';
    $('#authStatus').className = 'status-box success';
    $('#startCamera').textContent = 'Turn on camera & microphone';
    $('#submitReview').innerHTML = 'Complete demo <span>→</span>';
    return;
  }
  if (!REFERENCE_PATTERN.test(reviewReference || '')) {
    $('#authStatus').textContent = 'You can test the camera and record a preview now. Complete the ID photo step before sending the video for review.';
    $('#authStatus').className = 'status-box';
    $('#startCamera').textContent = 'Test camera & microphone';
    return;
  }
  const user = await window.getVerifiedCandidate();
  if (!user) {
    $('#authStatus').textContent = 'You can test the camera now. Confirm your email before sending the video for review.';
    $('#authStatus').className = 'status-box';
    $('#startCamera').textContent = 'Test camera & microphone';
    return;
  }
  verified = true;
  $('#authStatus').textContent = `Email confirmed for ${user.email}. Your ID photo reference is ready.`;
  $('#authStatus').className = 'status-box success';
  $('#startCamera').textContent = 'Turn on camera & microphone';
}

$('#startCamera').addEventListener('click', async () => {
  const button = $('#startCamera');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { showResult('Video recording needs a modern browser over HTTPS.', 'error'); return; }
  button.textContent = 'Starting…'; button.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' }, width: { ideal: 720, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } });
    const video = $('#cameraPreview'); video.srcObject = cameraStream;
    await new Promise((resolve) => { if (video.readyState >= 2) resolve(); else video.addEventListener('loadeddata', resolve, { once: true }); });
    await video.play();
    $('#recordedPreview').hidden = true; $('#recordedPreview').removeAttribute('src'); $('#recordingScript').hidden = true;
    startCleanPreview(video); $('.camera-stage').classList.add('live'); $('.camera-stage').classList.remove('recorded');
    button.textContent = 'Camera on'; $('#recordId').disabled = false;
    showResult('When recording starts, follow the prompts and keep your ID in the frame.', 'success');
  } catch (_) { button.textContent = verified ? 'Turn on camera & microphone' : 'Test camera & microphone'; button.disabled = false; showResult('Camera permission was not granted or no camera is available. Check browser permissions and try again.', 'error'); }
});

$('#recordId').addEventListener('click', () => {
  if (!cameraStream) { showResult('Turn on the camera before recording.', 'error'); return; }
  const video = $('#cameraPreview');
  if (!video.videoWidth) { showResult('The camera is still loading. Wait a moment, then try again.', 'error'); return; }
  const chunks = [];
  const script = [['STEP 1 OF 5', 'Say clearly: “My name is [your full name].”'], ['STEP 2 OF 5', 'Say clearly: “I am from [your city and province].”'], ['STEP 3 OF 5', 'Hold the front of your South African ID in the frame.'], ['STEP 4 OF 5', 'Tilt the ID gently left, then right, to reduce glare.'], ['STEP 5 OF 5', 'Hold the ID steady while we finish recording.']];
  const setScript = (index) => { $('#scriptStep').textContent = script[index][0]; $('#scriptText').textContent = script[index][1]; $('#recordingScript').hidden = false; };
  const mimeType = preferredRecorderType();
  const videoTrack = cameraStream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState !== 'live' || !videoTrack.enabled || videoTrack.muted) {
    showResult('The camera is not sending a picture. Turn it off, check the preview, and try again.', 'error');
    return;
  }
  recorder = new MediaRecorder(cameraStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1100000, audioBitsPerSecond: 96000 });
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', async () => {
    clearInterval(recordTimer); clearInterval(scriptTimer); stopCleanPreview();
    const candidateVideo = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    $('#recordingScript').hidden = true;
    $('#cameraPreview').srcObject = null;
    stopCamera();
    const hasPicture = await recordedVideoHasPicture(candidateVideo);
    $('#startCamera').disabled = false;
    $('#startCamera').textContent = 'Turn camera back on';
    $('#recordId').disabled = true;
    if (!hasPicture) {
      recordedVideo = undefined;
      $('#submitReview').disabled = true;
      $('.camera-stage').classList.remove('live', 'recorded');
      showResult('That recording did not contain a visible picture. Turn the camera back on and record again.', 'error');
      return;
    }
    recordedVideo = candidateVideo;
    if (recordedObjectUrl) URL.revokeObjectURL(recordedObjectUrl);
    recordedObjectUrl = URL.createObjectURL(recordedVideo);
    const preview = $('#recordedPreview'); preview.src = recordedObjectUrl; preview.hidden = false;
    $('.camera-stage').classList.remove('live'); $('.camera-stage').classList.add('recorded');
    $('#submitReview').disabled = !verified;
    showResult(demoMode
      ? 'Demo video ready with picture and audio. Watch the preview, then complete the demo. Nothing will be uploaded.'
      : verified
      ? 'Video ready with picture and audio. Watch the preview, then send it for private manual review.'
      : 'Camera and recording are working. Complete the ID photo step before sending this video for review.', 'success');
  });
  let seconds = 10; let scriptIndex = 0; $('#recordId').disabled = true; $('#startCamera').disabled = true; $('#submitReview').disabled = true;
  recorder.start(); setScript(0); showResult(`Recording your ID video… ${seconds}s`, 'success');
  scriptTimer = setInterval(() => { scriptIndex += 1; if (scriptIndex < script.length) setScript(scriptIndex); }, 2000);
  recordTimer = setInterval(() => { seconds -= 1; if (seconds > 0) showResult(`Recording your ID video… ${seconds}s`, 'success'); }, 1000);
  window.setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 10000);
});

$('#submitReview').addEventListener('click', async () => {
  if (!recordedVideo) { showResult('Record your ID video before sending it for review.', 'error'); return; }
  if (demoMode) {
    const summaryValues = [...document.querySelectorAll('.summary-card b')];
    ['Demo session', 'Previewed locally', 'Previewed locally', 'Previewed locally', 'Not submitted'].forEach((value, index) => { if (summaryValues[index]) summaryValues[index].textContent = value; });
    $('#completePanel').querySelector('.eyebrow').textContent = 'DEMO COMPLETE';
    $('#completePanel').querySelector('h2').textContent = 'The full demo works.';
    $('#completePanel').querySelector('.lead').textContent = 'Your photos and video stayed in this browser. No account, application, or review submission was created.';
    $('#completeNextLink').href = './candidate-resume.html?demo=1&next=./candidate-experience.html%3Fdemo%3D1%26reset%3D1';
    $('#completeNextLink').innerHTML = 'Restart demo <span>→</span>';
    $('#recordPanel').hidden = true;
    $('#completePanel').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const token = await window.getAccessToken();
  if (!token) { showResult('Your sign-in expired. Confirm your email again, then retry.', 'error'); return; }
  const button = $('#submitReview'); const extension = recordedVideo.type.includes('mp4') ? 'mp4' : 'webm'; const formData = new FormData();
  formData.append('video', recordedVideo, `south-africa-id.${extension}`); formData.append('reviewReference', reviewReference);
  button.disabled = true; button.textContent = 'Sending…'; showResult('Uploading your private review video…', 'success');
  try {
    const response = await fetch(REVIEW_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }); const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'The video could not be sent.');
    const user = await window.getVerifiedCandidate(); $('#reviewReference').textContent = payload.reference; $('#summaryEmail').textContent = user?.email || 'Confirmed';
    const applyingJob = sessionStorage.getItem('sava-applying-job');
    const nextLink = $('#completeNextLink');
    if (applyingJob) nextLink.href = `./application-questions.html?job=${encodeURIComponent(applyingJob)}`;
    else { nextLink.href = './jobs.html'; nextLink.innerHTML = 'Browse jobs <span>→</span>'; }
    $('#recordPanel').hidden = true; $('#completePanel').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) { button.disabled = false; button.innerHTML = 'Send for review <span>→</span>'; showResult(error.message || 'The video could not be sent. Please try again.', 'error'); }
});

window.addEventListener('beforeunload', () => {
  stopCamera();
  if (recordedObjectUrl) URL.revokeObjectURL(recordedObjectUrl);
});
if (!demoMode) window.savaAuth.auth.onAuthStateChange(() => { window.setTimeout(requireVerifiedAccount, 0); });
requireVerifiedAccount();
