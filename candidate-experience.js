const authStatus = document.querySelector('#authStatus');
const video = document.querySelector('#introVideo');
const experienceSection = document.querySelector('#experienceSection');
const experienceForm = document.querySelector('#experienceForm');
const experienceList = document.querySelector('#experienceList');
const template = document.querySelector('#experienceTemplate');
const addButton = document.querySelector('#addExperience');
const submitButton = document.querySelector('#submitExperience');
const formResult = document.querySelector('#formResult');
const watchTitle = document.querySelector('#watchTitle');
const watchDetail = document.querySelector('#watchDetail');
const watchIcon = document.querySelector('#watchIcon');
const watchPercent = document.querySelector('#watchPercent');
const watchProgress = document.querySelector('#watchProgress');

let candidate = null;
let furthestWatchedTime = 0;
let videoComplete = false;
let nextEntryId = 1;
const pageParams = new URLSearchParams(window.location.search);
const demoMode = pageParams.get('demo') === '1';
const previewMode = demoMode || (['localhost', '127.0.0.1'].includes(window.location.hostname)
  && pageParams.get('preview') === '1');

if (demoMode && pageParams.get('reset') === '1') {
  ['experience', 'intro-watched', 'profile-photo', 'resume-path', 'resume-name'].forEach((type) => sessionStorage.removeItem(`sava:${type}:demo-candidate`));
  window.history.replaceState(null, '', './candidate-experience.html?demo=1');
}

function storageKey(type) {
  return candidate ? `sava:${type}:${candidate.id}` : '';
}

function showFormResult(message, type) {
  formResult.textContent = message;
  formResult.className = `form-result show ${type}`;
}

function wordCount(value) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function setVideoProgress() {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const percent = duration ? Math.min(100, Math.round((furthestWatchedTime / duration) * 100)) : 0;
  watchPercent.textContent = `${percent}%`;
  watchProgress.style.width = `${percent}%`;
}

function setFormLocked(locked) {
  experienceSection.classList.toggle('locked', locked);
  experienceSection.setAttribute('aria-disabled', String(locked));
  experienceForm.querySelectorAll('input, textarea, button').forEach((control) => {
    control.disabled = locked;
  });
  if (!locked) {
    experienceList.querySelectorAll('.experience-entry').forEach((entry) => {
      entry.querySelector('.end-date').disabled = entry.querySelector('.current-checkbox').checked;
    });
    updateEntryLabels();
  }
}

function completeVideo() {
  if (videoComplete) return;
  videoComplete = true;
  furthestWatchedTime = Number.isFinite(video.duration) ? video.duration : furthestWatchedTime;
  sessionStorage.setItem(storageKey('intro-watched'), 'true');
  watchIcon.textContent = '✓';
  watchTitle.textContent = 'Introduction complete';
  watchDetail.textContent = 'Your experience form is now unlocked.';
  watchPercent.textContent = '100%';
  watchProgress.style.width = '100%';
  setFormLocked(false);
  experienceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateDates(entry) {
  const current = entry.querySelector('.current-checkbox').checked;
  const start = entry.querySelector('.start-date');
  const end = entry.querySelector('.end-date');
  end.setCustomValidity(!current && start.value && end.value && end.value < start.value ? 'End month must be after the start month.' : '');
}

function updateEntryLabels() {
  const entries = [...experienceList.querySelectorAll('.experience-entry')];
  entries.forEach((entry, index) => {
    entry.querySelector('.entry-number').textContent = `Experience ${index + 1}`;
    const remove = entry.querySelector('.remove-entry');
    remove.disabled = entries.length === 1 || !videoComplete;
    remove.setAttribute('aria-label', `Remove experience ${index + 1}`);
  });
}

function wireEntry(entry) {
  const entryId = nextEntryId++;
  const title = entry.querySelector('.job-title');
  const titleCounter = entry.querySelector('.job-title-counter');
  const company = entry.querySelector('.company-name');
  const companyCounter = entry.querySelector('.company-counter');
  const description = entry.querySelector('.description');
  const descriptionCounter = entry.querySelector('.description-counter');
  const current = entry.querySelector('.current-checkbox');
  const end = entry.querySelector('.end-date');

  entry.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.name = `rolePreference-${entryId}`;
  });

  title.addEventListener('input', () => {
    const count = wordCount(title.value);
    titleCounter.textContent = `${count} / 50 words`;
    titleCounter.classList.toggle('over-limit', count > 50);
    title.setCustomValidity(count > 50 ? 'Job title must be 50 words or fewer.' : '');
  });

  company.addEventListener('input', () => {
    companyCounter.textContent = `${company.value.length} / 50 characters`;
  });

  description.addEventListener('input', () => {
    descriptionCounter.textContent = `${description.value.length.toLocaleString()} / 10,000 characters`;
  });

  current.addEventListener('change', () => {
    end.disabled = current.checked;
    end.required = !current.checked;
    if (current.checked) end.value = '';
    entry.querySelector('.end-date-field').classList.toggle('disabled-field', current.checked);
    validateDates(entry);
  });

  entry.querySelector('.start-date').addEventListener('change', () => validateDates(entry));
  end.addEventListener('change', () => validateDates(entry));
  entry.querySelector('.remove-entry').addEventListener('click', () => {
    entry.remove();
    updateEntryLabels();
  });
}

