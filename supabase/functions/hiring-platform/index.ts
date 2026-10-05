import { parsePortfolioLinks, publicPortfolioLinks } from '../_shared/portfolio-links.mjs';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { MASTER_TOKEN_PATTERN, masterAccount, masterUser, masterWorkspaceHash } from '../_shared/master-access.mjs';
import { candidateAccess } from '../_shared/candidate-access.mjs';
import { onboardingStage } from '../_shared/onboarding-state.mjs';
import { indexResume, resumeIndexColumns, RESUME_INDEX_VERSION } from '../_shared/resume-index.mjs';
import { longerExperience } from '../_shared/experience-tenure.mjs';

const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'https://hirefromsa.com',
  'https://executive-assistant-hiring-flow.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'null',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_SLUG_PATTERN = /^[0-9a-f]{32}$/;
const APPLICATION_STATUSES = new Set(['new', 'shortlisted', 'interviewing', 'rejected', 'hired']);
const REFERRAL_SOURCES = new Set(['search', 'social', 'friend', 'job-board', 'other']);
const REFERRAL_BYPASS_HASH = '17f0d6e758b103e5845dad735e30b2379ac3b7895976c71ce8b97e6bd5fd27dd';
const BUCKET = 'sava-id-review-videos';
const RESUME_BUCKET = 'candidate-resumes';

function headers(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function reply(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

async function saveCandidateReply(admin: ReturnType<typeof createClient>, threadId: string, candidateId: string, body: string) {
  const { data: message, error } = await admin.from('candidate_messages').insert({ thread_id: threadId, sender: 'candidate', body }).select('id, sender, body, created_at').single();
  if (error) throw error;
  const { error: touchError } = await admin.from('candidate_message_threads').update({ updated_at: message.created_at }).eq('id', threadId).eq('candidate_id', candidateId);
  // The message is already durable. A failed list timestamp must not invite a duplicate send.
  if (touchError) console.error('Candidate message saved; thread timestamp update failed:', touchError);
  return { id: message.id, sender: message.sender, body: message.body, createdAt: message.created_at };
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanList(value: unknown, maxItems = 30, maxLength = 500) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => clean(item, maxLength)).filter(Boolean)
    : [];
}

function tokenFrom(request: Request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameHash(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function normalizeQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const type = record.type === 'multiple-choice' ? 'multiple-choice' : 'text';
    return {
      text: clean(record.text, 240),
      type,
      options: type === 'multiple-choice' ? cleanList(record.options, 12, 120) : [],
    };
  }).filter((question) => question.text && (question.type === 'text' || question.options.length >= 2));
}

function normalizeAnswers(value: unknown, questions: Array<{ text: string; type: string; options: string[] }>) {
  if (!questions.length) return [];
  if (!Array.isArray(value) || value.length !== questions.length) return null;
  const answers = questions.map((question, index) => {
    const item = value[index] && typeof value[index] === 'object' ? value[index] as Record<string, unknown> : {};
    const answer = clean(item.answer, 2000);
    if (!answer || (question.type === 'multiple-choice' && !question.options.includes(answer))) return null;
    return { question: question.text, answer };
  });
  return answers.some((answer) => !answer) ? null : answers;
}

function normalizeExperience(value: unknown, requireDescription = true) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      jobTitle: clean(record.jobTitle, 180),
      companyName: clean(record.companyName, 120),
      startDate: clean(record.startDate, 7),
      endDate: clean(record.endDate, 7),
      currentRole: Boolean(record.currentRole),
      description: clean(record.description, 10000),
      preference: clean(record.preference, 30),
    };
  }).filter((entry) => entry.jobTitle && entry.companyName && entry.startDate && (!requireDescription || entry.description));
}

