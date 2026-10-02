import { SPREADSHEET_COLUMNS, DEFAULT_SPREADSHEET_PROMPT, spreadsheetModel, exportPrompt, profileRow, generateSpreadsheetRow, candidateAiKey, saveCandidateAiKey, savedSpreadsheetRows, spreadsheetResumeRows } from '../_shared/candidate-spreadsheet.mjs';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { masterAccount } from '../_shared/master-access.mjs';
import { reviewSubmissionAcceptable, reviewSubmissionVisible } from '../_shared/review-access.mjs';
import { redactContactInfo } from '../_shared/redact-contact-info.mjs';
import { notifyApproval } from '../_shared/approval-notification.mjs';

const REVIEW_BUCKET = 'sava-id-review-videos';
const RESUME_BUCKET = 'candidate-resumes';
const ADMIN_KEY_HASH = '63ed0f91af12782cb14250523af6d6aa009ad37bac78b74b72b47437265ac4de';
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERIFICATION_STATUSES = new Set(['draft', 'pending', 'verified', 'rejected']);

function headers(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
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

async function signedUrl(admin: ReturnType<typeof createClient>, bucket: string, path: string, download = false) {
  if (!path) return '';
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 20 * 60, download ? { download: true } : undefined);
  return error ? '' : data?.signedUrl || '';
}

async function reviewReferences(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.storage.from(REVIEW_BUCKET).list('pending', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data || []).map((item) => item.name.toUpperCase()).filter((name) => REFERENCE_PATTERN.test(name));
}

async function loadReview(admin: ReturnType<typeof createClient>, reference: string) {
  const folder = `pending/${reference}`;
  const [{ data: files, error: filesError }, { data: candidateFile, error: candidateError }] = await Promise.all([
    admin.storage.from(REVIEW_BUCKET).list(folder, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } }),
    admin.storage.from(REVIEW_BUCKET).download(`${folder}/candidate.json`),
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
  const { data: account } = await admin.auth.admin.getUserById(userId);
  const activeAccount = account?.user?.app_metadata?.account_role === 'candidate' && account.user.email_confirmed_at;
  const fileNames = (files || []).map((file) => file.name);
  const front = fileNames.find((name) => name.startsWith('id-front.')) || '';
  const back = fileNames.find((name) => name.startsWith('id-back.')) || '';
  const video = fileNames.find((name) => name.startsWith('id-video.')) || '';
  const profilePath = String(profile?.profile_photo_path || candidate.profilePhotoPath || '');
  const [frontUrl, backUrl, videoUrl, profilePhotoUrl] = await Promise.all([
    signedUrl(admin, REVIEW_BUCKET, front ? `${folder}/${front}` : ''),
    signedUrl(admin, REVIEW_BUCKET, back ? `${folder}/${back}` : ''),
    signedUrl(admin, REVIEW_BUCKET, video ? `${folder}/${video}` : ''),
    signedUrl(admin, REVIEW_BUCKET, profilePath),
  ]);
  return {
    reference,
    userId,
    submittedAt: candidate.submittedAt || files?.[0]?.created_at || '',
    ready: Boolean(front && back && video),
    hasProfile: Boolean(profile && activeAccount),
    hasSubmission: true,
    candidate: {
      name: profile?.full_name || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate',
      email: profile?.email || candidate.email || '',
      summary: profile?.summary || 'Candidate profile submitted for review.',
      relevantYears: Number(profile?.relevant_years || 0),
      experience: Array.isArray(profile?.experience) ? profile.experience : [],
      verificationStatus: profile?.verification_status || 'draft',
      profilePhotoUrl,
      emailConfirmed: true,
      approvalEmailSent: Boolean(profile?.verification_status === 'verified' && account?.user?.app_metadata?.verification_email_approval_version === profile.updated_at),
      approvalEmailError: account?.user?.app_metadata?.verification_email_error || '',
    },
    files: { frontUrl, backUrl, videoUrl },
  };
}

