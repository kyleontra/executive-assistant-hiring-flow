const PROFILE_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-profile-photo';
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const form = document.querySelector('#profilePhotoForm');
const input = document.querySelector('#profilePhotoInput');
const preview = document.querySelector('#profilePhotoPreview');
const placeholder = document.querySelector('#photoPlaceholder');
const submitButton = document.querySelector('#saveProfilePhoto');
const authStatus = document.querySelector('#authStatus');
const result = document.querySelector('#photoResult');
const openCameraButton = document.querySelector('#openCamera');
const closeCameraButton = document.querySelector('#closeCamera');
const captureButton = document.querySelector('#capturePhoto');
const cameraPanel = document.querySelector('#cameraPanel');
const cameraPreview = document.querySelector('#cameraPreview');
const cameraCanvas = document.querySelector('#cameraCanvas');
const uploadProgress = document.querySelector('#headshotUploadProgress');
const pageParams = new URLSearchParams(window.location.search);
const demoMode = pageParams.get('demo') === '1';
const previewMode = demoMode || (['localhost', '127.0.0.1'].includes(window.location.hostname)
  && pageParams.get('preview') === '1');

let candidate = null;
let selectedPhoto = null;
let existingPhotoPath = '';
let cameraStream = null;
let previewUrl = '';

function showResult(message, type) {
  if (type === 'error' && /sign.in|expired/i.test(message)) document.querySelector('#signInAgain').hidden = false;
  result.textContent = message;
  result.hidden = false;
  result.className = `status-box ${type}`;
}

function setUploading(uploading) {
  uploadProgress.hidden = !uploading;
  form.setAttribute('aria-busy', String(uploading));
  input.disabled = uploading;
  openCameraButton.disabled = uploading;
}

function validPhoto(file) {
  return file && ALLOWED_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_PHOTO_BYTES;
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPanel.hidden = true;
}

function selectPhoto(file) {
  if (!validPhoto(file)) {
    selectedPhoto = null;
    submitButton.disabled = !existingPhotoPath;
    showResult('Choose a JPG, PNG, or WebP image no larger than 20 MB.', 'error');
    return false;
  }
  selectedPhoto = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  placeholder.hidden = true;
  submitButton.disabled = false;
  submitButton.innerHTML = 'Save photo and continue <span>→</span>';
  result.hidden = true;
  return true;
}

async function initialize() {
  candidate = previewMode ? { id: demoMode ? 'demo-candidate' : 'local-preview', email: demoMode ? 'demo@hirefromsa.com' : 'verified.candidate@example.com', user_metadata: {} } : await window.getVerifiedCandidate();
  if (!candidate) {
    document.querySelector('#signInAgain').hidden = false;
    authStatus.textContent = 'Your verified session is missing or has expired. Verify your email again to continue.';
    authStatus.className = 'status-box error';
    input.disabled = true;
    openCameraButton.disabled = true;
    return;
  }

  authStatus.textContent = demoMode ? 'Demo mode — your photo stays in this browser and will not be uploaded.' : `Email confirmed for ${candidate.email}.`;
  authStatus.className = 'status-box success';
  if (demoMode) {
    document.querySelector('.profile-aside h1').textContent = 'Test a profile photo.';
    document.querySelector('.profile-aside > p:last-of-type').textContent = 'Preview an upload or webcam photo locally. Employers will not see demo photos.';
  }
  if (previewMode) return;

  try {
    const { profile } = await window.savaPlatform.candidateRequest('getProfile');
    if (!profile?.resumePath) {
      window.location.replace('./candidate-resume.html?next=./candidate-profile.html');
      return;
    }
    if (profile.verificationBypass) {
      window.location.replace('./candidate-dashboard.html');
      return;
    }
    existingPhotoPath = profile?.photoPath || '';
    if (existingPhotoPath) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Continue with saved photo <span>→</span>';
      showResult('Your saved headshot is ready. Continue or choose a new photo.', 'success');
    }
  } catch (error) { accountLoadFailed(error); }
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (!selectPhoto(file)) input.value = '';
});