function experienceYears(experience: Array<Record<string, unknown>>) {
  let months = 0;
  const now = new Date();
  for (const entry of experience) {
    const start = /^\d{4}-\d{2}$/.test(String(entry.startDate)) ? new Date(`${entry.startDate}-01T00:00:00Z`) : null;
    const endValue = entry.currentRole ? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}` : String(entry.endDate || '');
    const end = /^\d{4}-\d{2}$/.test(endValue) ? new Date(`${endValue}-01T00:00:00Z`) : null;
    if (start && end && end >= start) months += Math.min(600, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1);
  }
  return Math.min(80, Math.round((months / 12) * 10) / 10);
}

function profileSummary(experience: Array<Record<string, unknown>>) {
  const newest = experience[0] || {};
  const description = clean(newest.description, 1000);
  if (description) return description.split(/(?<=[.!?])\s+/)[0].slice(0, 300);
  const role = clean(newest.jobTitle, 180);
  const company = clean(newest.companyName, 120);
  return role ? `${role}${company ? ` at ${company}` : ''}.` : 'Candidate profile submitted for employer review.';
}

function publicCandidateSummary(profile: Record<string, unknown>, role: string, years: number) {
  const indexed = clean(profile.resume_summary, 500).replace(/\s+/g, ' ');
  if (indexed && !/\[[^\]]*REDACTED\]/i.test(indexed)) return indexed;
  const written = clean(profile.summary, 1000).replace(/\s+/g, ' ');
  if (written && !/^(candidate profile submitted|verified candidate)/i.test(written)) return written;
  const skills = cleanList(profile.resume_skills, 3, 80);
  return [years ? `${years}+ years of relevant experience.` : '', skills.length ? `Key skills include ${skills.join(', ')}.` : ''].filter(Boolean).join(' ') || `Experience in ${role}.`;
}

// Platform fee shown to candidates: hirers see the rate they posted; candidates see it net of the fee.
// Hourly: $2/hour less. Monthly: $2 x the role's monthly hours less. Contract: 20% less.
const PLATFORM_FEE_PER_HOUR = 2;
const CONTRACT_FEE_RATE = 0.2;
const MONTHLY_HOURS: Record<string, number> = { 'Full-time': 40 * 52 / 12, 'Part-time': 20 * 52 / 12 };

// Candidate pay always rounds UP to the next whole dollar (candidates think in rand, so no cents).
function roundPay(value: number) {
  return Math.max(0, Math.ceil(Math.round(value * 100) / 100));
}

function candidatePay(row: Record<string, unknown>, amount: number) {
  const period = row.pay_period === 'month' ? 'month' : 'hour';
  if (row.employment_type === 'Contract') return roundPay(amount * (1 - CONTRACT_FEE_RATE));
  if (period === 'hour') return roundPay(amount - PLATFORM_FEE_PER_HOUR);
  const hours = MONTHLY_HOURS[String(row.employment_type)] ?? MONTHLY_HOURS['Full-time'];
  return roundPay(amount - PLATFORM_FEE_PER_HOUR * hours);
}

// Reverse of candidatePay: what the hirer pays for an amount the candidate is paid.
function hirerPay(row: Record<string, unknown>, amount: number) {
  const period = row.pay_period === 'month' ? 'month' : 'hour';
  if (row.employment_type === 'Contract') return roundPay(amount / (1 - CONTRACT_FEE_RATE));
  if (period === 'hour') return roundPay(amount + PLATFORM_FEE_PER_HOUR);
  const hours = MONTHLY_HOURS[String(row.employment_type)] ?? MONTHLY_HOURS['Full-time'];
  return Math.round(amount + PLATFORM_FEE_PER_HOUR * hours);
}

function bidResponse(application: Record<string, unknown>, job: Record<string, unknown>, view: 'owner' | 'candidate') {
  const values = [application.bid_rate, application.bid_min, application.bid_max].map(Number);
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return null;
  const [rate, min, max] = view === 'owner' ? values.map((value) => hirerPay(job, value)) : values;
  return { rate, min, max, period: job.pay_period === 'month' ? 'month' : 'hour' };
}

async function ensureApplicationThread(admin: ReturnType<typeof createClient>, applicationId: string, job: Record<string, unknown>, candidateName: string, candidateId: string) {
  const { data: existing, error: threadError } = await admin.from('candidate_message_threads').select('id').eq('application_id', applicationId).maybeSingle();
  if (threadError) throw threadError;
  if (existing) return { id: String(existing.id), created: false };
  const { data: employer, error: employerError } = await admin.from('hirer_workspaces').select('edit_token_hash').eq('id', job.employer_id).single();
  if (employerError) throw employerError;
  const { data: created, error: createError } = await admin.from('candidate_message_threads').insert({
    employer_id: job.employer_id,
    edit_token_hash: employer.edit_token_hash,
    candidate_key: `application:${applicationId}`,
    candidate_name: candidateName,
    role_name: job.title,
    candidate_id: candidateId,
    application_id: applicationId,
  }).select('id').single();
  if (createError) throw createError;
  return { id: String(created.id), created: true };
}

function payLabel(min: number, max: number, period: string) {
  const money = (value: number) => (Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(2));
  return `$${money(min)}–$${money(max)} / ${period}`;
}

// view: 'owner' = the hirer who posted it (or master), 'candidate' = signed-in candidates and other hirers, 'public' = signed out.
function jobResponse(row: Record<string, unknown>, view: 'owner' | 'candidate' | 'public' = 'owner') {
  const period = row.pay_period === 'month' ? 'month' : 'hour';
  const postedMin = Number(row.pay_min || 0);
  const postedMax = Number(row.pay_max || 0);
  const payMin = view === 'candidate' ? candidatePay(row, postedMin) : postedMin;
  const payMax = view === 'candidate' ? candidatePay(row, postedMax) : postedMax;
  return {
    id: row.id,
    company: row.company_name,
    initial: String(row.company_name || 'H').slice(0, 1).toUpperCase(),
    title: row.title,
    arrangement: row.arrangement,
    type: row.employment_type,
    location: row.location,
    payMin: view === 'public' ? null : payMin,
    payMax: view === 'public' ? null : payMax,
    payPeriod: period,
    payHidden: view === 'public',
    pay: view === 'public' ? '' : payLabel(payMin, payMax, period),
    hiringTimeline: row.hiring_timeline || '',
    ...(view === 'owner' ? { promoted: Boolean(row.promoted), promotionBudget: row.promoted ? Number(row.promotion_budget || 0) : 0 } : {}),
    description: row.description,
    responsibilities: row.responsibilities || [],
    skills: row.skills || [],
    questions: row.questions || [],
    status: row.status,
    createdAt: row.created_at,
  };
}

// Only returns a candidate-consented introduction video. Callers still decide
// whether the candidate profile itself is visible.
async function candidateIntroUrl(admin: ReturnType<typeof createClient>, candidateId: string) {
  if (!candidateId) return '';
  const { data, error } = await admin.from('candidate_onboarding').select('intro_path, intro_consent_at').eq('user_id', candidateId).maybeSingle();
  if (error) throw error;
  return data?.intro_path && data.intro_consent_at
    ? await signedAsset(admin, 'candidate-introductions', data.intro_path)
    : '';
}

async function candidateUser(request: Request, admin: ReturnType<typeof createClient>) {
  const token = tokenFrom(request);
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  const accountRole = user?.app_metadata?.account_role;
  return error || !user?.email_confirmed_at || (accountRole && accountRole !== 'candidate') ? null : user;
}

async function authenticatedUser(request: Request, admin: ReturnType<typeof createClient>) {
  const token = tokenFrom(request);
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  return error ? null : user;
}

async function employerUser(request: Request, admin: ReturnType<typeof createClient>) {
  const token = tokenFrom(request);
  if (MASTER_TOKEN_PATTERN.test(token || '')) {
    const account = await masterAccount(admin, token);
    return account ? masterUser(account) : null;
  }
  const user = await authenticatedUser(request, admin);
  return user?.email_confirmed_at && user.app_metadata?.account_role === 'employer' ? user : null;
}

async function ensureEmployer(admin: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const employerId = clean(body.employerId, 36);
  const editToken = clean(body.editToken, 160);
  const companyName = clean(body.companyName, 120) || 'Your company';
  if (!UUID_PATTERN.test(employerId) || editToken.length < 32) return { error: 'Hirer workspace access is missing or invalid.' };
  const tokenHash = MASTER_TOKEN_PATTERN.test(editToken)
    ? await masterWorkspaceHash(admin, editToken, employerId) : await sha256(editToken);
  if (!tokenHash) return { error: 'Your session has expired. Sign in again.' };
  const { data: existing, error } = await admin.from('hirer_workspaces').select('id, edit_token_hash, company_name').eq('id', employerId).maybeSingle();
  if (error) throw error;
  if (existing && existing.edit_token_hash !== tokenHash) return { error: 'This browser cannot access that hirer workspace.' };
  if (!existing) {
    const { data: created, error: createError } = await admin.from('hirer_workspaces').insert({ id: employerId, edit_token_hash: tokenHash, company_name: companyName }).select('id, company_name').single();
    if (createError) throw createError;
    return { employer: created };
  }
  if (companyName !== 'Your company' && companyName !== existing.company_name) {
    const { data: updated, error: updateError } = await admin.from('hirer_workspaces').update({ company_name: companyName, updated_at: new Date().toISOString() }).eq('id', employerId).select('id, company_name').single();
    if (updateError) throw updateError;
    return { employer: updated };
  }
  return { employer: existing };
}

async function signedAsset(admin: ReturnType<typeof createClient>, bucket: string, path: string) {
  if (!path) return '';
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return error ? '' : data?.signedUrl || '';
}

async function ensureResumeExperience(admin: ReturnType<typeof createClient>, profile: Record<string, unknown>) {
  if (!profile?.resume_path || profile.resume_index_version == null || Number(profile.resume_index_version) >= RESUME_INDEX_VERSION) return;
  const { data: resume, error: downloadError } = await admin.storage.from(RESUME_BUCKET).download(String(profile.resume_path));
  if (downloadError || !resume) { console.error('Stored resume could not be read for experience:', profile.user_id, downloadError); return; }
  const values = resumeIndexColumns(indexResume(await resume.text()));
  const { error: updateError } = await admin.from('candidate_profiles').update(values).eq('user_id', profile.user_id);
  if (updateError) { console.error('Resume experience could not be saved:', profile.user_id, updateError); return; }
  Object.assign(profile, values);
}

async function backfillResumeIndexes(admin: ReturnType<typeof createClient>) {
  const { data: pending, error } = await admin.from('candidate_profiles')
    .select('user_id, resume_path, resume_index_version')
    .neq('resume_path', '')
    .lt('resume_index_version', RESUME_INDEX_VERSION)
    .limit(500);
  if (error) throw error;
  const profiles = pending || [];
  let indexed = 0;
  for (let offset = 0; offset < profiles.length; offset += 5) {
    const batch = profiles.slice(offset, offset + 5);
    const results = await Promise.all(batch.map(async (profile) => {
      const { data: resume, error: downloadError } = await admin.storage.from(RESUME_BUCKET).download(String(profile.resume_path));
      if (downloadError || !resume) {
        console.error('Stored resume could not be indexed:', profile.user_id, downloadError);
        return false;
      }
      const values = resumeIndexColumns(indexResume(await resume.text()));
      const { error: updateError } = await admin.from('candidate_profiles').update(values).eq('user_id', profile.user_id);
      if (updateError) {
        console.error('Resume index could not be saved:', profile.user_id, updateError);
        return false;
      }
      return true;
    }));
    indexed += results.filter(Boolean).length;
  }
  return indexed;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 40);

    if (action === 'listJobs') {
      const { data, error } = await admin.from('hiring_jobs').select('*').eq('status', 'active').eq('board_hidden', false).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      // Who is asking decides which pay they see: signed out = no pay, candidates = net of the platform fee,
      // the hirer who posted a job (or master) = the rate they posted.
      const employer = tokenFrom(request) ? await employerUser(request, admin) : null;
      const isMaster = Boolean(employer?.app_metadata?.master);
      let ownEmployerId = '';
      if (employer && !isMaster && clean(body.employerId, 36)) {
        const access = await ensureEmployer(admin, body);
        if (!access.error) ownEmployerId = String(access.employer.id);
      }
      const signedIn = Boolean(employer) || Boolean(tokenFrom(request) && await authenticatedUser(request, admin));
      const view = (row: Record<string, unknown>) => (isMaster || (ownEmployerId && String(row.employer_id) === ownEmployerId) ? 'owner' : signedIn ? 'candidate' : 'public');
      return reply(request, { jobs: (data || []).map((row) => jobResponse(row, view(row))) });
    }

    if (action === 'publicCandidateProfile') {
      const shareSlug = clean(body.shareSlug, 32).toLowerCase();
      if (!SHARE_SLUG_PATTERN.test(shareSlug)) return reply(request, { error: 'Candidate profile not found.' }, 404);
      const { data: profile, error } = await admin.from('candidate_profiles').select('*').eq('share_slug', shareSlug).maybeSingle();
      if (error) throw error;
      if (!profile || !candidateAccess(profile).applicationReady) return reply(request, { error: 'Candidate profile not found.' }, 404);
      await ensureResumeExperience(admin, profile);
      const manualExperience = longerExperience(normalizeExperience(profile.experience));
      const resumeExperience = longerExperience(normalizeExperience(profile.resume_experience, false));
      const experience = (manualExperience.length ? manualExperience : resumeExperience).slice(0, 20).map((entry) => ({
        jobTitle: entry.jobTitle,
        companyName: entry.companyName,
        startDate: entry.startDate,
        endDate: entry.endDate,
        currentRole: entry.currentRole,
        description: entry.description,
      }));
      const primaryRole = profile.resume_job_titles?.[0] || experience[0]?.jobTitle || 'Remote professional';
      const relevantYears = Math.max(Number(profile.relevant_years || 0), Number(profile.resume_years_experience || 0));
      return reply(request, { profile: {
        name: profile.full_name || 'Hire From SA candidate',
        primaryRole,
        summary: publicCandidateSummary(profile, primaryRole, relevantYears),
        relevantYears,
        requestedRateMinUsd: profile.requested_rate_min_usd == null ? null : Number(profile.requested_rate_min_usd),
        requestedRateMaxUsd: profile.requested_rate_max_usd == null ? null : Number(profile.requested_rate_max_usd),
        availableHoursPerWeek: profile.available_hours_per_week,
        location: profile.location || '',
        idealJobTitles: cleanList(profile.ideal_job_titles, 5, 80),
        portfolioLinks: publicPortfolioLinks(profile.portfolio_links),
        startAvailability: profile.start_availability || '',
        experience,
        experienceSource: manualExperience.length ? 'candidate' : 'resume',
        jobTitles: cleanList(profile.resume_job_titles, 12, 180),
        skills: profile.resume_skills || [],
        software: profile.resume_software || [],
        industries: profile.resume_industries || [],
        education: cleanList(profile.resume_education, 12, 240),
        certifications: cleanList(profile.resume_certifications, 12, 240),
        languages: profile.resume_languages || [],
        photoUrl: await signedAsset(admin, BUCKET, String(profile.profile_photo_path || '')),
        introUrl: await candidateIntroUrl(admin, String(profile.user_id || '')),
        verified: true,
      } });
    }

    if (action === 'createJob') {
      if (!await employerUser(request, admin)) return reply(request, { error: 'Sign in with an employer account to post a job.' }, 401);
      const access = await ensureEmployer(admin, body);
      if (access.error) return reply(request, { error: access.error }, 403);
      const title = clean(body.title, 180);
      const description = clean(body.description, 10000);
      const questions = normalizeQuestions(body.questions);
      const payMin = Number(body.payMin);
      const payMax = Number(body.payMax);
      if (!title || !description || !Number.isFinite(payMin) || !Number.isFinite(payMax) || payMin < 0 || payMax < payMin) {
        return reply(request, { error: 'Complete the title, description, and pay before publishing.' }, 400);
      }
      const requestedId = clean(body.jobId, 80);
      const id = requestedId || crypto.randomUUID();
      const values = {
        id,
        employer_id: access.employer.id,
        company_name: clean(body.companyName, 120) || access.employer.company_name || 'Your company',
        title,
        arrangement: clean(body.arrangement, 40) || 'Remote',
        employment_type: clean(body.employmentType, 60) || 'Full-time',
        location: clean(body.location, 120) || 'South Africa',
        pay_min: payMin,
        pay_max: payMax,
        pay_period: body.payPeriod === 'month' ? 'month' : 'hour',
        hiring_timeline: clean(body.hiringTimeline, 60) || null,
        description,
        responsibilities: cleanList(body.responsibilities, 40, 500),
        skills: cleanList(body.skills, 40, 120),
        questions,
        status: 'active',
        promoted: Boolean(body.promoted),
        promotion_budget: body.promoted ? Math.max(0, Number(body.promotionBudget) || 0) : null,
        updated_at: new Date().toISOString(),
      };
      const { data: existing, error: readError } = await admin.from('hiring_jobs').select('id, employer_id').eq('id', id).maybeSingle();
      if (readError) throw readError;
      if (existing && existing.employer_id !== access.employer.id) return reply(request, { error: 'That job belongs to a different hirer workspace.' }, 403);
      const query = existing
        ? admin.from('hiring_jobs').update(values).eq('id', id)
        : admin.from('hiring_jobs').insert(values);
      const { data: saved, error } = await query.select('*').single();
      if (error) throw error;
      return reply(request, { job: jobResponse(saved), status: 'published' }, existing ? 200 : 201);
    }

    if (action === 'deleteJob') {
      if (!await employerUser(request, admin)) return reply(request, { error: 'Sign in with an employer account to delete a job.' }, 401);
      const access = await ensureEmployer(admin, body);
      if (access.error) return reply(request, { error: access.error }, 403);
      const jobId = clean(body.jobId, 80);
      if (!jobId) return reply(request, { error: 'Choose a job to delete.' }, 400);

      const { data: job, error: readError } = await admin.from('hiring_jobs').select('id, employer_id').eq('id', jobId).maybeSingle();
      if (readError) throw readError;
      if (!job) return reply(request, { error: 'That job could not be found.' }, 404);
      if (job.employer_id !== access.employer.id) return reply(request, { error: 'That job belongs to a different hirer workspace.' }, 403);

      const { data: deleted, error: deleteError } = await admin.from('hiring_jobs')
        .delete()
        .eq('id', jobId)
        .eq('employer_id', access.employer.id)
        .select('id')
        .maybeSingle();
      if (deleteError) throw deleteError;
      if (!deleted) return reply(request, { error: 'That job could not be deleted.' }, 409);
      return reply(request, { status: 'deleted', jobId: deleted.id });
    }

    if (action === 'employerDashboard') {
      if (!await employerUser(request, admin)) return reply(request, { error: 'Sign in with an employer account to open the hirer workspace.' }, 401);
      const access = await ensureEmployer(admin, body);
      if (access.error) return reply(request, { error: access.error }, 403);
      const { data: jobs, error: jobsError } = await admin.from('hiring_jobs').select('*').eq('employer_id', access.employer.id).order('created_at', { ascending: false });
      if (jobsError) throw jobsError;
      const jobIds = (jobs || []).map((job) => job.id);
      let applications: Array<Record<string, unknown>> = [];
      if (jobIds.length) {
        const { data, error } = await admin.from('job_applications').select('*').in('job_id', jobIds).order('submitted_at', { ascending: false });
        if (error) throw error;
        applications = data || [];
      }
      const candidateIds = [...new Set(applications.map((application) => String(application.candidate_id)))];
      let profiles: Array<Record<string, unknown>> = [];
      if (candidateIds.length) {
        const { data, error } = await admin.from('candidate_profiles').select('*').in('user_id', candidateIds);
        if (error) throw error;
        profiles = data || [];
      }
      const jobMap = new Map((jobs || []).map((job) => [job.id, job]));
      const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile]));
      const applicationResults = await Promise.all(applications.map(async (application) => {
        const profile = profileMap.get(application.candidate_id) || {};
        const job = jobMap.get(application.job_id) || {};
        return {
          id: application.id,
          jobId: application.job_id,
          status: application.status,
          match: application.match_score,
          answers: application.answers || [],
          bid: bidResponse(application, job, 'owner'),
          introMessage: application.intro_message || '',
          submittedAt: application.submitted_at,
          candidate: {
            id: application.candidate_id,
            name: profile.full_name || 'Candidate',
            email: profile.email || '',
            calendarLink: profile.calendar_link || '',
            experience: profile.experience || [],
            relevantYears: Number(profile.relevant_years || 0),
            summary: profile.summary || 'Candidate profile submitted for review.',
            verificationStatus: profile.verification_status || 'draft',
            shareSlug: profile.share_slug || '',
            photoUrl: await signedAsset(admin, BUCKET, String(profile.profile_photo_path || '')),
            introUrl: await candidateIntroUrl(admin, String(profile.user_id || '')),
            resumeFileName: profile.resume_file_name || '',
            resumeUrl: await signedAsset(admin, RESUME_BUCKET, String(profile.resume_path || '')),
          },
          job: jobResponse(job),
        };
      }));
      return reply(request, { jobs: (jobs || []).map((row) => jobResponse(row, "owner")), applications: applicationResults });
    }

    if (action === 'searchCandidates') {
      if (!await employerUser(request, admin)) return reply(request, { error: 'Sign in with an employer account to search candidates.' }, 401);
      const access = await ensureEmployer(admin, body);
      if (access.error) return reply(request, { error: access.error }, 403);
      const query = clean(body.query, 100).toLowerCase();
      const requestedLimit = Number(body.limit);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.floor(requestedLimit))) : 30;
      const indexed = await backfillResumeIndexes(admin);
      const { data: profiles, error } = await admin.rpc('search_candidate_resumes', {
        search_query: query,
        result_limit: limit,
      });
      if (error) throw error;
      const userIds = (profiles || []).map((profile) => profile.user_id).filter(Boolean);
      const { data: slugRows, error: slugError } = userIds.length
        ? await admin.from('candidate_profiles').select('user_id, share_slug').in('user_id', userIds)
        : { data: [], error: null };
      if (slugError) throw slugError;
      const shareSlugs = new Map((slugRows || []).map((row) => [row.user_id, row.share_slug || '']));
      const candidates = await Promise.all((profiles || []).map(async (profile) => {
        const manualExperience = longerExperience(normalizeExperience(profile.experience));
        const resumeExperience = longerExperience(normalizeExperience(profile.resume_experience, false));
        const experience = (manualExperience.length ? manualExperience : resumeExperience).slice(0, 5).map((entry) => ({
          jobTitle: entry.jobTitle,
          companyName: entry.companyName,
          startDate: entry.startDate,
          endDate: entry.endDate,
          currentRole: entry.currentRole,
          description: entry.description,
        }));
        return {
          id: profile.user_id,
          name: profile.full_name || 'Candidate',
          primaryRole: profile.resume_job_titles?.[0] || experience[0]?.jobTitle || 'Remote professional',
          relevantYears: Math.max(Number(profile.relevant_years || 0), Number(profile.resume_years_experience || 0)),
          summary: profile.resume_summary || profile.summary || 'Verified candidate profile.',
          experience,
          jobTitles: profile.resume_job_titles || [],
          software: profile.resume_software || [],
          skills: profile.resume_skills || [],
          industries: profile.resume_industries || [],
          companies: profile.resume_companies || [],
          education: profile.resume_education || [],
          certifications: profile.resume_certifications || [],
          languages: profile.resume_languages || [],
          keywords: profile.resume_keywords || [],
          searchRank: Number(profile.search_rank || 0),
          resumeIndexedAt: profile.resume_indexed_at || null,
          shareSlug: shareSlugs.get(profile.user_id) || '',
          photoUrl: await signedAsset(admin, BUCKET, String(profile.profile_photo_path || '')),
            introUrl: await candidateIntroUrl(admin, String(profile.user_id || '')),
        };
      }));
      return reply(request, { candidates, query, count: candidates.length, resumesIndexed: indexed });
    }

    if (action === 'updateApplication') {
      if (!await employerUser(request, admin)) return reply(request, { error: 'Sign in with an employer account to update applicants.' }, 401);
      const access = await ensureEmployer(admin, body);
      if (access.error) return reply(request, { error: access.error }, 403);
      const applicationId = clean(body.applicationId, 36);
      const status = clean(body.status, 20);
      if (!UUID_PATTERN.test(applicationId) || !APPLICATION_STATUSES.has(status)) return reply(request, { error: 'Invalid application update.' }, 400);
      const { data: application, error } = await admin.from('job_applications').select('id, job_id').eq('id', applicationId).maybeSingle();
      if (error) throw error;
      if (!application) return reply(request, { error: 'Application not found.' }, 404);
      const { data: job, error: jobError } = await admin.from('hiring_jobs').select('employer_id').eq('id', application.job_id).single();
      if (jobError) throw jobError;
      if (job.employer_id !== access.employer.id) return reply(request, { error: 'That application belongs to a different hirer workspace.' }, 403);
      const { error: updateError } = await admin.from('job_applications').update({ status, updated_at: new Date().toISOString() }).eq('id', applicationId);
      if (updateError) throw updateError;
      return reply(request, { status });
    }

    const user = await candidateUser(request, admin);
    if (!user) return reply(request, { error: 'Sign in with your verified candidate account to continue.' }, 401);

    if (action === 'updateCandidateProfileFacts') {
      const rateMinRaw = String(body.requestedRateMinUsd ?? '').trim();
      const rateMaxRaw = String(body.requestedRateMaxUsd ?? '').trim();
      const hoursRaw = String(body.availableHoursPerWeek ?? '').trim();
      const location = clean(body.location, 120);
      const roles = typeof body.idealJobTitles === 'string' ? body.idealJobTitles.split(/[,\n]/).map((role: string) => role.trim().replace(/\s+/g, ' ')).filter(Boolean) : [];
      const startAvailability = clean(body.startAvailability, 20);
      const note = clean(body.preferredJobNote, 400);
      const rateMin = rateMinRaw ? Number(rateMinRaw) : null;
      const rateMax = rateMaxRaw ? Number(rateMaxRaw) : null;
      const hours = hoursRaw ? Number(hoursRaw) : null;
      if ((rateMin === null) !== (rateMax === null) ||
          (rateMin !== null && (!Number.isFinite(rateMin) || rateMin <= 0 || rateMin > 1000 || !/^\d+(?:\.\d{1,2})?$/.test(rateMinRaw))) ||
          (rateMax !== null && (!Number.isFinite(rateMax) || rateMax < rateMin! || rateMax > 1000 || !/^\d+(?:\.\d{1,2})?$/.test(rateMaxRaw))) ||
          (hours !== null && (!Number.isInteger(hours) || hours < 1 || hours > 80)) ||
          String(body.location ?? '').trim().length > 120 || roles.length > 5 || roles.some((role: string) => role.length > 80) ||
          !['', 'immediately', 'two_weeks', 'one_month', 'flexible'].includes(startAvailability) || String(body.preferredJobNote ?? '').trim().length > 400) {
        return reply(request, { error: 'Enter up to five ideal roles, valid USD hourly rates, weekly hours from 1 to 80, and a location under 120 characters.' }, 400);
      }
      let portfolioLinks;
      try { portfolioLinks = parsePortfolioLinks(body.portfolioLinks); }
      catch (error) { return reply(request, { error: error.message }, 400); }
      const values = { ...(body.portfolioLinks !== undefined ? { portfolio_links: portfolioLinks } : {}), requested_rate_min_usd: rateMin, requested_rate_max_usd: rateMax, available_hours_per_week: hours, location,
        ...(body.idealJobTitles !== undefined ? { ideal_job_titles: roles } : {}),
        ...(body.startAvailability !== undefined ? { start_availability: startAvailability } : {}),
        ...(body.preferredJobNote !== undefined ? { preferred_job_note: note } : {}),
        updated_at: new Date().toISOString() };
      const { data: profile, error } = await admin.from('candidate_profiles').update(values).eq('user_id', user.id).select('user_id').maybeSingle();
      if (error) throw error;
      if (!profile) return reply(request, { error: 'Your candidate profile could not be found.' }, 404);
      return reply(request, { status: 'saved' });
    }

    if (action === 'submitReferral') {
      const source = clean(body.source, 40);
      const other = source === 'other' ? clean(body.other, 240) : '';
      if (!REFERRAL_SOURCES.has(source) || (source === 'other' && !other)) {
        return reply(request, { error: 'Choose where you heard about Hire From SA.' }, 400);
      }
      const bypassVerification = source === 'other'
        && sameHash(await sha256(other.toLowerCase()), REFERRAL_BYPASS_HASH);
      const values: Record<string, unknown> = {
        referral_source: source,
        referral_other: other,
        verification_bypass: bypassVerification,
        updated_at: new Date().toISOString(),
      };
      if (bypassVerification) values.verification_status = 'verified';
      const { data: profile, error } = await admin.from('candidate_profiles').update(values).eq('user_id', user.id).select('user_id, verification_status, resume_path').maybeSingle();
      if (error) throw error;
      if (!profile) return reply(request, { error: 'Your candidate profile could not be found.' }, 404);
      return reply(request, {
        status: 'saved',
        bypassVerification,
        resumeRequired: !clean(profile.resume_path, 500),
        verificationStatus: profile.verification_status,
        shareSlug: profile.share_slug || '',
      });
    }

    if (action === 'saveProfile' || action === 'submitApplication') {
      const submittedExperience = normalizeExperience(body.experience);
      const existingProfileResult = await admin.from('candidate_profiles').select('experience, profile_photo_path, resume_path, resume_file_name, verification_status, verification_bypass, onboarding_preferences_required, preferences_completed_at').eq('user_id', user.id).maybeSingle();
      if (existingProfileResult.error) throw existingProfileResult.error;
      const existingProfile = existingProfileResult.data || {};
      if (action === 'submitApplication') {
        const access = candidateAccess(existingProfile);
        if (access.resumeRequired) return reply(request, { error: 'Upload a resume before applying.', code: 'RESUME_REQUIRED' }, 403);
        if (existingProfile.verification_status === 'pending' && !existingProfile.verification_bypass) return reply(request, { error: 'Your identity review is pending. We will email you when it is approved.', code: 'VERIFICATION_PENDING' }, 403);
        if (!access.verificationComplete) return reply(request, { error: 'Finish up next steps: add your headshot, ID photos, and video before applying.', code: 'VERIFICATION_REQUIRED' }, 403);
        if (!access.applicationReady) return reply(request, { error: 'Complete your job preferences before applying.', code: 'ONBOARDING_REQUIRED' }, 403);
        const { data: onboarding, error: onboardingError } = await admin.from('candidate_onboarding').select('*').eq('user_id', user.id).maybeSingle();
        if (onboardingError) throw onboardingError;
        if (onboardingStage(existingProfile, onboarding || {}) !== 'complete') return reply(request, { error: 'Finish your approved-candidate video and introduction step before applying.', code: 'ONBOARDING_REQUIRED' }, 403);
      }
      const existingExperience = normalizeExperience(existingProfile.experience);
      const experience = submittedExperience.length ? submittedExperience : existingExperience;
      const firstName = clean(user.user_metadata?.first_name, 80);
      const lastName = clean(user.user_metadata?.last_name, 80);
      const fullName = clean(body.fullName, 160) || `${firstName} ${lastName}`.trim() || clean(user.email, 160) || 'Candidate';
      const photoPath = (action === 'saveProfile' ? clean(body.photoPath, 500) : '') || existingProfile.profile_photo_path || '';
      const resumePath = (action === 'saveProfile' ? clean(body.resumePath, 500) : '') || existingProfile.resume_path || '';
      const resumeFileName = (action === 'saveProfile' ? clean(body.resumeFileName, 255) : '') || existingProfile.resume_file_name || '';
      // Only connect files uploaded into this candidate's private storage folder.
      if (photoPath && photoPath !== existingProfile.profile_photo_path) {
        const folder = `candidate-profiles/${user.id}`;
        const name = photoPath.startsWith(`${folder}/`) ? photoPath.slice(folder.length + 1) : '';
        if (!/^profile(?:-[0-9a-f-]+\.(?:jpg|png|webp))?$/.test(name)) return reply(request, { error: 'Upload your own headshot before connecting it.' }, 400);
        const { data: photos, error } = await admin.storage.from(BUCKET).list(folder, { limit: 10, search: name });
        if (error) throw error;
        if (!photos?.some((file) => file.name === name)) return reply(request, { error: 'Upload your headshot before connecting it.' }, 400);
      }
      if (resumePath && resumePath !== existingProfile.resume_path) {
        if (resumePath !== `${user.id}/resume.txt`) return reply(request, { error: 'Upload your own resume before connecting it.' }, 400);
        const { data: resumes, error } = await admin.storage.from(RESUME_BUCKET).list(user.id, { limit: 10, search: 'resume.txt' });
        if (error) throw error;
        if (!resumes?.some((file) => file.name === 'resume.txt')) return reply(request, { error: 'Upload your resume before connecting it.' }, 400);
      }
      const profile = {
        user_id: user.id,
        email: clean(user.email, 254).toLowerCase(),
        full_name: fullName,
        calendar_link: clean(body.calendarLink, 500) || clean(user.user_metadata?.calendar_link, 500),
        experience,
        relevant_years: experienceYears(experience),
        summary: profileSummary(experience),
        profile_photo_path: photoPath,
        resume_path: resumePath,
        resume_file_name: resumeFileName,
        verification_status: existingProfile.verification_status || 'draft',
        updated_at: new Date().toISOString(),
      };
      const { error: profileError } = await admin.from('candidate_profiles').upsert(profile, { onConflict: 'user_id' });
      if (profileError) throw profileError;
      if (action === 'saveProfile') return reply(request, { profile: { ...profile, userId: profile.user_id } });

      const jobId = clean(body.jobId, 80);
      const { data: job, error: jobError } = await admin.from('hiring_jobs').select('*').eq('id', jobId).eq('status', 'active').eq('board_hidden', false).maybeSingle();
      if (jobError) throw jobError;
      if (!job) return reply(request, { error: 'This job is no longer accepting applications.' }, 404);
      if (!resumePath) return reply(request, { error: 'Upload a resume before applying.' }, 400);
      const questions = normalizeQuestions(job.questions);
      const answers = normalizeAnswers(body.answers, questions);
      if (!answers) return reply(request, { error: 'Answer every applicant question before submitting.' }, 400);
      const bidRate = Number(body.bidRate);
      const bidMin = Number(body.bidMin);
      const bidMax = Number(body.bidMax);
      const introMessage = clean(body.introMessage, 300);
      if (![bidRate, bidMin, bidMax].every((value) => Number.isFinite(value) && value > 0) || bidMin > bidMax || bidRate < bidMin || bidRate > bidMax) {
        return reply(request, { error: "Add your preferred rate and the range you'd accept." }, 400);
      }
      if (introMessage.length < 20) return reply(request, { error: 'Add a one-sentence introduction for the hirer.' }, 400);
      const matchScore = Math.min(100, Math.round(60 + Math.min(40, profile.relevant_years * 4)));
      const applicationValues = { job_id: jobId, candidate_id: user.id, answers, match_score: matchScore, bid_rate: roundPay(bidRate), bid_min: roundPay(bidMin), bid_max: roundPay(bidMax), intro_message: introMessage, updated_at: new Date().toISOString() };
      const { data: application, error: applicationError } = await admin.from('job_applications').upsert(applicationValues, { onConflict: 'job_id,candidate_id' }).select('id, status, match_score, submitted_at').single();
      if (applicationError) throw applicationError;
      // The intro sentence opens the conversation with the hirer (once per application).
      const thread = await ensureApplicationThread(admin, String(application.id), job, String(profile.full_name || fullName), user.id);
      if (thread.created) await saveCandidateReply(admin, thread.id, user.id, introMessage);
      return reply(request, { application, status: 'submitted' }, 201);
    }

    if (action === 'getProfile') {
      const { data: profile, error } = await admin.from('candidate_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (profile) await ensureResumeExperience(admin, profile);
      const access = candidateAccess(profile);
      if (access.applicationReady) {
        const { data: progress, error: progressError } = await admin.from('candidate_onboarding').select('*').eq('user_id', user.id).maybeSingle();
        if (progressError) throw progressError;
        access.applicationReady = onboardingStage(profile, progress || {}) === 'complete';
      }
      const enteredDisplayExperience = profile ? longerExperience(normalizeExperience(profile.experience)) : [];
      const resumeDisplayExperience = profile ? longerExperience(normalizeExperience(profile.resume_experience, false)) : [];
      return reply(request, { profile: profile ? {
        userId: profile.user_id,
        email: profile.email,
        fullName: profile.full_name,
        calendarLink: profile.calendar_link,
        experience: profile.experience || [],
        resumeExperience: normalizeExperience(profile.resume_experience, false),
        displayExperience: enteredDisplayExperience.length ? enteredDisplayExperience : resumeDisplayExperience,
        displayExperienceSource: enteredDisplayExperience.length ? 'candidate' : 'resume',
        relevantYears: Number(profile.relevant_years || 0),
        requestedRateMinUsd: profile.requested_rate_min_usd == null ? null : Number(profile.requested_rate_min_usd),
        requestedRateMaxUsd: profile.requested_rate_max_usd == null ? null : Number(profile.requested_rate_max_usd),
        availableHoursPerWeek: profile.available_hours_per_week,
        location: profile.location || '',
        idealJobTitles: cleanList(profile.ideal_job_titles, 5, 80),
        portfolioLinks: publicPortfolioLinks(profile.portfolio_links),
        startAvailability: profile.start_availability || '',
        preferredJobNote: profile.preferred_job_note || '',
        shareSlug: profile.share_slug || '',
        summary: profile.resume_summary || profile.summary,
        photoPath: profile.profile_photo_path,
        photoUrl: await signedAsset(admin, BUCKET, String(profile.profile_photo_path || '')),
        skills: profile.resume_skills || [],
        software: profile.resume_software || [],
        resumePath: profile.resume_path,
        resumeFileName: profile.resume_file_name,
        resumeUrl: await signedAsset(admin, RESUME_BUCKET, String(profile.resume_path || '')),
        verificationStatus: profile.verification_status,
        referralCompleted: Boolean(profile.referral_source),
        verificationBypass: Boolean(profile.verification_bypass),
        ...access,
      } : null });
    }

    if (action === 'candidateDashboard') {
      const { data: profile, error: profileError } = await admin.from('candidate_profiles').select('resume_path, resume_file_name, referral_source, verification_bypass, profile_photo_path, verification_status, share_slug').eq('user_id', user.id).maybeSingle();
      if (profileError) throw profileError;
      const { data: applications, error } = await admin.from('job_applications').select('*').eq('candidate_id', user.id).order('submitted_at', { ascending: false });
      if (error) throw error;
      const jobIds = (applications || []).map((application) => application.job_id);
      let jobs: Array<Record<string, unknown>> = [];
      if (jobIds.length) {
        const { data, error: jobsError } = await admin.from('hiring_jobs').select('*').in('id', jobIds);
        if (jobsError) throw jobsError;
        jobs = data || [];
      }
      const { data: threads, error: threadError } = await admin.from('candidate_message_threads').select('id, employer_id, application_id, role_name, updated_at').eq('candidate_id', user.id).order('updated_at', { ascending: false });
      if (threadError) throw threadError;
      const employerIds = [...new Set((threads || []).map((thread) => thread.employer_id).filter(Boolean))];
      let employers: Array<Record<string, unknown>> = [];
      if (employerIds.length) {
        const { data, error: employerError } = await admin.from('hirer_workspaces').select('id, company_name').in('id', employerIds);
        if (employerError) throw employerError;
        employers = data || [];
      }
      const threadIds = (threads || []).map((thread) => thread.id);
      let messages: Array<Record<string, unknown>> = [];
      if (threadIds.length) {
        const { data, error: messagesError } = await admin.from('candidate_messages').select('id, thread_id, sender, body, created_at').in('thread_id', threadIds).order('created_at');
        if (messagesError) throw messagesError;
        messages = data || [];
      }
      const jobMap = new Map(jobs.map((job) => [job.id, job]));
      const applicationMap = new Map((applications || []).map((application) => [application.id, application]));
      const employerMap = new Map(employers.map((employer) => [employer.id, employer.company_name]));
      const threadMap = new Map((threads || []).map((thread) => [thread.application_id, thread]));
      return reply(request, { profile: {
        resumeFileName: profile?.resume_file_name || '',
        resumeUrl: await signedAsset(admin, RESUME_BUCKET, String(profile?.resume_path || '')),
        resumePath: profile?.resume_path || '',
        photoPath: profile?.profile_photo_path || '',
        photoUrl: await signedAsset(admin, BUCKET, String(profile?.profile_photo_path || '')),
        shareSlug: profile?.share_slug || '',
        verificationStatus: profile?.verification_status || 'draft',
        ...candidateAccess(profile),
        referralCompleted: Boolean(profile?.referral_source),
        verificationBypass: Boolean(profile?.verification_bypass),
      }, applications: (applications || []).map((application) => {
        const thread = threadMap.get(application.id);
        return {
          id: application.id,
          status: application.status,
          match: application.match_score,
          submittedAt: application.submitted_at,
          bid: bidResponse(application, jobMap.get(application.job_id) || {}, 'candidate'),
          job: jobResponse(jobMap.get(application.job_id) || {}, 'candidate'),
          messages: thread ? messages.filter((message) => message.thread_id === thread.id).map((message) => ({ id: message.id, sender: message.sender, body: message.body, createdAt: message.created_at })) : [],
        };
      }), conversations: (threads || []).map((thread) => {
        const application = applicationMap.get(thread.application_id);
        const job = application ? jobMap.get(application.job_id) : null;
        return {
          id: thread.id,
          applicationId: thread.application_id,
          company: job?.company_name || employerMap.get(thread.employer_id) || 'Hirer',
          roleName: thread.role_name || job?.title || 'Conversation',
          updatedAt: thread.updated_at,
          messages: messages.filter((message) => message.thread_id === thread.id).map((message) => ({ id: message.id, sender: message.sender, body: message.body, createdAt: message.created_at })),
        };
      }) });
    }

    if (action === 'candidateSendThreadMessage') {
      const threadId = clean(body.threadId, 36);
      const messageBody = clean(body.message, 2000);
      if (!UUID_PATTERN.test(threadId) || !messageBody) return reply(request, { error: 'Choose a conversation and write a message before sending.' }, 400);
      const { data: thread, error } = await admin.from('candidate_message_threads').select('id').eq('id', threadId).eq('candidate_id', user.id).maybeSingle();
      if (error) throw error;
      if (!thread) return reply(request, { error: 'Conversation not found.' }, 404);
      const message = await saveCandidateReply(admin, thread.id, user.id, messageBody);
      return reply(request, { status: 'sent', threadId: thread.id, message }, 201);
    }

    if (action === 'candidateSendMessage') {
      const applicationId = clean(body.applicationId, 36);
      const messageBody = clean(body.message, 2000);
      if (!UUID_PATTERN.test(applicationId) || !messageBody) return reply(request, { error: 'Write a message before sending.' }, 400);
      const { data: application, error } = await admin.from('job_applications').select('id, job_id, candidate_id').eq('id', applicationId).eq('candidate_id', user.id).maybeSingle();
      if (error) throw error;
      if (!application) return reply(request, { error: 'Application not found.' }, 404);
      const [{ data: job, error: jobError }, { data: profile, error: profileError }] = await Promise.all([
        admin.from('hiring_jobs').select('employer_id, title').eq('id', application.job_id).single(),
        admin.from('candidate_profiles').select('full_name').eq('user_id', user.id).single(),
      ]);
      if (jobError) throw jobError;
      if (profileError) throw profileError;
      let { data: thread, error: threadError } = await admin.from('candidate_message_threads').select('id').eq('application_id', applicationId).maybeSingle();
      if (threadError) throw threadError;
      if (!thread) {
        const { data: employer, error: employerError } = await admin.from('hirer_workspaces').select('edit_token_hash').eq('id', job.employer_id).single();
        if (employerError) throw employerError;
        const { data: created, error: createError } = await admin.from('candidate_message_threads').insert({
          employer_id: job.employer_id,
          edit_token_hash: employer.edit_token_hash,
          candidate_key: `application:${applicationId}`,
          candidate_name: profile.full_name,
          role_name: job.title,
          candidate_id: user.id,
          application_id: applicationId,
        }).select('id').single();
        if (createError) throw createError;
        thread = created;
      }
      const message = await saveCandidateReply(admin, thread.id, user.id, messageBody);
      return reply(request, { status: 'sent', threadId: thread.id, message }, 201);
    }

    return reply(request, { error: 'Unknown platform action.' }, 400);
  } catch (error) {
    console.error('Hiring platform request failed:', error);
    return reply(request, { error: 'The hiring platform could not complete that request. Please try again.' }, 500);
  }
});
