import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'sava-id-review-videos';
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_ORIGIN = 'https://executive-assistant-hiring-flow.vercel.app';

function headers(request: Request) {
  const origin = request.headers.get('origin');
  return { 'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Vary': 'Origin' };
}
function reply(request: Request, body: Record<string, string>, status: number) { return new Response(JSON.stringify(body), { status, headers: headers(request) }); }
function tokenFrom(request: Request) { return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''; }
function imageType(file: FormDataEntryValue | null) { return file instanceof File ? file.type.split(';')[0].toLowerCase() : ''; }
function extension(type: string) { return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'; }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (request.headers.get('origin') !== ALLOWED_ORIGIN) return reply(request, { error: 'This review endpoint only accepts requests from the hiring site.' }, 403);
  try {
    const formData = await request.formData();
    const front = formData.get('front');
    const back = formData.get('back');
    const profilePhotoPath = typeof formData.get('profilePhotoPath') === 'string' ? String(formData.get('profilePhotoPath')) : '';
    const frontType = imageType(front); const backType = imageType(back);
    if (!(front instanceof File) || !(back instanceof File) || !ALLOWED_TYPES.has(frontType) || !ALLOWED_TYPES.has(backType) || front.size === 0 || back.size === 0 || front.size > MAX_PHOTO_BYTES || back.size > MAX_PHOTO_BYTES) return reply(request, { error: 'Send front and back ID photos as JPG, PNG, or WebP files no larger than 4 MB each.' }, 400);

    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey);
    const { data: { user }, error: userError } = await admin.auth.getUser(tokenFrom(request));
    if (userError || !user?.email_confirmed_at) return reply(request, { error: 'Confirm your email before submitting ID photos.' }, 401);
    if (profilePhotoPath !== `candidate-profiles/${user.id}/profile`) return reply(request, { error: 'Add your professional profile photo before submitting ID photos.' }, 400);
    const reference = `SA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const folder = `pending/${reference}`;
    const uploads = [
      { path: `${folder}/id-front.${extension(frontType)}`, file: front, type: frontType },
      { path: `${folder}/id-back.${extension(backType)}`, file: back, type: backType },
    ];
    const results = await Promise.all(uploads.map(({ path, file, type }) => admin.storage.from(BUCKET).upload(path, file, { cacheControl: '0', contentType: type, upsert: false })));
    const failed = results.find((result) => result.error)?.error;
    if (failed) { await admin.storage.from(BUCKET).remove(uploads.map(({ path }) => path)); throw failed; }
    const record = JSON.stringify({ reviewReference: reference, userId: user.id, firstName: user.user_metadata.first_name || '', lastName: user.user_metadata.last_name || '', email: user.email || '', profilePhotoPath, submittedAt: new Date().toISOString() });
    const { error: recordError } = await admin.storage.from(BUCKET).upload(`${folder}/candidate.json`, new Blob([record], { type: 'application/json' }), { contentType: 'application/json', cacheControl: '0', upsert: false });
    if (recordError) { await admin.storage.from(BUCKET).remove([...uploads.map(({ path }) => path), `${folder}/candidate.json`]); throw recordError; }
    return reply(request, { reference, status: 'photos_saved' }, 201);
  } catch (error) {
    console.error('ID photo upload failed:', error);
    return reply(request, { error: 'The ID photos could not be saved. Please try again.' }, 500);
  }
});
