import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'sava-id-review-videos';
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_ORIGIN = 'https://executive-assistant-hiring-flow.vercel.app';

function headers(request: Request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function reply(request: Request, body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function tokenFrom(request: Request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (request.headers.get('origin') !== ALLOWED_ORIGIN) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  try {
    const formData = await request.formData();
    const photo = formData.get('photo');
    const type = photo instanceof File ? photo.type.split(';')[0].toLowerCase() : '';
    if (!(photo instanceof File) || !ALLOWED_TYPES.has(type) || photo.size === 0 || photo.size > MAX_PHOTO_BYTES) {
      return reply(request, { error: 'Choose a JPG, PNG, or WebP profile photo no larger than 4 MB.' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await admin.auth.getUser(tokenFrom(request));
    if (userError || !user?.email_confirmed_at) return reply(request, { error: 'Confirm your email before adding a profile photo.' }, 401);

    const path = `candidate-profiles/${user.id}/profile`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, photo, { cacheControl: '3600', contentType: type, upsert: true });
    if (uploadError) throw uploadError;
    return reply(request, { path, status: 'profile_photo_saved' }, 201);
  } catch (error) {
    console.error('Profile photo upload failed:', error);
    return reply(request, { error: 'Your profile photo could not be saved. Please try again.' }, 500);
  }
});