openCameraButton.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    showResult('This browser does not support webcam capture. Upload a photo instead.', 'error');
    return;
  }
  openCameraButton.disabled = true;
  try {
    cameraStream = await (await import('./camera-request.mjs')).requestCameraStream({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    cameraPreview.srcObject = cameraStream;
    cameraPanel.hidden = false;
    await cameraPreview.play();
    cameraPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    stopCamera();
    showResult(error?.name === 'NotAllowedError'
      ? 'Camera access was blocked. Allow camera access or upload a photo instead.'
      : 'The webcam could not start. Upload a photo instead.', 'error');
  } finally {
    openCameraButton.disabled = false;
  }
});

closeCameraButton.addEventListener('click', stopCamera);

captureButton.addEventListener('click', async () => {
  if (!cameraStream || !cameraPreview.videoWidth || !cameraPreview.videoHeight) {
    showResult('The camera is still starting. Try again in a moment.', 'error');
    return;
  }
  const sourceSize = Math.min(cameraPreview.videoWidth, cameraPreview.videoHeight);
  const sourceX = (cameraPreview.videoWidth - sourceSize) / 2;
  const sourceY = (cameraPreview.videoHeight - sourceSize) / 2;
  const context = cameraCanvas.getContext('2d');
  context.save();
  context.translate(cameraCanvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(
    cameraPreview,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    cameraCanvas.width,
    cameraCanvas.height,
  );
  context.restore();
  const blob = await new Promise((resolve) => cameraCanvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) {
    showResult('The webcam photo could not be captured. Try again.', 'error');
    return;
  }
  const file = new File([blob], 'webcam-headshot.jpg', { type: 'image/jpeg' });
  if (selectPhoto(file)) {
    input.value = '';
    stopCamera();
    showResult('Headshot captured. Save it to continue.', 'success');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!candidate || submitButton.disabled || (!selectedPhoto && !existingPhotoPath)) return;
  stopCamera();
  submitButton.disabled = true;
  submitButton.textContent = selectedPhoto ? 'Saving photo…' : 'Continuing…';
  setUploading(Boolean(selectedPhoto));
  try {
    if (selectedPhoto && !previewMode) {
      const photo = selectedPhoto.size > 4 * 1024 * 1024
        ? await (await import('./headshot-image.mjs')).prepareHeadshot(selectedPhoto)
        : selectedPhoto;
      const token = await window.getAccessToken();
      if (!token) throw new Error('Your sign-in expired. Verify your email again, then retry.');
      const data = new FormData();
      data.append('photo', photo, photo.name || 'profile-photo.jpg');
      const response = await fetch(PROFILE_ENDPOINT, { signal: AbortSignal.timeout(120000),
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Your profile photo could not be saved.');
    }
    showResult(demoMode ? 'Demo photo ready locally. Continuing…' : 'Profile photo saved. Continuing to the verification video…', 'success');
    window.setTimeout(() => window.location.assign(demoMode ? './id-verification.html?demo=1' : './candidate-onboarding.html'), 500);
  } catch (error) {
    setUploading(false);
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save photo and continue <span>→</span>';
    showResult(error instanceof TypeError
      ? 'The photo service could not be reached. Check your connection and try again.'
      : (['TimeoutError', 'AbortError'].includes(error?.name) ? 'The request took too long. Check your connection and try again. Your saved progress is kept.' : error.message) || 'Your profile photo could not be saved. Please try again.', 'error');
  }
});

window.addEventListener('beforeunload', () => {
  stopCamera();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
});

initialize().catch(accountLoadFailed);

function accountLoadFailed(error) {
  const status = document.querySelector('#authStatus');
  status.textContent = error.message || 'Your account could not be checked. Retry to continue.';
  status.className = 'status-box error';
  if (/sign.in|expired/i.test(error.message || '')) document.querySelector('#signInAgain').hidden = false;
  document.querySelector('#retryAccount').hidden = false;
}
document.querySelector('#retryAccount').onclick = async () => {
  const retry = document.querySelector('#retryAccount');
  retry.disabled = true;
  retry.hidden = true;
  try { await initialize(); } catch (error) { accountLoadFailed(error); }
  finally { retry.disabled = false; }
};
