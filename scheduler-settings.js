const schedulerStorageKey = 'sava-scheduler-config';
const schedulerIdentityKey = 'sava-scheduler-identity';
const schedulerEndpoint = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/interview-scheduler';
const timezoneLabels = {
  'America/New_York': 'Eastern Time',
  'America/Chicago': 'Central Time',
  'America/Denver': 'Mountain Time',
  'America/Los_Angeles': 'Pacific Time',
  'Africa/Johannesburg': 'South Africa Time',
  'Europe/London': 'London Time',
};
const schedulerDefaults = {
  eventName: 'Intro interview',
  duration: '30',
  timezone: 'America/New_York',
  location: 'Google Meet link sent after booking',
  availability: [
    { day: 1, start: '09:00', end: '17:00' },
    { day: 2, start: '09:00', end: '17:00' },
    { day: 3, start: '09:00', end: '17:00' },
    { day: 4, start: '09:00', end: '17:00' },
    { day: 5, start: '09:00', end: '15:00' },
  ],
};

const schedulerForm = document.querySelector('#schedulerSettingsForm');
const availabilityRows = [...document.querySelectorAll('.availability-row')];
const eventNameInput = document.querySelector('#eventName');
const durationInput = document.querySelector('#eventDuration');
const timezoneInput = document.querySelector('#eventTimezone');
const locationInput = document.querySelector('#meetingLocation');
const bookingLinkInput = document.querySelector('#bookingLink');
const previewSchedule = document.querySelector('#previewSchedule');

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function schedulerIdentity() {
  const saved = readJson(schedulerIdentityKey, null);
  if (saved?.schedulerId && saved?.editToken) return saved;
  const identity = { schedulerId: randomId(), editToken: `${randomId()}${randomId()}` };
  localStorage.setItem(schedulerIdentityKey, JSON.stringify(identity));
  return identity;
}

const identity = schedulerIdentity();

async function schedulerRequest(action, payload = {}) {
  const response = await fetch(schedulerEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, schedulerId: identity.schedulerId, ...payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'The scheduler could not connect to the backend.');
    error.status = response.status;
    throw error;
  }
  return body;
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function collectAvailability() {
  return availabilityRows.filter((row) => row.querySelector('input[type="checkbox"]').checked).map((row) => ({
    day: Number(row.querySelector('input[type="checkbox"]').value),
    start: row.querySelector('.start-time').value,
    end: row.querySelector('.end-time').value,
  }));
}

function collectConfig() {
  return {
    eventName: eventNameInput.value.trim() || schedulerDefaults.eventName,
    duration: durationInput.value,
    timezone: timezoneInput.value,
    location: locationInput.value.trim() || schedulerDefaults.location,
    availability: collectAvailability(),
  };
}

function applyConfig(config) {
  const saved = { ...schedulerDefaults, ...config };
  eventNameInput.value = saved.eventName;
  durationInput.value = String(saved.duration);
  timezoneInput.value = saved.timezone;
  locationInput.value = saved.location;
  availabilityRows.forEach((row) => {
    const day = Number(row.querySelector('input[type="checkbox"]').value);
    const savedDay = saved.availability.find((item) => Number(item.day) === day);
    row.querySelector('input[type="checkbox"]').checked = Boolean(savedDay);
    if (savedDay) {
      row.querySelector('.start-time').value = savedDay.start;
      row.querySelector('.end-time').value = savedDay.end;
    }
  });
}

function schedulerUrl(config = collectConfig()) {
  const origin = window.location.protocol === 'file:' ? 'https://www.hirefromsa.com' : window.location.origin;
  const url = new URL('/schedule-interview.html', origin);
  if (identity.saved) url.searchParams.set('scheduler', identity.schedulerId);
  url.searchParams.set('event', config.eventName);
  url.searchParams.set('duration', config.duration);
  url.searchParams.set('tz', config.timezone);
  url.searchParams.set('location', config.location);
  url.searchParams.set('availability', config.availability.map((item) => `${item.day}-${item.start}-${item.end}`).join(','));
  return url.toString();
}