function addExperience(data = null) {
  const fragment = template.content.cloneNode(true);
  const entry = fragment.querySelector('.experience-entry');
  experienceList.appendChild(fragment);
  wireEntry(entry);

  if (data) {
    const title = entry.querySelector('.job-title');
    const company = entry.querySelector('.company-name');
    const description = entry.querySelector('.description');
    title.value = data.jobTitle || '';
    company.value = data.companyName || '';
    entry.querySelector('.start-date').value = data.startDate || '';
    entry.querySelector('.current-checkbox').checked = Boolean(data.currentRole);
    entry.querySelector('.end-date').value = data.endDate || '';
    description.value = data.description || '';
    const selectedPreference = [...entry.querySelectorAll('input[type="radio"]')].find((radio) => radio.value === data.preference);
    if (selectedPreference) selectedPreference.checked = true;
    title.dispatchEvent(new Event('input'));
    company.dispatchEvent(new Event('input'));
    description.dispatchEvent(new Event('input'));
    entry.querySelector('.current-checkbox').dispatchEvent(new Event('change'));
  }

  updateEntryLabels();
  return entry;
}

function serializeEntries() {
  return [...experienceList.querySelectorAll('.experience-entry')].map((entry) => ({
    jobTitle: entry.querySelector('.job-title').value.trim(),
    companyName: entry.querySelector('.company-name').value.trim(),
    startDate: entry.querySelector('.start-date').value,
    endDate: entry.querySelector('.end-date').value,
    currentRole: entry.querySelector('.current-checkbox').checked,
    description: entry.querySelector('.description').value.trim(),
    preference: entry.querySelector('input[type="radio"]:checked')?.value || '',
  }));
}

function loadExperienceDraft() {
  const stored = sessionStorage.getItem(storageKey('experience'));
  if (!stored) {
    addExperience();
    return;
  }
  try {
    const entries = JSON.parse(stored);
    if (!Array.isArray(entries) || entries.length === 0) throw new Error('Invalid experience draft');
    entries.forEach(addExperience);
  } catch {
    addExperience();
  }
}

