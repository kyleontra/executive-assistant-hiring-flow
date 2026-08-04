const params = new URLSearchParams(window.location.search);
const timezoneLabels = {
  'America/New_York': 'Eastern Time',
  'America/Chicago': 'Central Time',
  'America/Denver': 'Mountain Time',
  'America/Los_Angeles': 'Pacific Time',
  'Africa/Johannesburg': 'South Africa Time',
  'Europe/London': 'London Time',
};
const bookingStorageKey = 'sava-interview-bookings';
const localConfig = (() => { try { return JSON.parse(localStorage.getItem('sava-scheduler-config') || '{}'); } catch { return {}; } })();
const defaultAvailability = [
  { day: 1, start: '09:00', end: '17:00' }, { day: 2, start: '09:00', end: '17:00' },
  { day: 3, start: '09:00', end: '17:00' }, { day: 4, start: '09:00', end: '17:00' },
  { day: 5, start: '09:00', end: '15:00' },
];

function parseAvailability(value) {
  if (!value) return Array.isArray(localConfig.availability) && localConfig.availability.length ? localConfig.availability : defaultAvailability;
  return value.split(',').map((item) => {
    const match = item.match(/^(\d)-([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/);
    return match ? { day: Number(match[1]), start: match[2], end: match[3] } : null;
  }).filter(Boolean);
}

const bookingConfig = {
  eventName: params.get('event') || localConfig.eventName || 'Intro interview',
  duration: Number(params.get('duration') || localConfig.duration || 30),
  timezone: params.get('tz') || localConfig.timezone || 'America/New_York',
  location: params.get('location') || localConfig.location || 'Google Meet link sent after booking',
  availability: parseAvailability(params.get('availability')),
  candidate: params.get('candidate') || '',
  role: params.get('role') || '',
};

let calendarOffset = 0;
let selectedDate = null;
let selectedStart = null;
let selectedEnd = null;

document.querySelector('#bookingEventName').textContent = bookingConfig.eventName;
document.querySelector('#bookingDuration').textContent = `${bookingConfig.duration} minutes`;
document.querySelector('#bookingLocation').textContent = bookingConfig.location;
document.querySelector('#bookingTimezone').textContent = timezoneLabels[bookingConfig.timezone] || bookingConfig.timezone;
if (bookingConfig.candidate) {
  const greeting = document.querySelector('#candidateGreeting');
  greeting.textContent = `${bookingConfig.candidate}, choose a time for your ${bookingConfig.role || 'role'} interview.`;
  greeting.hidden = false;
  document.querySelector('#guestName').value = bookingConfig.candidate;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function zonedDateToUtc(dateString, timeString, timezone) {
  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = timeString.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(guess).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(guess.getTime() + desiredAsUtc - representedAsUtc);
}

function minutesToTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function slotStartsForDate(key, availability) {
  if (!availability) return [];
  const [startHour, startMinute] = availability.start.split(':').map(Number);
  const [endHour, endMinute] = availability.end.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const slots = [];
  for (let minutes = start; minutes + bookingConfig.duration <= end; minutes += bookingConfig.duration) {
    const time = minutesToTime(minutes);
    const utc = zonedDateToUtc(key, time, bookingConfig.timezone);
    if (utc.getTime() > Date.now() + 2 * 60 * 60 * 1000) slots.push({ time, utc });
  }
  return slots;
}

function generateDates() {
  const dates = [];
  const first = new Date();
  first.setHours(12, 0, 0, 0);
  first.setDate(first.getDate() + calendarOffset * 7);
  for (let index = 0; index < 14; index += 1) {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    dates.push(date);
  }
  return dates;
}

function renderDates() {
  const dates = generateDates();
  const grid = document.querySelector('#dateGrid');
  document.querySelector('#previousDates').disabled = calendarOffset === 0;
  document.querySelector('#calendarRange').textContent = `${dates[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${dates[dates.length - 1].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  grid.innerHTML = dates.map((date) => {
    const key = dateKey(date);
    const dayAvailability = bookingConfig.availability.find((item) => Number(item.day) === date.getDay());
    const available = slotStartsForDate(key, dayAvailability).length > 0;
    return `<button class="booking-date-button${available ? '' : ' unavailable'}${selectedDate === key ? ' selected' : ''}" type="button" data-date="${key}" ${available ? '' : 'disabled'}><span>${date.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>${date.getDate()}</b></button>`;
  }).join('');
}

function renderTimes() {
  const availability = bookingConfig.availability.find((item) => Number(item.day) === dateFromKey(selectedDate).getDay());
  const grid = document.querySelector('#timeGrid');
  const prompt = document.querySelector('#selectDatePrompt');
  if (!availability) { grid.innerHTML = ''; return; }
  const slots = slotStartsForDate(selectedDate, availability);
  prompt.hidden = true;
  const viewerValue = document.querySelector('#viewerTimezone').value;
  const viewerTimezone = viewerValue === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : viewerValue;
  grid.innerHTML = slots.length ? slots.map(({ time, utc }) => `<button class="booking-time-button" type="button" data-time="${time}">${new Intl.DateTimeFormat('en-US', { timeZone: viewerTimezone, hour: 'numeric', minute: '2-digit' }).format(utc)}</button>`).join('') : '<p class="select-date-prompt">No remaining times are available on this day.</p>';
}

function showDetails(time) {
  selectedStart = zonedDateToUtc(selectedDate, time, bookingConfig.timezone);
  selectedEnd = new Date(selectedStart.getTime() + bookingConfig.duration * 60 * 1000);
  const viewerValue = document.querySelector('#viewerTimezone').value;
  const viewerTimezone = viewerValue === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : viewerValue;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: viewerTimezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  document.querySelector('#selectedTimeSummary').textContent = `${formatter.format(selectedStart)} · ${bookingConfig.duration} minutes`;
  document.querySelector('#dateStep').hidden = true;
  document.querySelector('#bookingDetailsForm').hidden = false;
}

document.querySelector('#dateGrid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-date]');
  if (!button || button.disabled) return;
  selectedDate = button.dataset.date;
  renderDates();
  renderTimes();
});
document.querySelector('#timeGrid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-time]');
  if (button) showDetails(button.dataset.time);
});
document.querySelector('#previousDates').addEventListener('click', () => { if (calendarOffset > 0) { calendarOffset -= 1; selectedDate = null; renderDates(); document.querySelector('#timeGrid').innerHTML = ''; document.querySelector('#selectDatePrompt').hidden = false; } });
document.querySelector('#nextDates').addEventListener('click', () => { calendarOffset += 1; selectedDate = null; renderDates(); document.querySelector('#timeGrid').innerHTML = ''; document.querySelector('#selectDatePrompt').hidden = false; });
document.querySelector('#viewerTimezone').addEventListener('change', () => { if (selectedDate) renderTimes(); });
document.querySelector('#backToTimes').addEventListener('click', () => { document.querySelector('#bookingDetailsForm').hidden = true; document.querySelector('#dateStep').hidden = false; });

document.querySelector('#bookingDetailsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : `booking-${Date.now()}`,
    eventName: bookingConfig.eventName,
    duration: bookingConfig.duration,
    timezone: bookingConfig.timezone,
    location: bookingConfig.location,
    name: document.querySelector('#guestName').value.trim(),
    email: document.querySelector('#guestEmail').value.trim(),
    note: document.querySelector('#guestNote').value.trim(),
    role: bookingConfig.role,
    startAt: selectedStart.toISOString(),
    endAt: selectedEnd.toISOString(),
    createdAt: new Date().toISOString(),
  };
  let bookings = [];
  try { bookings = JSON.parse(localStorage.getItem(bookingStorageKey) || '[]'); } catch { bookings = []; }
  bookings.push(booking);
  localStorage.setItem(bookingStorageKey, JSON.stringify(bookings));
  document.querySelector('#bookingDetailsForm').hidden = true;
  document.querySelector('#bookingConfirmation').hidden = false;
  document.querySelector('#confirmationMessage').textContent = `A confirmation has been prepared for ${booking.email}.`;
  document.querySelector('#confirmationFacts').textContent = `${new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(selectedStart)} · ${booking.location}`;
  document.querySelector('#addToCalendar').dataset.bookingId = booking.id;
});

document.querySelector('#addToCalendar').addEventListener('click', () => {
  const start = selectedStart.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = selectedEnd.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escapeIcs = (value) => String(value).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hire From SA//Interview Scheduler//EN', 'BEGIN:VEVENT', `UID:${document.querySelector('#addToCalendar').dataset.bookingId}@hirefromsa.com`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeIcs(bookingConfig.eventName)}`, `LOCATION:${escapeIcs(bookingConfig.location)}`, 'DESCRIPTION:Interview scheduled through Hire From SA.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
  link.download = 'hire-from-sa-interview.ics';
  link.click();
  URL.revokeObjectURL(link.href);
});

renderDates();
