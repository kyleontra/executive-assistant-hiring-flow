const REVIEW_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-id-video';
const reviewReference = new URLSearchParams(window.location.search).get('review');
const REFERENCE_PATTERN = /^SA-[A-Z0-9]{8}$/;
let cameraStream;
let captureStream;
let recorder;
let recordedVideo;
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
  if (!REFERENCE_PATTERN.test(reviewReference || '')) {
    $('#authStatus').textContent = 'This video step needs the ID-photo reference. Return to the ID photo step and continue from there.';
    $('#authStatus').className = 'status-box error';
    return;
  }
  const user = await window.getVerifiedCandidate();
  if (!user) {
    $('#authStatus').textContent = 'Confirm your email before recording your ID video.';
    $('#authStatus').className = 'status-box error';
    return;
  }
  verified = true;
  $('#authStatus').textContent = `Email confirmed for ${user.email}. Your ID photo reference is ready.`;
  $('#authStatus').className = 'status-box success';
  $('#startCamera').disabled = false;
}

$('#startCamera').addEventListener('click', async () => {
  if (!verified) return;
  const button = $('#startCamera');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { showResult('Video recording needs a modern browser over HTTPS.', 'error'); return; }
  button.textContent = 'Starting…'; button.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 720, max: 960 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } });
    const video = $('#cameraPreview'); video.srcObject = cameraStream;
    await new Promise((resolve) => { if (video.readyState >= 2) resolve(); else video.addEventListener('loadeddata', resolve, { once: true }); });
    $('#recordedPreview').hidden = true; $('#recordedPreview').removeAttribute('src'); $('#recordingScript').hidden = true;
    startCleanPreview(video); $('.camera-stage').classList.add('live'); $('.camera-stage').classList.remove('recorded');
    button.textContent = 'Camera on'; $('#recordId').disabled = false;
    showResult('When recording starts, follow the prompts and keep your ID in the frame.', 'success');
  } catch (_) { button.textContent = 'Turn on camera & microphone'; button.disabled = false; showResult('Camera permission was not granted or no camera is available. Check browser permissions and try again.', 'error'); }
});

$('#recordId').addEventListener('click', () => {
  if (!cameraStream) { showResult('Turn on the camera before recording.', 'error'); return; }
  const video = $('#cameraPreview');
  if (!video.videoWidth) { showResult('The camera is still loading. Wait a moment, then try again.', 'error'); return; }
  const chunks = [];
  const script = [['STEP 1 OF 5', 'Say clearly: “My name is [your full name].”'], ['STEP 2 OF 5', 'Say clearly: “I am from [your city and province].”'], ['STEP 3 OF 5', 'Hold the front of your South African ID in the frame.'], ['STEP 4 OF 5', 'Tilt the ID gently left, then right, to reduce glare.'], ['STEP 5 OF 5', 'Hold the ID steady while we finish recording.']];
  const setScript = (index) => { $('#scriptStep').textContent = script[index][0]; $('#scriptText').textContent = script[index][1]; $('#recordingScript').hidden = false; };
  const mimeType = preferredRecorderType();
  captureStream = $('#cameraCanvas').captureStream(24); cameraStream.getAudioTracks().forEach((track) => captureStream.addTrack(track));
  recorder = new MediaRecorder(captureStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 750000, audioBitsPerSecond: 96000 });
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', () => {
    clearInterval(recordTimer); clearInterval(scriptTimer); stopCleanPreview(); captureStream?.getTracks().forEach((track) => track.stop());
    recordedVideo = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const preview = $('#recordedPreview'); preview.src = URL.createObjectURL(recordedVideo); preview.hidden = false; $('#recordingScript').hidden = true; $('#cameraPreview').srcObject = null;
    $('.camera-stage').classList.remove('live'); $('.camera-stage').classList.add('recorded'); stopCamera();
    $('#recordId').textContent = 'Record again'; $('#recordId').disabled = false; $('#startCamera').disabled = false; $('#submitReview').disabled = false;
    showResult('Video ready. Watch the preview, then send it for private manual review.', 'success');
  });
  let seconds = 10; let scriptIndex = 0; $('#recordId').disabled = true; $('#startCamera').disabled = true; $('#submitReview').disabled = true;
  recorder.start(); setScript(0); showResult(`Recording your ID video… ${seconds}s`, 'success');
  scriptTimer = setInterval(() => { scriptIndex += 1; if (scriptIndex < script.length) setScript(scriptIndex); }, 2000);
  recordTimer = setInterval(() => { seconds -= 1; if (seconds > 0) showResult(`Recording your ID video… ${seconds}s`, 'success'); }, 1000);
  window.setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 10000);
});

$('#submitReview').addEventListener('click', async () => {
  if (!recordedVideo) { showResult('Record your ID video before sending it for review.', 'error'); return; }
  const token = await window.getAccessToken();
  if (!token) { showResult('Your sign-in expired. Confirm your email again, then retry.', 'error'); return; }
  const button = $('#submitReview'); const extension = recordedVideo.type.includes('mp4') ? 'mp4' : 'webm'; const formData = new FormData();
  formData.append('video', recordedVideo, `south-africa-id.${extension}`); formData.append('reviewReference', reviewReference);
  button.disabled = true; button.textContent = 'Sending…'; showResult('Uploading your private review video…', 'success');
  try {
    const response = await fetch(REVIEW_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }); const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'The video could not be sent.');
    const user = await window.getVerifiedCandidate(); $('#reviewReference').textContent = payload.reference; $('#summaryEmail').textContent = user?.email || 'Confirmed'; $('#recordPanel').hidden = true; $('#completePanel').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) { button.disabled = false; button.innerHTML = 'Send for review <span>→</span>'; showResult(error.message || 'The video could not be sent. Please try again.', 'error'); }
});

window.addEventListener('beforeunload', stopCamera);
window.savaAuth.auth.onAuthStateChange(() => { window.setTimeout(requireVerifiedAccount, 0); });
requireVerifiedAccount();
