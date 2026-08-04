import { createClient } from 'npm:@supabase/supabase-js@2';

const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'https://hirefromsa.com',
  'https://executive-assistant-hiring-flow.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DURATIONS = new Set([15, 30, 45, 60]);

function headers(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function reply(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validOrigin(request: Request) {
  return ALLOWED_ORIGINS.has(request.headers.get('origin') || '');
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeAvailability(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 7) return null;
  const entries = value.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      day: Number(record.day),
      start: clean(record.start, 5),
      end: clean(record.end, 5),
    };
  });
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (entries.some((item) => !Number.isInteger(item.day) || item.day < 0 || item.day > 6 || !timePattern.test(item.start) || !timePattern.test(item.end) || item.end <= item.start)) return null;
  if (new Set(entries.map((item) => item.day)).size !== entries.length) return null;
  return entries;
}

function normalizeConfig(body: Record<string, unknown>) {
  const eventName = clean(body.eventName, 80);
  const duration = Number(body.duration);
  const timezone = clean(body.timezone, 80);
  const location = clean(body.location, 180);
  const availability = normalizeAvailability(body.availability);
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { return null; }
  if (!eventName || !DURATIONS.has(duration) || !timezone || !location || !availability) return null;
  return { eventName, duration, timezone, location, availability };
}

function schedulerResponse(row: Record<string, unknown>) {
  return {
    eventName: row.event_name,
    duration: row.duration_minutes,
    timezone: row.timezone,
    location: row.meeting_location,
    availability: row.availability,
  };
}

function localSlotParts(date: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { day: DAY_INDEX[parts.weekday], minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!validOrigin(request)) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 20);
    const schedulerId = clean(body.schedulerId, 36);
    if (!UUID_PATTERN.test(schedulerId)) return reply(request, { error: 'Invalid scheduler link.' }, 400);

    if (action === 'save') {
      const editToken = clean(body.editToken, 100);
      const config = normalizeConfig(body);
      if (editToken.length < 32 || !config) return reply(request, { error: 'Complete all scheduler settings before saving.' }, 400);
      const tokenHash = await sha256(editToken);
      const { data: existing, error: readError } = await admin.from('interview_schedulers').select('id, edit_token_hash').eq('id', schedulerId).maybeSingle();
      if (readError) throw readError;
      if (existing && existing.edit_token_hash !== tokenHash) return reply(request, { error: 'This browser cannot edit that scheduler.' }, 403);
      const values = {
        id: schedulerId,
        edit_token_hash: tokenHash,
        event_name: config.eventName,
        duration_minutes: config.duration,
        timezone: config.timezone,
        meeting_location: config.location,
        availability: config.availability,
        updated_at: new Date().toISOString(),
      };
      const query = existing
        ? admin.from('interview_schedulers').update(values).eq('id', schedulerId)
        : admin.from('interview_schedulers').insert(values);
      const { error } = await query;
      if (error) throw error;
      return reply(request, { status: 'saved', schedulerId });
    }

    if (action === 'get') {
      const { data: scheduler, error } = await admin.from('interview_schedulers').select('event_name, duration_minutes, timezone, meeting_location, availability').eq('id', schedulerId).maybeSingle();
      if (error) throw error;
      if (!scheduler) return reply(request, { error: 'This scheduler is not available.' }, 404);
      const { data: bookings, error: bookingsError } = await admin.from('interview_bookings').select('start_at').eq('scheduler_id', schedulerId).gte('start_at', new Date().toISOString());
      if (bookingsError) throw bookingsError;
      return reply(request, { scheduler: schedulerResponse(scheduler), bookedStarts: (bookings || []).map((booking) => booking.start_at) });
    }

    if (action === 'list') {
      const editToken = clean(body.editToken, 100);
      if (editToken.length < 32) return reply(request, { error: 'Scheduler access is missing.' }, 403);
      const tokenHash = await sha256(editToken);
      const { data: scheduler, error } = await admin.from('interview_schedulers').select('edit_token_hash').eq('id', schedulerId).maybeSingle();
      if (error) throw error;
      if (!scheduler || scheduler.edit_token_hash !== tokenHash) return reply(request, { error: 'This browser cannot view those bookings.' }, 403);
      const { data: bookings, error: bookingsError } = await admin.from('interview_bookings').select('id, event_name, guest_name, guest_email, role_name, start_at, end_at, meeting_location, created_at').eq('scheduler_id', schedulerId).gte('start_at', new Date().toISOString()).order('start_at').limit(50);
      if (bookingsError) throw bookingsError;
      return reply(request, { bookings: bookings || [] });
    }

    if (action === 'book') {
      const name = clean(body.name, 120);
      const email = clean(body.email, 254).toLowerCase();
      const note = clean(body.note, 1000);
      const role = clean(body.role, 180);
      const startAt = new Date(clean(body.startAt, 40));
      const endAt = new Date(clean(body.endAt, 40));
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return reply(request, { error: 'Enter valid booking details.' }, 400);
      const { data: scheduler, error } = await admin.from('interview_schedulers').select('event_name, duration_minutes, timezone, meeting_location, availability').eq('id', schedulerId).maybeSingle();
      if (error) throw error;
      if (!scheduler) return reply(request, { error: 'This scheduler is not available.' }, 404);
      const duration = Number(scheduler.duration_minutes);
      if (startAt.getTime() < Date.now() + 5 * 60 * 1000 || endAt.getTime() - startAt.getTime() !== duration * 60 * 1000) return reply(request, { error: 'That interview time is invalid.' }, 400);
      const local = localSlotParts(startAt, String(scheduler.timezone));
      const availability = (scheduler.availability as Array<{ day: number; start: string; end: string }>).find((item) => Number(item.day) === local.day);
      const windowStart = availability ? timeToMinutes(availability.start) : -1;
      const windowEnd = availability ? timeToMinutes(availability.end) : -1;
      if (!availability || local.minutes < windowStart || local.minutes + duration > windowEnd || (local.minutes - windowStart) % duration !== 0) return reply(request, { error: 'That time is outside the interviewer’s availability.' }, 400);
      const { data: booking, error: bookingError } = await admin.from('interview_bookings').insert({
        scheduler_id: schedulerId,
        event_name: scheduler.event_name,
        duration_minutes: duration,
        timezone: scheduler.timezone,
        meeting_location: scheduler.meeting_location,
        guest_name: name,
        guest_email: email,
        guest_note: note,
        role_name: role,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
      }).select('id').single();
      if (bookingError?.code === '23505') return reply(request, { error: 'That time was just booked. Choose another available time.' }, 409);
      if (bookingError) throw bookingError;
      return reply(request, { status: 'booked', bookingId: booking.id }, 201);
    }

    return reply(request, { error: 'Unknown scheduler action.' }, 400);
  } catch (error) {
    console.error('Interview scheduler failed:', error);
    return reply(request, { error: 'The scheduler could not complete that request. Try again.' }, 500);
  }
});
