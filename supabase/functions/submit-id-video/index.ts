import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'sava-id-review-videos';
const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['video/webm', 'video/mp4']);
const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([PRIMARY_ORIGIN, 'https://hirefromsa.com', 'https://executive-assistant-hiring-flow.vercel.app']);
const REFERENCE_PATTERN = /^SA-[A-Z0-9]{8}$/;

function headers(request: Request) {
  const origin = request.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Vary': 'Origin' };
}
function reply(request: Request, body: Record<string, string>, status: number) { return new Response(JSON.stringify(body), { status, headers: headers(request) }); }
function tokenFrom(request: Request) { return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''; }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This review endpoint only accepts requests from the hiring site.' }, 403);
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
    if (user.app_metadata?.account_role !== 'candidate') return reply(request, { error: 'A candidate account is required.' }, 403);
    const { data: candidateProfile, error: candidateError } = await admin.from('candidate_profiles').select('verification_status,verification_bypass').eq('user_id', user.id).maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidateProfile) return reply(request, { error: 'Complete your candidate profile before submitting your ID.' }, 403);
    if (candidateProfile.verification_status === 'verified' || candidateProfile.verification_bypass) return reply(request, { error: 'Your identity is already approved. Return to your account to continue.' }, 409);
    const { data: onboarding, error: onboardingError } = await admin.from('candidate_onboarding').select('identity_completed_at, review_reference').eq('user_id', user.id).maybeSingle();
    if (onboardingError) throw onboardingError;
    if (onboarding?.review_reference && onboarding.review_reference !== reviewReference) return reply(request, { error: 'Newer ID photos are saved on your account. Refresh this page to continue with them.' }, 409);
    const folder = `pending/${reviewReference}`;
    const { data: profileFile, error: profileError } = await admin.storage.from(BUCKET).download(`${folder}/candidate.json`);
    if (profileError || !profileFile) return reply(request, { error: 'The linked ID photos could not be found. Upload them again and retry.' }, 404);
    const profile = JSON.parse(await profileFile.text());
    if (profile.userId !== user.id) return reply(request, { error: 'This ID-photo review belongs to a different account.' }, 403);
    const { data: files, error: listError } = await admin.storage.from(BUCKET).list(folder, { limit: 10 });
    if (listError || !files?.some((file) => file.name.startsWith('id-front.')) || !files.some((file) => file.name.startsWith('id-back.'))) return reply(request, { error: 'Both ID photos are required before the video can be submitted.' }, 400);
    const extension = videoType === 'video/mp4' ? 'mp4' : 'webm';
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(`${folder}/id-video.${extension}`, video, { cacheControl: '0', contentType: videoType, upsert: true });
    if (uploadError) throw uploadError;
    const { error: progressError } = await admin.from('candidate_onboarding').upsert({
      user_id: user.id,
      identity_video_uploaded_at: new Date().toISOString(),
      identity_completed_at: null,
      platform_completed_at: null,
      review_reference: reviewReference,
      contract_accepted_at: null,
      contract_name: null,
      contract_version: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (progressError) throw progressError;
    return reply(request, { reference: reviewReference, status: 'contract_required' }, 202);
  } catch (error) {
    console.error('ID review upload failed:', error);
    return reply(request, { error: 'The review video could not be saved. Please try again.' }, 500);
  }
});
