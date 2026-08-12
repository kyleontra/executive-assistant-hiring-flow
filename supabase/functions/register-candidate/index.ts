import { createClient } from 'npm:@supabase/supabase-js@2';

const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'https://hirefromsa.com',
  'https://executive-assistant-hiring-flow.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Browsers serialize requests from a directly opened local HTML file as Origin: null.
  'null',
]);

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

function reply(request: Request, body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  try {
    const body = await request.json();
    const firstName = clean(body.firstName, 80);
    const lastName = clean(body.lastName, 80);
    const email = clean(body.email, 254).toLowerCase();
    const calendarLink = clean(body.calendarLink, 500);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email)) {
      return reply(request, { error: 'Enter a valid first name, last name, and email address.' }, 400);
    }
    if (password.length < 10 || password.length > 128) {
      return reply(request, { error: 'Choose a password between 10 and 128 characters.' }, 400);
    }
    if (calendarLink) {
      try {
        const url = new URL(calendarLink);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid protocol');
      } catch {
        return reply(request, { error: 'Enter a valid calendar scheduling link beginning with https://.' }, 400);
      }
    }

    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data, error } = await auth.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName, calendar_link: calendarLink },
      },
    });
    if (error) {
      if (error.message.toLowerCase().includes('already')) return reply(request, { error: 'An account with this email already exists. Sign in or use a different email address.' }, 409);
      throw error;
    }
    if (!data.user || data.user.identities?.length === 0) {
      return reply(request, { error: 'An account with this email already exists. Use a different email address for a new test.' }, 409);
    }
    return reply(request, { status: 'created' }, 201);
  } catch (error) {
    console.error('Candidate registration failed:', error);
    return reply(request, { error: 'Your account could not be created. Please try again.' }, 500);
  }
});