async function accountReviews(admin: ReturnType<typeof createClient>, submittedUserIds: Set<string>) {
  const [{ data: userPage, error: userError }, { data: profiles, error: profileError }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('candidate_profiles').select('*').order('created_at', { ascending: false }).limit(1000),
  ]);
  if (userError) throw userError;
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map((profile) => [String(profile.user_id), profile]));
  const users = userPage?.users || [];
  const reviews = await Promise.all(users.filter((user) => {
    if (submittedUserIds.has(user.id)) return false;
    const profile = profileMap.get(user.id);
    return Boolean(profile || user.user_metadata?.first_name || user.user_metadata?.last_name);
  }).map(async (user) => {
    const profile = profileMap.get(user.id);
    const firstName = typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name : '';
    const lastName = typeof user.user_metadata?.last_name === 'string' ? user.user_metadata.last_name : '';
    const profilePhotoUrl = await signedUrl(admin, REVIEW_BUCKET, String(profile?.profile_photo_path || ''));
    return {
      reference: `ACCOUNT-${user.id.slice(0, 8).toUpperCase()}`,
      userId: user.id,
      submittedAt: profile?.updated_at || user.created_at || '',
      ready: false,
      hasProfile: Boolean(profile),
      hasSubmission: false,
      candidate: {
        name: profile?.full_name || `${firstName} ${lastName}`.trim() || 'New candidate',
        email: profile?.email || user.email || '',
        summary: profile?.summary || 'Account created. Candidate profile and identity documents are not complete yet.',
        relevantYears: Number(profile?.relevant_years || 0),
        experience: Array.isArray(profile?.experience) ? profile.experience : [],
        verificationStatus: profile?.verification_status || 'draft',
        profilePhotoUrl,
        emailConfirmed: Boolean(user.email_confirmed_at),
      },
      files: { frontUrl: '', backUrl: '', videoUrl: '' },
    };
  }));
  return reviews;
}

