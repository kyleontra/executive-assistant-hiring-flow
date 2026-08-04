const schedulerStorageKey = 'sava-scheduler-config';
const bookingStorageKey = 'sava-interview-bookings';
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

function schedulerUrl(config = collectConfig()) {
  const origin = window.location.protocol === 'file:' ? 'https://www.hirefromsa.com' : window.location.origin;
  const url = new URL('/schedule-interview.html', origin);
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

function hydrateSettings() {
  const saved = { ...schedulerDefaults, ...readJson(schedulerStorageKey, {}) };
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
  refreshPreview();
}

function renderBookings() {
  const bookings = readJson(bookingStorageKey, []).filter((booking) => new Date(booking.startAt).getTime() > Date.now()).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  document.querySelector('#bookingCount').textContent = `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`;
  const container = document.querySelector('#upcomingBookings');
  if (!bookings.length) {
    container.innerHTML = '<p>No interviews booked on this browser yet.</p>';
    return;
  }
  container.innerHTML = bookings.slice(0, 5).map((booking) => `<article class="upcoming-booking"><b>${escapeHtml(booking.name)} · ${escapeHtml(booking.eventName)}</b><span>${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(booking.startAt))}</span></article>`).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

async function copyBookingLink() {
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
schedulerForm.addEventListener('submit', (event) => {
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
  localStorage.setItem(schedulerStorageKey, JSON.stringify(config));
  document.querySelector('#saveStatus').textContent = 'Scheduler saved just now.';
  refreshPreview();
  showToast('Interview scheduler saved');
});
document.querySelector('#copyBookingLink').addEventListener('click', copyBookingLink);

hydrateSettings();
renderBookings();
