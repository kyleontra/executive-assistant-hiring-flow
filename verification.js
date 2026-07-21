const $ = (selector) => document.querySelector(selector);
const panels = [...document.querySelectorAll('[data-panel]')];
const steps = [...document.querySelectorAll('[data-step]')];
let cameraStream;

function showStep(step) {
  panels.forEach(panel => panel.hidden = Number(panel.dataset.panel) !== step);
  steps.forEach(item => { const number = Number(item.dataset.step); item.classList.toggle('active', number === step); item.classList.toggle('complete', number < step); });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showResult(target, message, type) {
  target.textContent = message;
  target.className = `result-box show ${type}`;
}
function isInSouthAfrica(position) {
  const { latitude, longitude } = position.coords;
  return latitude >= -35.2 && latitude <= -22.0 && longitude >= 16.0 && longitude <= 33.2;
}

$('#checkLocation').addEventListener('click', () => {
  const button = $('#checkLocation');
  const result = $('#locationResult');
  if (!navigator.geolocation) { showResult(result, 'This browser does not support location checks. Use a supported browser or contact support.', 'error'); return; }
  button.textContent = 'Checking…'; button.disabled = true;
  navigator.geolocation.getCurrentPosition(
    position => {
      button.textContent = 'Check location'; button.disabled = false;
      if (isInSouthAfrica(position)) {
        showResult(result, 'Location check passed. Your approximate coordinates appear to be in South Africa.', 'success');
        $('#summaryLocation').textContent = 'Verified in South Africa';
        $('#locationNext').disabled = false;
      } else {
        showResult(result, 'Location check could not confirm that you are in South Africa. This demo does not allow you to continue from outside the country.', 'error');
      }
    },
    error => {
      button.textContent = 'Check location'; button.disabled = false;
      showResult(result, error.code === 1 ? 'Location permission was not granted. Allow location access to continue.' : 'We could not determine your location. Check your device settings and try again.', 'error');
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
  );
});
$('#locationNext').addEventListener('click', () => showStep(2));

$('#startCamera').addEventListener('click', async () => {
  const button = $('#startCamera');
  const result = $('#cameraResult');
  if (!navigator.mediaDevices?.getUserMedia) { showResult(result, 'Camera access needs HTTPS or localhost in a modern browser. This direct-file demo cannot start a camera on every browser.', 'error'); return; }
  button.textContent = 'Starting…'; button.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = $('#cameraPreview');
    video.srcObject = cameraStream;
    $('.camera-stage').classList.add('live');
    showResult(result, 'Camera check completed. This preview is live only and no image has been saved.', 'success');
    button.textContent = 'Camera on';
    $('#cameraNext').disabled = false;
  } catch (error) {
    button.textContent = 'Turn on camera'; button.disabled = false;
    showResult(result, 'Camera permission was not granted or no camera is available. Check browser permission settings and try again.', 'error');
  }
});
$('#cameraNext').addEventListener('click', () => {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  showStep(3);
});
