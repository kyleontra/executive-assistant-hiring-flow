import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'sava-id-review-videos';
const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['video/webm', 'video/mp4']);
const ALLOWED_ORIGIN = 'https://executive-assistant-hiring-flow.vercel.app';
const REFERENCE_PATTERN = /^SA-[A-Z0-9]{8}$/;

function headers(request: Request) {
  const origin = request.headers.get('origin');
  return { 'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Vary': 'Origin' };
}
function reply(request: Request, body: Record<string, string>, status: number) { return new Response(JSON.stringify(body), { status, headers: headers(request) }); }
function tokenFrom(request: Request) { return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''; }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (request.headers.get('origin') !== ALLOWED_ORIGIN) return reply(request, { error: 'This review endpoint only accepts requests from the hiring site.' }, 403);
  try {
    const formData = await request.formData();
    const video = formData.get('video');
    const reviewReference = String(formData.get('reviewReference') || '').trim().toUpperCase();
    const videoType = video instanceof File ? video.type.split(';')[0].toLowerCase() : '';
    if (!REFERENCE_PATTERN.test(reviewReference)) return reply(request, { error: 'This video needs a valid ID-photo review reference.' }, 400);
    if (!(video instanceof File) || !ALLOWED_TYPES.has(videoType) || video.size === 0 || video.size > MAX_VIDEO_BYTES) return reply(request, { error: 'Send one WebM or MP4 video no larger than 4 MB.' }, 400);

    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey);
    const { data: { user }, error: userError } = await admin.auth.getUser(tokenFrom(request));
    if (userError || !user?.email_confirmed_at) return reply(request, { error: 'Confirm your email before submitting the ID video.' }, 401);
    const folder = `pending/${reviewReference}`;
    const { data: profileFile, error: profileError } = await admin.storage.from(BUCKET).download(`${folder}/candidate.json`);
    if (profileError || !profileFile) return reply(request, { error: 'The linked ID photos could not be found. Upload them again and retry.' }, 404);
    const profile = JSON.parse(await profileFile.text());
    if (profile.userId !== user.id) return reply(request, { error: 'This ID-photo review belongs to a different account.' }, 403);
    const { data: files, error: listError } = await admin.storage.from(BUCKET).list(folder, { limit: 10 });
    if (listError || !files?.some((file) => file.name.startsWith('id-front.')) || !files.some((file) => file.name.startsWith('id-back.'))) return reply(request, { error: 'Both ID photos are required before the video can be submitted.' }, 400);
    const extension = videoType === 'video/mp4' ? 'mp4' : 'webm';
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(`${folder}/id-video.${extension}`, video, { cacheControl: '0', contentType: videoType, upsert: false });
    if (uploadError) throw uploadError;
    return reply(request, { reference: reviewReference, status: 'pending' }, 202);
  } catch (error) {
    console.error('ID review upload failed:', error);
    return reply(request, { error: 'The review video could not be saved. Please try again.' }, 500);
  }
});
