import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'sava-id-review-videos';
const ADMIN_KEY_HASH = 'a959bb56a21b2d9999f7abeb4803a5384b850dc6f46f54c1fa8db5c44cf2188a';
const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'https://hirefromsa.com',
  'https://executive-assistant-hiring-flow.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'null',
]);
const REFERENCE_PATTERN = /^SA-[A-Z0-9]{8}$/;

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

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameHash(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function signedUrl(admin: ReturnType<typeof createClient>, path: string) {
  if (!path) return '';
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 20 * 60);
  return error ? '' : data?.signedUrl || '';
}

async function reviewReferences(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.storage.from(BUCKET).list('pending', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data || []).map((item) => item.name.toUpperCase()).filter((name) => REFERENCE_PATTERN.test(name));
}

async function loadReview(admin: ReturnType<typeof createClient>, reference: string) {
  const folder = `pending/${reference}`;
  const [{ data: files, error: filesError }, { data: candidateFile, error: candidateError }] = await Promise.all([
    admin.storage.from(BUCKET).list(folder, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } }),
    admin.storage.from(BUCKET).download(`${folder}/candidate.json`),
  ]);
  if (filesError || candidateError || !candidateFile) return null;
  let candidate: Record<string, unknown>;
  try {
    candidate = JSON.parse(await candidateFile.text());
  } catch {
    return null;
  }
  const userId = typeof candidate.userId === 'string' ? candidate.userId : '';
  if (!userId) return null;
  const { data: profile, error: profileError } = await admin.from('candidate_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (profileError) throw profileError;
  const fileNames = (files || []).map((file) => file.name);
  const front = fileNames.find((name) => name.startsWith('id-front.')) || '';
  const back = fileNames.find((name) => name.startsWith('id-back.')) || '';
  const video = fileNames.find((name) => name.startsWith('id-video.')) || '';
  const profilePath = String(profile?.profile_photo_path || candidate.profilePhotoPath || '');
  const [frontUrl, backUrl, videoUrl, profilePhotoUrl] = await Promise.all([
    signedUrl(admin, front ? `${folder}/${front}` : ''),
    signedUrl(admin, back ? `${folder}/${back}` : ''),
    signedUrl(admin, video ? `${folder}/${video}` : ''),
    signedUrl(admin, profilePath),
  ]);
  return {
    reference,
    userId,
    submittedAt: candidate.submittedAt || files?.[0]?.created_at || '',
    ready: Boolean(front && back && video),
    hasProfile: Boolean(profile),
    candidate: {
      name: profile?.full_name || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate',
      email: profile?.email || candidate.email || '',
      summary: profile?.summary || 'Candidate profile submitted for review.',
      relevantYears: Number(profile?.relevant_years || 0),
      experience: Array.isArray(profile?.experience) ? profile.experience : [],
      verificationStatus: profile?.verification_status || 'draft',
      profilePhotoUrl,
    },
    files: { frontUrl, backUrl, videoUrl },
  };
}

async function allReviews(admin: ReturnType<typeof createClient>) {
  const references = await reviewReferences(admin);
  const reviews = await Promise.all(references.map((reference) => loadReview(admin, reference)));
  return reviews
    .filter((review): review is NonNullable<typeof review> => Boolean(review))
    .sort((left, right) => String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    const adminKey = typeof body.adminKey === 'string' ? body.adminKey.trim() : '';
    if (!adminKey || !sameHash(await sha256(adminKey), ADMIN_KEY_HASH)) return reply(request, { error: 'The review access key is incorrect.' }, 401);
    const action = typeof body.action === 'string' ? body.action : '';
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (action === 'listReviews') {
      const reviews = await allReviews(admin);
      return reply(request, { reviews });
    }

    if (action === 'acceptAll') {
      const reviews = await allReviews(admin);
      const userIds = reviews.filter((review) => review.ready && review.hasProfile && review.candidate.verificationStatus !== 'verified').map((review) => review.userId);
      if (!userIds.length) return reply(request, { accepted: 0 });
      const { error } = await admin.from('candidate_profiles').update({ verification_status: 'verified', updated_at: new Date().toISOString() }).in('user_id', userIds);
      if (error) throw error;
      return reply(request, { accepted: userIds.length });
    }

    if (action === 'acceptReview' || action === 'rejectReview') {
      const reference = typeof body.reference === 'string' ? body.reference.trim().toUpperCase() : '';
      if (!REFERENCE_PATTERN.test(reference)) return reply(request, { error: 'Choose a valid review submission.' }, 400);
      const review = await loadReview(admin, reference);
      if (!review) return reply(request, { error: 'That review submission was not found.' }, 404);
      if (action === 'acceptReview' && !review.ready) return reply(request, { error: 'The ID video must be submitted before this candidate can be accepted.' }, 409);
      if (action === 'acceptReview' && !review.hasProfile) return reply(request, { error: 'This older review is not linked to a current candidate profile.' }, 409);
      const verificationStatus = action === 'acceptReview' ? 'verified' : 'rejected';
      const { data: profile, error } = await admin.from('candidate_profiles').update({ verification_status: verificationStatus, updated_at: new Date().toISOString() }).eq('user_id', review.userId).select('user_id').maybeSingle();
      if (error) throw error;
      if (!profile) return reply(request, { error: 'The candidate profile linked to this review no longer exists.' }, 404);
      return reply(request, { reference, verificationStatus });
    }

    return reply(request, { error: 'Unknown review action.' }, 400);
  } catch (error) {
    console.error('Admin review request failed:', error);
    return reply(request, { error: 'The review dashboard could not complete that request.' }, 500);
  }
});
