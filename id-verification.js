const PHOTO_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-id-photos';
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const ALLOWED_EXTENSIONS = /\.(?:jpe?g|png|webp|heic|heif)$/i;
const form = document.querySelector('#photoForm');
const submitButton = document.querySelector('#submitPhotos');
const result = document.querySelector('#photoResult');
const authStatus = document.querySelector('#authStatus');
const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
let verified = false;

function showResult(message, type) {
  result.textContent = message;
  result.hidden = false;
  result.className = `status-box ${type}`;
}

function validPhoto(input) {
  const file = input.files?.[0];
  const type = file?.type?.split(';')[0].toLowerCase() || '';
  return file && (ALLOWED_TYPES.has(type) || (!type && ALLOWED_EXTENSIONS.test(file.name))) && file.size > 0 && file.size <= MAX_PHOTO_BYTES;
}

function updateSubmit() {
  submitButton.disabled = !(verified && validPhoto(document.querySelector('#frontPhoto')) && validPhoto(document.querySelector('#backPhoto')) && document.querySelector('#photoConsent').checked);
}

function setPreview(input, preview) {
  const file = input.files?.[0];
  if (!file) return;
  if (!validPhoto(input)) { showResult('Use a JPG, PNG, WebP, HEIC, or HEIF photo no larger than 8 MB.', 'error'); input.value = ''; preview.hidden = true; updateSubmit(); return; }
  preview.onerror = () => {
    preview.hidden = true;
    showResult(`${file.name} is selected. This browser cannot preview that photo format, but it can still be uploaded.`, 'success');
  };
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  updateSubmit();
}

async function requireVerifiedAccount() {
  if (demoMode) {
    verified = true;
    document.querySelector('.upload-aside h1').textContent = 'Test ID photo previews.';
    document.querySelector('.upload-aside > p').textContent = 'Choose test images to check this step. Demo images remain in your browser.';
    authStatus.textContent = 'Demo mode — these ID previews stay in your browser and are never uploaded.';
    authStatus.className = 'status-box success';
    updateSubmit();
    return;
  }
  const user = await window.getVerifiedCandidate();
  if (!user) {
    verified = false;
    authStatus.textContent = 'Confirm your email first. Open the Supabase confirmation email, then return to this page.';
    authStatus.className = 'status-box error';
    updateSubmit();
    return;
  }
  let savedProfile = null;
  try {
    ({ profile: savedProfile } = await window.savaPlatform.candidateRequest('getProfile'));
    if (!savedProfile?.resumePath) {
      window.location.replace('./candidate-resume.html?next=./id-verification.html');
      return;
    }
    if (savedProfile.verificationBypass) {
      window.location.replace('./candidate-dashboard.html');
      return;
    }
    if (savedProfile?.photoPath) sessionStorage.setItem(`sava:profile-photo:${user.id}`, savedProfile.photoPath);
  } catch (error) {
    authStatus.textContent = error.message || 'Your profile could not be checked. Please refresh and try again.';
    authStatus.className = 'status-box error';
    return;
  }
  const profilePhotoPath = savedProfile?.photoPath;
  if (!profilePhotoPath) {
    window.location.replace('./candidate-profile.html');
    return;
  }
  verified = true;
  authStatus.textContent = `Email confirmed for ${user.email}. You can now add your ID photos.`;
  authStatus.className = 'status-box success';
  updateSubmit();
}

document.querySelector('#frontPhoto').addEventListener('change', (event) => setPreview(event.currentTarget, document.querySelector('#frontPreview')));
document.querySelector('#backPhoto').addEventListener('change', (event) => setPreview(event.currentTarget, document.querySelector('#backPreview')));
document.querySelector('#photoConsent').addEventListener('change', updateSubmit);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || submitButton.disabled) return;
  if (demoMode) {
    submitButton.disabled = true;
    showResult('Demo ID photos checked locally. Nothing was uploaded. Continuing to the video test…', 'success');
    window.setTimeout(() => window.location.assign('./verification.html?demo=1'), 500);
    return;
  }
  const token = await window.getAccessToken();
  if (!token) { showResult('Your sign-in expired. Confirm your email again, then retry.', 'error'); return; }
  const formData = new FormData();
  formData.append('front', document.querySelector('#frontPhoto').files[0]);
  formData.append('back', document.querySelector('#backPhoto').files[0]);
  const verifiedUser = await window.getVerifiedCandidate();
  formData.append('profilePhotoPath', verifiedUser ? sessionStorage.getItem(`sava:profile-photo:${verifiedUser.id}`) || '' : '');
  submitButton.disabled = true;
  submitButton.textContent = 'Saving photos…';
  try {
    const response = await fetch(PHOTO_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'The ID photos could not be saved.');
    sessionStorage.setItem(`sava:id-review:${verifiedUser.id}`, payload.reference);
    showResult('ID photos saved privately. Continuing to the video check…', 'success');
    window.location.assign(`./verification.html?review=${encodeURIComponent(payload.reference)}`);
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save ID photos and continue <span>→</span>';
    showResult(error.message || 'The ID photos could not be saved. Please try again.', 'error');
  }
});

if (!demoMode) window.savaAuth.auth.onAuthStateChange(() => { window.setTimeout(requireVerifiedAccount, 0); });
requireVerifiedAccount();
