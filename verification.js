const $ = (selector) => document.querySelector(selector);
const panels = [...document.querySelectorAll('[data-panel]')];
const steps = [...document.querySelectorAll('[data-step]')];
let cameraStream;
let recordedVideo;
let recorder;
let recordTimer;
const REVIEW_ENDPOINT = 'https://lwzietvhuxgelwehpjag.supabase.co/functions/v1/submit-id-video';

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

function isInSouthAfrica(position) {
  const { latitude, longitude } = position.coords;
  return latitude >= -35.2 && latitude <= -22.0 && longitude >= 16.0 && longitude <= 33.2;
}

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
      audio: false,
    });
    const video = $('#cameraPreview');
    video.srcObject = cameraStream;
    $('#recordedPreview').hidden = true;
    $('.camera-stage').classList.add('live');
    button.textContent = 'Camera on';
    $('#recordId').disabled = false;
    showResult(result, 'Hold the full front of your ID in the frame, then record a five-second video.', 'success');
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

  const chunks = [];
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
  recorder = new MediaRecorder(cameraStream, { mimeType, videoBitsPerSecond: 750000 });
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', () => {
    clearInterval(recordTimer);
    recordedVideo = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const preview = $('#recordedPreview');
    preview.src = URL.createObjectURL(recordedVideo);
    preview.hidden = false;
    $('#cameraPreview').srcObject = null;
    $('.camera-stage').classList.remove('live');
    stopCamera();
    recordButton.textContent = 'Record again';
    recordButton.disabled = false;
    startButton.disabled = false;
    $('#submitReview').disabled = false;
    showResult(result, 'Video ready. Watch the preview, then send it for manual review.', 'success');
  });

  let seconds = 5;
  recordButton.disabled = true;
  startButton.disabled = true;
  $('#submitReview').disabled = true;
  recorder.start();
  showResult(result, `Recording your ID video… ${seconds}s`, 'success');
  recordTimer = setInterval(() => {
    seconds -= 1;
    if (seconds > 0) showResult(result, `Recording your ID video… ${seconds}s`, 'success');
  }, 1000);
  window.setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 5000);
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
    showResult(result, 'Your video was sent to the manual review queue.', 'success');
    showStep(3);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = 'Send for review <span>→</span>';
    showResult(result, error.message || 'The video could not be sent. Please try again.', 'error');
  }
});