async function initialize() {
  candidate = previewMode
    ? { id: demoMode ? 'demo-candidate' : 'local-preview', email: demoMode ? 'demo@hirefromsa.com' : 'verified.candidate@example.com', user_metadata: { first_name: 'Demo', last_name: 'Candidate' } }
    : await window.getVerifiedCandidate();
  if (!candidate) {
    authStatus.textContent = 'Your verified session is missing or has expired. Verify your email again to continue.';
    authStatus.className = 'status-message error';
    video.controls = false;
    setFormLocked(true);
    return;
  }

  authStatus.textContent = demoMode ? 'Demo mode — no account is required and nothing will be saved to the server.' : `Email confirmed for ${candidate.email}.`;
  authStatus.className = 'status-message success';
  if (!previewMode) {
    try {
      const { profile } = await window.savaPlatform.candidateRequest('getProfile');
      if (!profile?.referralCompleted) {
        window.location.replace('./referral.html');
        return;
      }
      if (profile.verificationBypass) {
        window.location.replace('./candidate-dashboard.html');
        return;
      }
      if (!sessionStorage.getItem(storageKey('experience')) && profile?.experience?.length) {
        sessionStorage.setItem(storageKey('experience'), JSON.stringify(profile.experience));
      }
    } catch { /* Start with an empty experience form if there is no saved server profile yet. */ }
  }
  loadExperienceDraft();

  if (sessionStorage.getItem(storageKey('intro-watched')) === 'true') {
    videoComplete = true;
    watchIcon.textContent = '✓';
    watchTitle.textContent = 'Introduction complete';
    watchDetail.textContent = 'Your experience form is unlocked.';
    watchPercent.textContent = '100%';
    watchProgress.style.width = '100%';
    setFormLocked(false);
  } else {
    setFormLocked(true);
  }
}

video.addEventListener('loadedmetadata', setVideoProgress);
video.addEventListener('timeupdate', () => {
  if (!videoComplete && video.currentTime <= furthestWatchedTime + 1.25) {
    furthestWatchedTime = Math.max(furthestWatchedTime, video.currentTime);
  }
  setVideoProgress();
});
video.addEventListener('seeking', () => {
  if (!videoComplete && video.currentTime > furthestWatchedTime + 1.25) video.currentTime = furthestWatchedTime;
});
video.addEventListener('ratechange', () => {
  if (!videoComplete && video.playbackRate !== 1) video.playbackRate = 1;
});
video.addEventListener('ended', completeVideo);
video.addEventListener('error', () => {
  watchTitle.textContent = 'Intro video unavailable';
  watchDetail.textContent = 'Add candidate-intro.mp4 to the site before publishing this step.';
  watchIcon.textContent = '!';
});

addButton.addEventListener('click', () => {
  const entry = addExperience();
  entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
  entry.querySelector('.job-title').focus();
});

experienceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!videoComplete) {
    showFormResult('Complete the introduction video before continuing.', 'error');
    return;
  }
  const entries = [...experienceList.querySelectorAll('.experience-entry')];
  if (entries.length === 0) {
    addExperience();
    showFormResult('Add at least one experience before continuing.', 'error');
    return;
  }
  entries.forEach(validateDates);
  if (!experienceForm.reportValidity()) {
    showFormResult('Complete every required field in each experience entry.', 'error');
    return;
  }

  const experience = serializeEntries();
  sessionStorage.setItem(storageKey('experience'), JSON.stringify(experience));
  submitButton.disabled = true;
  submitButton.textContent = 'Saving experience…';
  try {
    if (!previewMode) {
      await window.savaPlatform.candidateRequest('saveProfile', {
        experience,
        fullName: `${candidate.user_metadata?.first_name || ''} ${candidate.user_metadata?.last_name || ''}`.trim(),
        calendarLink: candidate.user_metadata?.calendar_link || '',
      });
    }
    showFormResult(demoMode ? 'Demo experience saved in this browser. Continuing…' : 'Experience saved. Continuing to your profile photo…', 'success');
    window.setTimeout(() => window.location.assign(`./candidate-profile.html${demoMode ? '?demo=1' : ''}`), 650);
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save experience and continue <span>→</span>';
    showFormResult(error.message || 'Your experience could not be saved.', 'error');
  }
});

setFormLocked(true);
initialize();
