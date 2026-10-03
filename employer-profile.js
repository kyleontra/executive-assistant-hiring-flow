// Employer My Profile. Example build: values save to this browser (localStorage) until the
// backend has fields for them. Name, company and email prefill from the signed-in account.
const EP_KEY = 'hirefromsa:employer-profile';

function epRead() {
  try { return JSON.parse(localStorage.getItem(EP_KEY) || '{}') || {}; } catch { return {}; }
}
function epWrite(patch) {
  const next = { ...epRead(), ...patch };
  try { localStorage.setItem(EP_KEY, JSON.stringify(next)); } catch { /* Storage full or blocked: keep the page usable. */ }
  return next;
}
function epInitials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SA';
}

function epRenderPhoto(saved) {
  const holder = document.querySelector('#epPhoto');
  holder.replaceChildren();
  if (saved.photo) {
    const image = document.createElement('img');
    image.src = saved.photo;
    image.alt = '';
    holder.append(image);
  } else {
    holder.textContent = epInitials(saved.fullName || saved.companyName);
  }
  document.querySelector('#epPhotoRemove').hidden = !saved.photo;
  window.savaSetAccountPhoto?.(saved.photo || '');
}

function epFill(form, saved) {
  [...form.elements].forEach((field) => {
    if (!field.name || !(field.name in saved)) return;
    if (field.type === 'checkbox') field.checked = Boolean(saved[field.name]);
    else field.value = saved[field.name];
  });
}

function epFlash(form, message) {
  const status = form.querySelector('.ep-saved');
  status.textContent = message;
  window.clearTimeout(form.epTimer);
  form.epTimer = window.setTimeout(() => { status.textContent = ''; }, 2400);
}

// Shrink uploads to a 256px square so they stay small enough to store.
function epResize(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const size = 256;
        const side = Math.min(image.width, image.height);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas.getContext('2d').drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function epInit() {
  let user = null;
  try { user = await window.getVerifiedUser?.(); } catch { /* Fall back to saved values only. */ }
  const meta = user?.user_metadata || {};
  const accountName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim();
  const saved = epWrite({
    fullName: epRead().fullName ?? accountName,
    companyName: epRead().companyName ?? String(meta.company_name || ''),
  });
  document.querySelector('#epEmail').textContent = user?.email || 'Master account (no email)';
  ['#epProfile', '#epCompany', '#epAccount'].forEach((selector) => epFill(document.querySelector(selector), saved));
  epRenderPhoto(saved);
  const about = document.querySelector('#epCompany [name="about"]');
  const count = () => { document.querySelector('[data-count="about"]').textContent = about.value.length; };
  about.addEventListener('input', count);
  count();
}

document.querySelectorAll('.ep-card').forEach((form) => form.addEventListener('submit', (event) => {
  event.preventDefault();
  const patch = {};
  [...form.elements].forEach((field) => {
    if (!field.name) return;
    patch[field.name] = field.type === 'checkbox' ? field.checked : field.value.trim();
  });
  if (form.id === 'epCompany' && patch.website && !/^https?:\/\//i.test(patch.website)) patch.website = `https://${patch.website}`;
  const saved = epWrite(patch);
  epFill(form, saved);
  if (form.id === 'epProfile') epRenderPhoto(saved);
  epFlash(form, 'Saved');
}));

document.querySelector('#epPhotoInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    epRenderPhoto(epWrite({ photo: await epResize(file) }));
    epFlash(document.querySelector('#epProfile'), 'Photo updated');
  } catch {
    epFlash(document.querySelector('#epProfile'), 'That image could not be read. Try a JPG or PNG.');
  }
});
document.querySelector('#epPhotoRemove').addEventListener('click', () => {
  epRenderPhoto(epWrite({ photo: '' }));
  epFlash(document.querySelector('#epProfile'), 'Photo removed');
});

epInit();
