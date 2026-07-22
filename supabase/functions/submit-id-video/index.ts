import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'sava-id-review-videos';
const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['video/webm', 'video/mp4']);
const ALLOWED_ORIGIN = 'https://executive-assistant-hiring-flow.vercel.app';

function responseHeaders(request: Request) {
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
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (request.headers.get('origin') !== ALLOWED_ORIGIN) return reply(request, { error: 'This review endpoint only accepts requests from the hiring site.' }, 403);

  try {
    const formData = await request.formData();
    const video = formData.get('video');
    const videoType = video instanceof File ? video.type.split(';')[0].toLowerCase() : '';
    if (!(video instanceof File) || !ALLOWED_TYPES.has(videoType) || video.size === 0 || video.size > MAX_VIDEO_BYTES) {
      return reply(request, { error: 'Send one WebM or MP4 video no larger than 4 MB.' }, 400);
    }

    const reference = `SA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const extension = videoType === 'video/mp4' ? 'mp4' : 'webm';
    const secretKey = Deno.env.get('SUPABASE_SECRET_KEYS')
      ? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)["default"]
      : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey);
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(`pending/${reference}/id-video.${extension}`, video, {
        cacheControl: '0',
        contentType: videoType,
        upsert: false,
      });

    if (error) throw error;
    return reply(request, { reference, status: 'pending' }, 202);
  } catch (error) {
    console.error('ID review upload failed:', error);
    return reply(request, { error: 'The review video could not be saved. Please try again.' }, 500);
  }
});
