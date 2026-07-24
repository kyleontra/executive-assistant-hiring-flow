const $ = (selector) => document.querySelector(selector);
const panels = [...document.querySelectorAll('[data-panel]')];
const steps = [...document.querySelectorAll('[data-step]')];
let cameraStream;
let recordedVideo;
let recorder;
let recordTimer;
let scriptTimer;
let captureStream;
let cameraFrame;
let visibleHeight;
const REVIEW_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-id-video';

function showStep(step) {
  panels.forEach((panel) => { panel.hidden = Number(panel.dataset.panel) !== step; });
  steps.forEach((item) => {
    const number = Number(item.dataset.step);
    item.classList.toggle('active', number === step);
    item.classList.toggle('complete', number < step);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showResult(target, message, type) {
  target.textContent = message;
  target.className = `result-box show ${type}`;
}

function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = undefined;
}

function preferredRecorderType() {
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
}

function visibleCameraHeight(video) {
  const sampleWidth = 48;
  const sampleHeight = 72;
  const sample = document.createElement('canvas');
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let consecutiveBlankRows = 0;
  for (let y = Math.floor(sampleHeight * 0.5); y < sampleHeight; y += 1) {
    let total = 0;
    let min = 255;
    let max = 0;
    for (let x = 0; x < sampleWidth; x += 1) {
      const offset = (y * sampleWidth + x) * 4;
      const brightness = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      total += brightness;
      min = Math.min(min, brightness);
      max = Math.max(max, brightness);
    }
    const isBlank = total / sampleWidth < 85 && max - min < 20;
    consecutiveBlankRows = isBlank ? consecutiveBlankRows + 1 : 0;
    if (consecutiveBlankRows >= 6) return Math.round(((y - consecutiveBlankRows + 1) / sampleHeight) * video.videoHeight);
  }
  return video.videoHeight;
}

function drawCleanCameraFrame(video) {
  const canvas = $('#cameraCanvas');
  const width = canvas.width;
  const height = canvas.height;
  const sourceHeight = visibleHeight || video.videoHeight;
  const context = canvas.getContext('2d');
  const scale = Math.max(width / video.videoWidth, height / sourceHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(video, 0, 0, video.videoWidth, sourceHeight, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function startCleanPreview(video) {
  visibleHeight = video.videoHeight;
  let checksRemaining = 16;
  const render = () => {
    if (checksRemaining > 0) {
      const detectedHeight = visibleCameraHeight(video);
      if (detectedHeight < video.videoHeight * 0.9) visibleHeight = detectedHeight;
      checksRemaining -= 1;
    }
    drawCleanCameraFrame(video);
    cameraFrame = requestAnimationFrame(render);
  };
  render();
}

function stopCleanPreview() {
  cancelAnimationFrame(cameraFrame);
  cameraFrame = undefined;
}

function isInSouthAfrica(position) {
  const { latitude, longitude } = position.coords;
  return latitude >= -35.2 && latitude <= -22.0 && longitude >= 16.0 && longitude <= 33.2;
}

if (new URLSearchParams(window.location.search).get('test') === 'video') showStep(2);

$('#checkLocation').addEventListener('click', () => {
  const button = $('#checkLocation');
  const result = $('#locationResult');
  if (!navigator.geolocation) {
    showResult(result, 'This browser does not support location checks. Use a supported browser or contact support.', 'error');
    return;
  }
  button.textContent = 'Checking…';
  button.disabled = true;
  navigator.geolocation.getCurrentPosition((position) => {
    button.textContent = 'Check location';
    button.disabled = false;
    if (isInSouthAfrica(position)) {
      showResult(result, 'Location check passed. Your approximate coordinates appear to be in South Africa.', 'success');
      $('#locationNext').disabled = false;
    } else {
      showResult(result, 'Location check could not confirm that you are in South Africa. This test cannot continue from outside the country.', 'error');
    }
  }, (error) => {
    button.textContent = 'Check location';
    button.disabled = false;
    showResult(result, error.code === 1 ? 'Location permission was not granted. Allow location access to continue.' : 'We could not determine your location. Check your device settings and try again.', 'error');
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
});

$('#locationNext').addEventListener('click', () => showStep(2));

$('#startCamera').addEventListener('click', async () => {
  const button = $('#startCamera');
  const result = $('#cameraResult');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showResult(result, 'Video recording needs a modern browser over HTTPS.', 'error');
    return;
  }

  button.textContent = 'Starting…';
  button.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 720, max: 960 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const video = $('#cameraPreview');
    video.srcObject = cameraStream;
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.addEventListener('loadeddata', resolve, { once: true });
    });
    const preview = $('#recordedPreview');
    preview.hidden = true;
    preview.removeAttribute('src');
    $('#recordingScript').hidden = true;
    startCleanPreview(video);
    $('.camera-stage').classList.remove('recorded');
    $('.camera-stage').classList.add('live');
    button.textContent = 'Camera on';
    $('#recordId').disabled = false;
    showResult(result, 'When recording starts, say your name and where you are from, then follow the ID prompts.', 'success');
  } catch (error) {
    button.textContent = 'Turn on camera';
    button.disabled = false;
    showResult(result, 'Camera permission was not granted or no camera is available. Check browser permission settings and try again.', 'error');
  }
});

$('#recordId').addEventListener('click', () => {
  const result = $('#cameraResult');
  const recordButton = $('#recordId');
  const startButton = $('#startCamera');
  if (!cameraStream) {
    showResult(result, 'Turn the camera on before recording.', 'error');
    return;
  }
  const video = $('#cameraPreview');
  if (!video.videoWidth || !video.videoHeight) {
    showResult(result, 'The camera is still loading. Wait a moment, then record the video.', 'error');
    return;
  }

  const chunks = [];
  const script = [
    ['STEP 1 OF 5', 'Say clearly: “My name is [your full name].”'],
    ['STEP 2 OF 5', 'Say clearly: “I am from [your city and province].”'],
    ['STEP 3 OF 5', 'Hold the front of your South African ID inside the frame.'],
    ['STEP 4 OF 5', 'Tilt the ID gently left, then right, to reduce glare.'],
    ['STEP 5 OF 5', 'Hold the ID steady while we finish the recording.'],
  ];
  const scriptBox = $('#recordingScript');
  const setScript = (index) => {
    $('#scriptStep').textContent = script[index][0];
    $('#scriptText').textContent = script[index][1];
    scriptBox.hidden = false;
  };
  const mimeType = preferredRecorderType();
  captureStream = $('#cameraCanvas').captureStream(24);
  cameraStream.getAudioTracks().forEach((track) => captureStream.addTrack(track));
  recorder = new MediaRecorder(captureStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 750000, audioBitsPerSecond: 96000 });
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', () => {
    clearInterval(recordTimer);
    clearInterval(scriptTimer);
    stopCleanPreview();
    captureStream?.getTracks().forEach((track) => track.stop());
    recordedVideo = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const preview = $('#recordedPreview');
    preview.src = URL.createObjectURL(recordedVideo);
    preview.hidden = false;
    scriptBox.hidden = true;
    $('#cameraPreview').srcObject = null;
    $('.camera-stage').classList.remove('live');
    $('.camera-stage').classList.add('recorded');
    stopCamera();
    recordButton.textContent = 'Record again';
    recordButton.disabled = false;
    startButton.disabled = false;
    $('#submitReview').disabled = false;
    showResult(result, 'Video ready. Watch the preview, then send it for manual review.', 'success');
  });

  let seconds = 10;
  recordButton.disabled = true;
  startButton.disabled = true;
  $('#submitReview').disabled = true;
  recorder.start();
  setScript(0);
  showResult(result, `Recording your ID video… ${seconds}s`, 'success');
  let scriptIndex = 0;
  scriptTimer = setInterval(() => {
    scriptIndex += 1;
    if (scriptIndex < script.length) setScript(scriptIndex);
  }, 2000);
  recordTimer = setInterval(() => {
    seconds -= 1;
    if (seconds > 0) showResult(result, `Recording your ID video… ${seconds}s`, 'success');
  }, 1000);
  window.setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 10000);
});

$('#submitReview').addEventListener('click', async () => {
  const button = $('#submitReview');
  const result = $('#cameraResult');
  if (!recordedVideo) {
    showResult(result, 'Record your ID video before sending it for review.', 'error');
    return;
  }
  const extension = recordedVideo.type.includes('mp4') ? 'mp4' : 'webm';
  const formData = new FormData();
  formData.append('video', recordedVideo, `south-africa-id.${extension}`);
  button.disabled = true;
  button.textContent = 'Sending…';
  showResult(result, 'Uploading your encrypted review video…', 'success');
  try {
    const response = await fetch(REVIEW_ENDPOINT, { method: 'POST', body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'The video could not be sent.');
    $('#reviewReference').textContent = payload.reference;
    $('#completeProfile').href = `./candidate-signup.html?review=${encodeURIComponent(payload.reference)}`;
    showResult(result, 'Your video was sent to the manual review queue.', 'success');
    showStep(3);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = 'Send for review <span>→</span>';
    showResult(result, error.message || 'The video could not be sent. Please try again.', 'error');
  }
});