async function allReviews(admin: ReturnType<typeof createClient>) {
  const references = await reviewReferences(admin);
  const storedReviews = (await Promise.all(references.map((reference) => loadReview(admin, reference))))
    .filter((review): review is NonNullable<typeof review> => Boolean(review))
    .filter((review) => reviewSubmissionVisible(review.candidate.verificationStatus));
  const submittedUserIds = new Set(storedReviews.map((review) => review.userId));
  const signupReviews = await accountReviews(admin, submittedUserIds);
  return [...storedReviews, ...signupReviews]
    .sort((left, right) => String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')));
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function resumeCandidate(profile: Record<string, unknown>) {
  return {
    id: String(profile.user_id || ''),
    name: String(profile.full_name || 'Candidate'),
    email: String(profile.email || ''),
    verificationStatus: String(profile.verification_status || 'draft'),
    relevantYears: Number(profile.relevant_years || 0),
    summary: String(profile.summary || ''),
    resumeFileName: String(profile.resume_file_name || 'Redacted resume'),
    jobTitles: textList(profile.resume_job_titles),
    software: textList(profile.resume_software),
    skills: textList(profile.resume_skills),
    industries: textList(profile.resume_industries),
    companies: textList(profile.resume_companies),
    education: textList(profile.resume_education),
    certifications: textList(profile.resume_certifications),
    languages: textList(profile.resume_languages),
    keywords: textList(profile.resume_keywords),
    resumeSummary: String(profile.resume_summary || ''),
    resumeYearsExperience: Number(profile.resume_years_experience || 0),
    resumeIndexedAt: String(profile.resume_indexed_at || ''),
    searchRank: Number(profile.search_rank || 0),
  };
}

async function searchResumes(admin: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 100) : '';
  const requestedStatus = typeof body.verificationStatus === 'string' ? body.verificationStatus.trim().toLowerCase() : '';
  const verificationStatus = VERIFICATION_STATUSES.has(requestedStatus) ? requestedStatus : '';
  const { data, error } = await admin.rpc('search_admin_candidate_resumes', {
    search_query: query,
    verification_filter: verificationStatus,
    result_limit: 100,
  });
  if (error) throw error;
  return (data || []).map((profile: Record<string, unknown>) => resumeCandidate(profile));
}

async function resumeDetails(admin: ReturnType<typeof createClient>, candidateId: string) {
  const { data: profile, error } = await admin
    .from('candidate_profiles')
    .select('user_id,full_name,email,verification_status,relevant_years,summary,resume_path,resume_file_name,resume_job_titles,resume_software,resume_skills,resume_industries,resume_companies,resume_education,resume_certifications,resume_languages,resume_keywords,resume_summary,resume_years_experience,resume_indexed_at,resume_index_version')
    .eq('user_id', candidateId)
    .maybeSingle();
  if (error) throw error;
  if (!profile || !profile.resume_path || Number(profile.resume_index_version || 0) < 1) return null;
  const resumePath = String(profile.resume_path);
  if (!resumePath.startsWith(`${candidateId}/`)) return null;
  const { data: resumeFile, error: resumeError } = await admin.storage.from(RESUME_BUCKET).download(resumePath);
  if (resumeError || !resumeFile) return null;
  const resumeText = redactContactInfo(await resumeFile.text()).slice(0, 150000);
  return { ...resumeCandidate(profile), resumeText };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    const adminKey = typeof body.adminKey === 'string' ? body.adminKey.trim() : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const master = await masterAccount(admin, token);
    if (!master?.can_review && (!adminKey || !sameHash(await sha256(adminKey), ADMIN_KEY_HASH))) return reply(request, { error: 'Sign in with a review account or enter the correct review key.' }, 401);
    const notify = (profile: Record<string, unknown>) => notifyApproval(admin, profile, { projectUrl: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! });

    if (action === 'candidateSpreadsheetConfig') {
      return reply(request, { configured: Boolean(await candidateAiKey(admin, Deno.env.get('OPENAI_API_KEY') || '')), canConfigure: Boolean(master?.can_review), model: spreadsheetModel(Deno.env.get('CANDIDATE_EXPORT_MODEL')), columns: SPREADSHEET_COLUMNS, prompt: DEFAULT_SPREADSHEET_PROMPT });
    }

    if (action === 'saveCandidateAiKey') {
      if (!master?.can_review) return reply(request, { error: 'Sign in with the master account to save an AI key.' }, 403);
      try {
        await saveCandidateAiKey(admin, body.apiKey, spreadsheetModel(Deno.env.get('CANDIDATE_EXPORT_MODEL')));
        return reply(request, { status: 'saved', configured: true });
      } catch (error) { return reply(request, { error: error.message || 'Could not save the AI key.' }, error.status || 502); }
    }

    if (action === 'candidateSpreadsheetPage') {
      const cursor = typeof body.cursor === 'string' ? body.cursor.trim() : '';
      if (cursor && !UUID_PATTERN.test(cursor)) return reply(request, { error: 'Invalid candidate page.' }, 400);
      let query = admin.from('candidate_profiles').select('user_id,full_name,verification_status,resume_path,requested_rate_min_usd,requested_rate_max_usd,monthly_income_goal_zar').order('user_id', { ascending: true }).limit(51);
      if (cursor) query = query.gt('user_id', cursor);
      const { data, error } = await query;
      if (error) throw error;
      const profiles = (data || []).slice(0, 50);
      const rows = body.includeSaved === true ? await savedSpreadsheetRows(admin, profiles) : await spreadsheetResumeRows(admin, profiles);
      return reply(request, { rows, nextCursor: (data || []).length > 50 ? profiles.at(-1)?.user_id : null });
    }

    if (action === 'generateCandidateSpreadsheetRow') {
      const candidateId = typeof body.candidateId === 'string' ? body.candidateId.trim() : '';
      if (!UUID_PATTERN.test(candidateId)) return reply(request, { error: 'Choose a valid candidate.' }, 400);
      let prompt;
      try { prompt = exportPrompt(body.prompt); } catch (error) { return reply(request, { error: error.message }, 400); }
      const { data: profile, error } = await admin.from('candidate_profiles').select('user_id,full_name,verification_status,resume_path,requested_rate_min_usd,requested_rate_max_usd,monthly_income_goal_zar,location,resume_experience,job_industry_preferences,desired_positions,employment_preference,start_availability,preferred_job_note,portfolio_links,ideal_job_titles,available_hours_per_week').eq('user_id', candidateId).maybeSingle();
      if (error) throw error;
      if (!profile) return reply(request, { error: 'This candidate account was not found.' }, 404);
      try {
        const row = await generateSpreadsheetRow(admin, profile, { prompt, apiKey: await candidateAiKey(admin, Deno.env.get('OPENAI_API_KEY') || ''), model: spreadsheetModel(Deno.env.get('CANDIDATE_EXPORT_MODEL')) });
        return reply(request, { row });
      } catch (error) {
        return reply(request, { error: error.message || 'Could not generate this candidate row.' }, error.status || 502);
      }
    }

    if (action === 'listReviews') {
      const reviews = await allReviews(admin);
      return reply(request, { reviews });
    }

    if (action === 'searchResumes') {
      const candidates = await searchResumes(admin, body);
      return reply(request, { candidates });
    }

    if (action === 'getResumeCandidate') {
      const candidateId = typeof body.candidateId === 'string' ? body.candidateId.trim() : '';
      if (!UUID_PATTERN.test(candidateId)) return reply(request, { error: 'Choose a valid candidate.' }, 400);
      const candidate = await resumeDetails(admin, candidateId);
      if (!candidate) return reply(request, { error: 'That indexed resume was not found.' }, 404);
      return reply(request, { candidate });
    }

    if (action === 'acceptAll') {
      const reviews = await allReviews(admin);
      const userIds = reviews.filter((review) => review.ready && review.hasProfile && reviewSubmissionAcceptable(review.candidate.verificationStatus)).map((review) => review.userId);
      if (!userIds.length) return reply(request, { accepted: 0 });
      const { data: approved, error } = await admin.from('candidate_profiles').update({ verification_status: 'verified', updated_at: new Date().toISOString() }).in('user_id', userIds).select('user_id,full_name,updated_at');
      if (error) throw error;
      const notifications = [];
      for (const profile of approved || []) notifications.push(await notify(profile));
      return reply(request, { accepted: approved?.length || 0, emailFailures: notifications.filter(item => !item.emailSent).length });
    }

    if (action === 'resendApprovalEmail') {
      const reference = typeof body.reference === 'string' ? body.reference.trim().toUpperCase() : '';
      if (!REFERENCE_PATTERN.test(reference)) return reply(request, { error: 'Choose a valid review submission.' }, 400);
      const review = await loadReview(admin, reference);
      if (!review?.hasProfile || review.candidate.verificationStatus !== 'verified') return reply(request, { error: 'Only an approved candidate with an active account can receive an approval email.' }, 409);
      const { data: profile, error } = await admin.from('candidate_profiles').select('user_id,full_name,updated_at').eq('user_id', review.userId).single();
      if (error) throw error;
      return reply(request, await notify(profile));
    }

    if (action === 'acceptReview' || action === 'rejectReview') {
      const reference = typeof body.reference === 'string' ? body.reference.trim().toUpperCase() : '';
      if (!REFERENCE_PATTERN.test(reference)) return reply(request, { error: 'Choose a valid review submission.' }, 400);
      const review = await loadReview(admin, reference);
      if (!review) return reply(request, { error: 'That review submission was not found.' }, 404);
      const { data: progress, error: progressError } = await admin.from('candidate_onboarding').select('review_reference').eq('user_id', review.userId).maybeSingle();
      if (progressError) throw progressError;
      if (progress?.review_reference && progress.review_reference !== reference) return reply(request, { error: 'This candidate has a newer ID submission. Review their latest submission instead.' }, 409);
      if (action === 'acceptReview' && !reviewSubmissionAcceptable(review.candidate.verificationStatus)) return reply(request, { error: 'This candidate must complete a fresh verification before this review can be accepted.' }, 409);
      if (action === 'acceptReview' && !review.ready) return reply(request, { error: 'The ID video must be submitted before this candidate can be accepted.' }, 409);
      if (action === 'acceptReview' && !review.hasProfile) return reply(request, { error: 'This older review is not linked to a current candidate profile.' }, 409);
      const verificationStatus = action === 'acceptReview' ? 'verified' : 'rejected';
      const { data: profile, error } = await admin.from('candidate_profiles').update({ verification_status: verificationStatus, updated_at: new Date().toISOString() }).eq('user_id', review.userId).select('user_id,full_name,updated_at').maybeSingle();
      if (error) throw error;
      if (!profile) return reply(request, { error: 'The candidate profile linked to this review no longer exists.' }, 404);
      const notification = action === 'acceptReview' ? await notify(profile) : {};
      return reply(request, { reference, verificationStatus, ...notification });
    }

    return reply(request, { error: 'Unknown review action.' }, 400);
  } catch (error) {
    console.error('Admin review request failed:', error);
    return reply(request, { error: 'The review dashboard could not complete that request.' }, 500);
  }
});