function refreshPreview() {
  const config = collectConfig();
  const url = schedulerUrl(config);
  bookingLinkInput.value = url;
  previewSchedule.href = url;
  document.querySelector('#linkEventName').textContent = config.eventName;
  document.querySelector('#linkEventMeta').textContent = `${config.duration} minutes · ${timezoneLabels[config.timezone] || config.timezone}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

async function renderBookings() {
  const container = document.querySelector('#upcomingBookings');
  try {
    const { bookings } = await schedulerRequest('list', { editToken: identity.editToken });
    document.querySelector('#bookingCount').textContent = `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`;
    if (!bookings.length) {
      container.innerHTML = '<p>No upcoming interviews booked yet.</p>';
      return;
    }
    container.innerHTML = bookings.slice(0, 5).map((booking) => `<article class="upcoming-booking"><b>${escapeHtml(booking.guest_name)} · ${escapeHtml(booking.event_name)}</b><span>${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(booking.start_at))}</span><span>${escapeHtml(booking.guest_email)}</span></article>`).join('');
  } catch (error) {
    if (error.status === 403) {
      container.innerHTML = '<p>Save your scheduler to start receiving bookings.</p>';
      return;
    }
    container.innerHTML = '<p>Bookings could not be loaded. Refresh to try again.</p>';
  }
}

async function hydrateSettings() {
  applyConfig(readJson(schedulerStorageKey, schedulerDefaults));
  try {
    const { scheduler } = await schedulerRequest('get');
    identity.saved = true;
    localStorage.setItem(schedulerIdentityKey, JSON.stringify(identity));
    applyConfig(scheduler);
    localStorage.setItem(schedulerStorageKey, JSON.stringify(scheduler));
    document.querySelector('#saveStatus').textContent = 'Scheduler synced with the backend.';
  } catch (error) {
    if (error.status === 404) {
      identity.saved = false;
      localStorage.setItem(schedulerIdentityKey, JSON.stringify(identity));
    } else {
      document.querySelector('#saveStatus').textContent = 'Using saved settings. Backend sync will retry when you save.';
    }
  }
  refreshPreview();
  await renderBookings();
}

async function copyBookingLink() {
  if (!identity.saved) {
    showToast('Save the scheduler before sharing its link');
    return;
  }
  try {
    await navigator.clipboard.writeText(bookingLinkInput.value);
  } catch {
    bookingLinkInput.select();
    document.execCommand('copy');
  }
  showToast('Booking link copied');
}

schedulerForm.addEventListener('input', refreshPreview);
schedulerForm.addEventListener('change', refreshPreview);
schedulerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!schedulerForm.reportValidity()) return;
  const config = collectConfig();
  if (!config.availability.length) {
    showToast('Choose at least one available day');
    return;
  }
  if (config.availability.some((item) => item.end <= item.start)) {
    showToast('Each end time must be later than its start time');
    return;
  }
  const button = schedulerForm.querySelector('button[type="submit"]');
  button.disabled = true;
  document.querySelector('#saveStatus').textContent = 'Saving to the backend…';
  try {
    await schedulerRequest('save', { editToken: identity.editToken, ...config });
    identity.saved = true;
    localStorage.setItem(schedulerIdentityKey, JSON.stringify(identity));
    localStorage.setItem(schedulerStorageKey, JSON.stringify(config));
    document.querySelector('#saveStatus').textContent = 'Scheduler saved to the backend just now.';
    refreshPreview();
    await renderBookings();
    showToast('Interview scheduler saved');
  } catch (error) {
    document.querySelector('#saveStatus').textContent = error.message;
    showToast('Scheduler was not saved');
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#copyBookingLink').addEventListener('click', copyBookingLink);

hydrateSettings();
