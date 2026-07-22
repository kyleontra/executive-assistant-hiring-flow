const $ = (selector) => document.querySelector(selector);
const panels = [...document.querySelectorAll('[data-panel]')];
const steps = [...document.querySelectorAll('[data-step]')];
let cameraStream;

function showStep(step) {
  panels.forEach(panel => panel.hidden = Number(panel.dataset.panel) !== step);
  steps.forEach(item => { const number = Number(item.dataset.step); item.classList.toggle('active', number === step); item.classList.toggle('complete', number < step); });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showResult(target, message, type) { target.textContent = message; target.className = `result-box show ${type}`; }
function isInSouthAfrica(position) { const { latitude, longitude } = position.coords; return latitude >= -35.2 && latitude <= -22.0 && longitude >= 16.0 && longitude <= 33.2; }
function luhnIsValid(value) { let sum = 0; let doubled = false; for (let i = value.length - 1; i >= 0; i--) { let digit = Number(value[i]); if (doubled) { digit *= 2; if (digit > 9) digit -= 9; } sum += digit; doubled = !doubled; } return sum % 10 === 0; }
function findIdNumber(text) { const matches = text.match(/(?:\d[\s-]?){13}/g) || []; return matches.map(match => match.replace(/\D/g, '')).find(match => match.length === 13) || null; }

$('#checkLocation').addEventListener('click', () => {
  const button = $('#checkLocation'); const result = $('#locationResult');
  if (!navigator.geolocation) { showResult(result, 'This browser does not support location checks. Use a supported browser or contact support.', 'error'); return; }
  button.textContent = 'Checking…'; button.disabled = true;
  navigator.geolocation.getCurrentPosition(position => {
    button.textContent = 'Check location'; button.disabled = false;
    if (isInSouthAfrica(position)) { showResult(result, 'Location check passed. Your approximate coordinates appear to be in South Africa.', 'success'); $('#locationNext').disabled = false; }
    else showResult(result, 'Location check could not confirm that you are in South Africa. This test cannot continue from outside the country.', 'error');
  }, error => { button.textContent = 'Check location'; button.disabled = false; showResult(result, error.code === 1 ? 'Location permission was not granted. Allow location access to continue.' : 'We could not determine your location. Check your device settings and try again.', 'error'); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
});
$('#locationNext').addEventListener('click', () => showStep(2));

$('#startCamera').addEventListener('click', async () => {
  const button = $('#startCamera'); const result = $('#cameraResult');
  if (!navigator.mediaDevices?.getUserMedia) { showResult(result, 'Camera access needs HTTPS or localhost in a modern browser.', 'error'); return; }
  button.textContent = 'Starting…'; button.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const video = $('#cameraPreview'); video.srcObject = cameraStream; $('.camera-stage').classList.add('live');
    button.textContent = 'Camera on'; $('#captureId').disabled = false;
    showResult(result, 'Place the whole front of your ID inside the frame, then take the photo.', 'success');
  } catch (error) { button.textContent = 'Turn on camera'; button.disabled = false; showResult(result, 'Camera permission was not granted or no camera is available. Check browser permission settings and try again.', 'error'); }
});

$('#captureId').addEventListener('click', async () => {
  const result = $('#cameraResult'); const video = $('#cameraPreview'); const canvas = $('#idCanvas'); const button = $('#captureId');
  if (!cameraStream || !window.Tesseract) { showResult(result, 'The camera or ID text reader is not ready. Try turning the camera on again.', 'error'); return; }
  if (!video.videoWidth || !video.videoHeight) { showResult(result, 'The camera is still loading. Wait a moment, then take the ID photo.', 'error'); return; }
  canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  button.textContent = 'Checking ID…'; button.disabled = true; $('#startCamera').disabled = true;
  showResult(result, 'Reading South African ID text from the photo…', 'success');
  try {
    const ocr = await Tesseract.recognize(canvas, 'eng', { logger: status => { if (status.status === 'recognizing text') showResult(result, `Reading ID text ${Math.round(status.progress * 100)}%…`, 'success'); } });
    const rawText = ocr.data.text || ''; const text = rawText.replace(/\s+/g, ' ').toUpperCase();
    const hasSouthAfricaText = /REPUBLIC\s+OF\s+SOUTH\s+AFRICA|SOUTH\s+AFRICA|IDENTITY\s+(CARD|DOCUMENT)/.test(text);
    const idNumber = findIdNumber(rawText); const passed = hasSouthAfricaText && Boolean(idNumber) && luhnIsValid(idNumber);
    if (passed) { showResult(result, 'South African ID test passed. Required document text and a valid 13-digit ID number were detected.', 'success'); $('#cameraNext').disabled = false; }
    else { showResult(result, 'ID test did not pass. Use a brighter, sharper photo with the full front of the ID visible, then try again.', 'error'); button.textContent = 'Take ID photo'; button.disabled = false; $('#startCamera').disabled = false; }
  } catch (error) { showResult(result, 'We could not read the ID photo. Check focus and lighting, then take another photo.', 'error'); button.textContent = 'Take ID photo'; button.disabled = false; $('#startCamera').disabled = false; }
});
$('#cameraNext').addEventListener('click', () => { if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); showStep(3); });
