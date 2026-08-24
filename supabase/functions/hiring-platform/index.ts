import { createClient } from 'npm:@supabase/supabase-js@2';

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

function normalizeExperience(value: unknown) {
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
  }).filter((entry) => entry.jobTitle && entry.companyName && entry.startDate && entry.description);
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

function jobResponse(row: Record<string, unknown>) {
  const payMin = Number(row.pay_min || 0);
  const payMax = Number(row.pay_max || 0);
  return {
    id: row.id,
    company: row.company_name,
    initial: String(row.company_name || 'H').slice(0, 1).toUpperCase(),
    title: row.title,
    arrangement: row.arrangement,
    type: row.employment_type,
    location: row.location,
    payMin,
    payMax,
    pay: `$${Number.isInteger(payMin) ? payMin : payMin.toFixed(2)}–$${Number.isInteger(payMax) ? payMax : payMax.toFixed(2)} / hour`,
    description: row.description,
    responsibilities: row.responsibilities || [],
    skills: row.skills || [],
    questions: row.questions || [],
    status: row.status,
    createdAt: row.created_at,
  };
}

async function candidateUser(request: Request, admin: ReturnType<typeof createClient>) {
  const token = tokenFrom(request);
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  return error || !user?.email_confirmed_at ? null : user;
}

async function authenticatedUser(request: Request, admin: ReturnType<typeof createClient>) {
  const token = tokenFrom(request);
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  return error ? null : user;
}

async function rejectCandidateEmployerAccess(request: Request, admin: ReturnType<typeof createClient>) {
  const user = await authenticatedUser(request, admin);
  if (!user) return null;
  return reply(request, { error: 'Assistant accounts cannot post jobs or use the hirer workspace.' }, 403);
}

