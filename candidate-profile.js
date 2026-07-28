const PROFILE_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-profile-photo';
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const form = document.querySelector('#profilePhotoForm');
const input = document.querySelector('#profilePhotoInput');
const preview = document.querySelector('#profilePhotoPreview');
const placeholder = document.querySelector('#photoPlaceholder');
const submitButton = document.querySelector('#saveProfilePhoto');
const authStatus = document.querySelector('#authStatus');
const result = document.querySelector('#photoResult');
const previewMode = ['localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).get('preview') === '1';
let candidate = null;

function showResult(message, type) {
  result.textContent = message;
  result.hidden = false;
  result.className = `status-box ${type}`;
}

function validPhoto(file) {
  return file && ALLOWED_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_PHOTO_BYTES;
}

async function initialize() {
  candidate = previewMode ? { id: 'local-preview', email: 'verified.candidate@example.com' } : await window.getVerifiedCandidate();
  if (!candidate) {
    authStatus.textContent = 'Your verified session is missing or has expired. Verify your email again to continue.';
    authStatus.className = 'status-box error';
    input.disabled = true;
    return;
  }
  authStatus.textContent = `Email confirmed for ${candidate.email}.`;
  authStatus.className = 'status-box success';
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (!validPhoto(file)) {
    input.value = '';
    preview.hidden = true;
    placeholder.hidden = false;
    submitButton.disabled = true;
    showResult('Choose a JPG, PNG, or WebP image no larger than 4 MB.', 'error');
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  placeholder.hidden = true;
  submitButton.disabled = false;
  result.hidden = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = input.files?.[0];
  if (!candidate || !validPhoto(file) || submitButton.disabled) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Saving photo…';
  try {
    let path = 'candidate-profiles/local-preview/profile';
    if (!previewMode) {
      const token = await window.getAccessToken();
      if (!token) throw new Error('Your sign-in expired. Verify your email again, then retry.');
      const data = new FormData();
      data.append('photo', file, file.name || 'profile-photo');
      const response = await fetch(PROFILE_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: data });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Your profile photo could not be saved.');
      path = payload.path;
    }
    sessionStorage.setItem(`sava:profile-photo:${candidate.id}`, path);
    showResult('Profile photo saved. Continuing to your ID photos…', 'success');
    window.setTimeout(() => window.location.assign('./id-verification.html'), 650);
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save photo and continue <span>→</span>';
    showResult(error.message || 'Your profile photo could not be saved. Please try again.', 'error');
  }
});

initialize();
