import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'sava-id-review-videos';
const ALLOWED_ORIGIN = 'https://executive-assistant-hiring-flow.vercel.app';
const REFERENCE_PATTERN = /^SA-[A-Z0-9]{8}$/;

function headers(request: Request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
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
  if (request.headers.get('origin') !== ALLOWED_ORIGIN) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  try {
    const body = await request.json();
    const reviewReference = clean(body.reviewReference, 20).toUpperCase();
    const firstName = clean(body.firstName, 80);
    const lastName = clean(body.lastName, 80);
    const email = clean(body.email, 254).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!REFERENCE_PATTERN.test(reviewReference) || !firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email)) {
      return reply(request, { error: 'Enter a valid first name, last name, and email address.' }, 400);
    }
    if (password.length < 10 || password.length > 128) {
      return reply(request, { error: 'Choose a password between 10 and 128 characters.' }, 400);
    }

    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey);
    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const folder = `pending/${reviewReference}`;
    const { data: files, error: listError } = await admin.storage.from(BUCKET).list(folder, { limit: 10 });
    if (listError || !files?.some((file) => file.name.startsWith('id-video.'))) {
      return reply(request, { error: 'The linked ID video could not be found. Record the video again and retry.' }, 404);
    }
    if (files.some((file) => file.name === 'candidate.json')) {
      return reply(request, { error: 'A candidate profile is already attached to this review.' }, 409);
    }

    const { data: signUp, error: createUserError } = await auth.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    });
    const createdUser = signUp.user;
    if (createUserError || !createdUser) {
      if (createUserError?.message.toLowerCase().includes('already')) {
        return reply(request, { error: 'An account with this email already exists.' }, 409);
      }
      throw createUserError || new Error('Could not create account.');
    }

    const record = JSON.stringify({ reviewReference, userId: createdUser.id, firstName, lastName, email, submittedAt: new Date().toISOString() });
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(`${folder}/candidate.json`, new Blob([record], { type: 'application/json' }), { contentType: 'application/json', cacheControl: '0', upsert: false });
    if (uploadError) {
      if (uploadError.message.toLowerCase().includes('already exists')) return reply(request, { error: 'A candidate profile is already attached to this review.' }, 409);
      throw uploadError;
    }
    return reply(request, { status: 'created' }, 201);
  } catch (error) {
    console.error('Candidate registration failed:', error);
    return reply(request, { error: 'Your account details could not be saved. Please try again.' }, 500);
  }
});