async function ensureEmployer(admin: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const employerId = clean(body.employerId, 36);
  const editToken = clean(body.editToken, 160);
  const companyName = clean(body.companyName, 120) || 'Your company';
  if (!UUID_PATTERN.test(employerId) || editToken.length < 32) return { error: 'Hirer workspace access is missing or invalid.' };
  const tokenHash = await sha256(editToken);
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 40);

    if (action === 'listJobs') {
      const { data, error } = await admin.from('hiring_jobs').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return reply(request, { jobs: (data || []).map(jobResponse) });
    }

    if (action === 'createJob') {
      const candidateBlock = await rejectCandidateEmployerAccess(request, admin);
      if (candidateBlock) return candidateBlock;
      const access = await ensureEmployer(admin, body);
      if (access.error) return reply(request, { error: access.error }, 403);
      const title = clean(body.title, 180);
      const description = clean(body.description, 10000);
      const questions = normalizeQuestions(body.questions);
      const payMin = Number(body.payMin);
      const payMax = Number(body.payMax);
      if (!title || !description || !questions.length || !Number.isFinite(payMin) || !Number.isFinite(payMax) || payMin < 0 || payMax < payMin) {
        return reply(request, { error: 'Complete the title, description, at least one applicant question, and pay before publishing.' }, 400);
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

    if (action === 'employerDashboard') {
      const candidateBlock = await rejectCandidateEmployerAccess(request, admin);
      if (candidateBlock) return candidateBlock;
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
            photoUrl: await signedAsset(admin, BUCKET, String(profile.profile_photo_path || '')),
            resumeFileName: profile.resume_file_name || '',
            resumeUrl: await signedAsset(admin, RESUME_BUCKET, String(profile.resume_path || '')),
          },
          job: jobResponse(job),
        };
      }));
      return reply(request, { jobs: (jobs || []).map(jobResponse), applications: applicationResults });
    }

    if (action === 'updateApplication') {
      const candidateBlock = await rejectCandidateEmployerAccess(request, admin);
      if (candidateBlock) return candidateBlock;
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
      const { data: profile, error } = await admin.from('candidate_profiles').update(values).eq('user_id', user.id).select('user_id, verification_status').maybeSingle();
      if (error) throw error;
      if (!profile) return reply(request, { error: 'Your candidate profile could not be found.' }, 404);
      return reply(request, { status: 'saved', bypassVerification, verificationStatus: profile.verification_status });
    }

    if (action === 'saveProfile' || action === 'submitApplication') {
      const submittedExperience = normalizeExperience(body.experience);
      const existingProfileResult = await admin.from('candidate_profiles').select('experience, profile_photo_path, resume_path, resume_file_name, verification_status').eq('user_id', user.id).maybeSingle();
      if (existingProfileResult.error) throw existingProfileResult.error;
      const existingProfile = existingProfileResult.data || {};
      const existingExperience = normalizeExperience(existingProfile.experience);
      const experience = submittedExperience.length ? submittedExperience : existingExperience;
      const firstName = clean(user.user_metadata?.first_name, 80);
      const lastName = clean(user.user_metadata?.last_name, 80);
      const fullName = clean(body.fullName, 160) || `${firstName} ${lastName}`.trim() || clean(user.email, 160) || 'Candidate';
      const photoPath = clean(body.photoPath, 500) || existingProfile.profile_photo_path || '';
      const resumePath = clean(body.resumePath, 500) || existingProfile.resume_path || '';
      const resumeFileName = clean(body.resumeFileName, 255) || existingProfile.resume_file_name || '';
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
      const { data: job, error: jobError } = await admin.from('hiring_jobs').select('*').eq('id', jobId).eq('status', 'active').maybeSingle();
      if (jobError) throw jobError;
      if (!job) return reply(request, { error: 'This job is no longer accepting applications.' }, 404);
      if (!resumePath) return reply(request, { error: 'Upload a resume before applying.' }, 400);
      const questions = normalizeQuestions(job.questions);
      const answers = normalizeAnswers(body.answers, questions);
      if (!answers) return reply(request, { error: 'Answer every applicant question before submitting.' }, 400);
      const matchScore = Math.min(100, Math.round(60 + Math.min(40, profile.relevant_years * 4)));
      const applicationValues = { job_id: jobId, candidate_id: user.id, answers, match_score: matchScore, updated_at: new Date().toISOString() };
      const { data: application, error: applicationError } = await admin.from('job_applications').upsert(applicationValues, { onConflict: 'job_id,candidate_id' }).select('id, status, match_score, submitted_at').single();
      if (applicationError) throw applicationError;
      return reply(request, { application, status: 'submitted' }, 201);
    }

    if (action === 'getProfile') {
      const { data: profile, error } = await admin.from('candidate_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return reply(request, { profile: profile ? {
        userId: profile.user_id,
        email: profile.email,
        fullName: profile.full_name,
        calendarLink: profile.calendar_link,
        experience: profile.experience || [],
        relevantYears: Number(profile.relevant_years || 0),
        summary: profile.summary,
        photoPath: profile.profile_photo_path,
        resumePath: profile.resume_path,
        resumeFileName: profile.resume_file_name,
        resumeUrl: await signedAsset(admin, RESUME_BUCKET, String(profile.resume_path || '')),
        verificationStatus: profile.verification_status,
        referralCompleted: Boolean(profile.referral_source),
        verificationBypass: Boolean(profile.verification_bypass),
      } : null });
    }

    if (action === 'candidateDashboard') {
      const { data: profile, error: profileError } = await admin.from('candidate_profiles').select('resume_path, resume_file_name, referral_source, verification_bypass').eq('user_id', user.id).maybeSingle();
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
      const { data: threads, error: threadError } = await admin.from('candidate_message_threads').select('id, application_id, role_name, updated_at').eq('candidate_id', user.id).order('updated_at', { ascending: false });
      if (threadError) throw threadError;
      const threadIds = (threads || []).map((thread) => thread.id);
      let messages: Array<Record<string, unknown>> = [];
      if (threadIds.length) {
        const { data, error: messagesError } = await admin.from('candidate_messages').select('id, thread_id, sender, body, created_at').in('thread_id', threadIds).order('created_at');
        if (messagesError) throw messagesError;
        messages = data || [];
      }
      const jobMap = new Map(jobs.map((job) => [job.id, job]));
      const threadMap = new Map((threads || []).map((thread) => [thread.application_id, thread]));
      return reply(request, { profile: {
        resumeFileName: profile?.resume_file_name || '',
        resumeUrl: await signedAsset(admin, RESUME_BUCKET, String(profile?.resume_path || '')),
        referralCompleted: Boolean(profile?.referral_source),
        verificationBypass: Boolean(profile?.verification_bypass),
      }, applications: (applications || []).map((application) => {
        const thread = threadMap.get(application.id);
        return {
          id: application.id,
          status: application.status,
          match: application.match_score,
          submittedAt: application.submitted_at,
          job: jobResponse(jobMap.get(application.job_id) || {}),
          messages: thread ? messages.filter((message) => message.thread_id === thread.id).map((message) => ({ id: message.id, sender: message.sender, body: message.body, createdAt: message.created_at })) : [],
        };
      }) });
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
      const { error: sendError } = await admin.from('candidate_messages').insert({ thread_id: thread.id, sender: 'candidate', body: messageBody });
      if (sendError) throw sendError;
      const { error: touchError } = await admin.from('candidate_message_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread.id);
      if (touchError) throw touchError;
      return reply(request, { status: 'sent' }, 201);
    }

    return reply(request, { error: 'Unknown platform action.' }, 400);
  } catch (error) {
    console.error('Hiring platform request failed:', error);
    return reply(request, { error: 'The hiring platform could not complete that request. Please try again.' }, 500);
  }
});
