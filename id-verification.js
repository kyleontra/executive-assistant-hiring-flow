const PHOTO_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-id-photos';
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const form = document.querySelector('#photoForm');
const submitButton = document.querySelector('#submitPhotos');
const result = document.querySelector('#photoResult');
const authStatus = document.querySelector('#authStatus');
let verified = false;

function showResult(message, type) {
  result.textContent = message;
  result.hidden = false;
  result.className = `status-box ${type}`;
}

function validPhoto(input) {
  const file = input.files?.[0];
  return file && ALLOWED_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_PHOTO_BYTES;
}

function updateSubmit() {
  submitButton.disabled = !(verified && validPhoto(document.querySelector('#frontPhoto')) && validPhoto(document.querySelector('#backPhoto')) && document.querySelector('#photoConsent').checked);
}

function setPreview(input, preview) {
  const file = input.files?.[0];
  if (!file) return;
  if (!validPhoto(input)) { showResult('Use a JPG, PNG, or WebP photo no larger than 4 MB.', 'error'); input.value = ''; preview.hidden = true; updateSubmit(); return; }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  updateSubmit();
}

async function requireVerifiedAccount() {
  const user = await window.getVerifiedCandidate();
  if (!user) {
    verified = false;
    authStatus.textContent = 'Confirm your email first. Open the Supabase confirmation email, then return to this page.';
    authStatus.className = 'status-box error';
    updateSubmit();
    return;
  }
  let experiences = [];
  try {
    experiences = JSON.parse(sessionStorage.getItem(`sava:experience:${user.id}`) || '[]');
  } catch {
    experiences = [];
  }
  let savedProfile = null;
  if (!experiences.length) {
    try {
      ({ profile: savedProfile } = await window.savaPlatform.candidateRequest('getProfile'));
      if (savedProfile?.experience?.length) {
        experiences = savedProfile.experience;
        sessionStorage.setItem(`sava:experience:${user.id}`, JSON.stringify(experiences));
      }
    } catch { /* Existing redirects below explain which profile step is missing. */ }
  }
  if (!Array.isArray(experiences) || experiences.length === 0) {
    window.location.replace('./candidate-experience.html');
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
  const token = await window.getAccessToken();
  if (!token) { showResult('Your sign-in expired. Confirm your email again, then retry.', 'error'); return; }
  const formData = new FormData();
  formData.append('front', document.querySelector('#frontPhoto').files[0]);
  formData.append('back', document.querySelector('#backPhoto').files[0]);
  submitButton.disabled = true;
  submitButton.textContent = 'Saving photos…';
  try {
    const response = await fetch(PHOTO_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'The ID photos could not be saved.');
    showResult('ID photos saved privately. Continuing to the video check…', 'success');
    window.location.assign(`./verification.html?review=${encodeURIComponent(payload.reference)}`);
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save ID photos and continue <span>→</span>';
    showResult(error.message || 'The ID photos could not be saved. Please try again.', 'error');
  }
});

window.savaAuth.auth.onAuthStateChange(() => { window.setTimeout(requireVerifiedAccount, 0); });
requireVerifiedAccount();
