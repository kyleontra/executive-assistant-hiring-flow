import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRedactedResume } from '../_shared/resume-redaction.js';

const RESUME_BUCKET = 'candidate-resumes';
const REDACTED_RESUME_BUCKET = 'candidate-redacted-resumes';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const TYPE_EXTENSIONS = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['text/plain', 'txt'],
  ['application/rtf', 'rtf'],
  ['text/rtf', 'rtf'],
  ['application/vnd.oasis.opendocument.text', 'odt'],
]);
const EXTENSION_TYPES = new Map([
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['txt', 'text/plain'],
  ['rtf', 'application/rtf'],
  ['odt', 'application/vnd.oasis.opendocument.text'],
]);
const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'https://hirefromsa.com',
  'https://executive-assistant-hiring-flow.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'null',
]);

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

function reply(request: Request, body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function resumeType(file: File) {
  const supplied = file.type.split(';')[0].toLowerCase();
  if (TYPE_EXTENSIONS.has(supplied)) return supplied;
  if (supplied && supplied !== 'application/octet-stream') return '';
  const extension = file.name.toLowerCase().split('.').pop() || '';
  return EXTENSION_TYPES.get(extension) || '';
}

function safeFileName(value: string, extension: string) {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '-').trim().slice(0, 255);
  return cleaned || `resume.${extension}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  let createdUserId = '';
  let uploadedPath = '';
  let uploadedRedactedPath = '';
  try {
    const isMultipart = (request.headers.get('content-type') || '').includes('multipart/form-data');
    let input: Record<string, unknown> = {};
    let resume: File | null = null;
    if (isMultipart) {
      const formData = await request.formData();
      input = Object.fromEntries(formData.entries());
      const suppliedResume = formData.get('resume');
      resume = suppliedResume instanceof File ? suppliedResume : null;
    } else {
      // Keep accepting the previous JSON client while the new site deployment rolls out.
      input = await request.json();
    }

    const firstName = clean(input.firstName, 80);
    const lastName = clean(input.lastName, 80);
    const email = clean(input.email, 254).toLowerCase();
    const calendarLink = clean(input.calendarLink, 500);
    const password = typeof input.password === 'string' ? input.password : '';
    if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email)) {
      return reply(request, { error: 'Enter a valid first name, last name, and email address.' }, 400);
    }
    if (password.length < 10 || password.length > 128) {
      return reply(request, { error: 'Choose a password between 10 and 128 characters.' }, 400);
    }
    if (calendarLink) {
      try {
        const url = new URL(calendarLink);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid protocol');
      } catch {
        return reply(request, { error: 'Enter a valid calendar scheduling link beginning with https://.' }, 400);
      }
    }

    let type = '';
    let extension = '';
    let redactedResume: Blob | null = null;
    if (isMultipart) {
      if (!resume || resume.size === 0 || resume.size > MAX_RESUME_BYTES) {
        return reply(request, { error: 'Choose a PDF, DOC, DOCX, TXT, RTF, or ODT resume no larger than 10 MB.' }, 400);
      }
      type = resumeType(resume);
      extension = TYPE_EXTENSIONS.get(type) || '';
      if (!type || !extension) return reply(request, { error: 'Choose a PDF, DOC, DOCX, TXT, RTF, or ODT resume no larger than 10 MB.' }, 400);
      try {
        redactedResume = await createRedactedResume(resume, extension);
      } catch (error) {
        return reply(request, { error: error instanceof Error ? error.message : 'This resume could not be redacted safely.' }, 400);
      }
    }

    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await auth.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName, calendar_link: calendarLink },
      },
    });
    if (error) {
      if (error.message.toLowerCase().includes('already')) return reply(request, { error: 'An account with this email already exists. Sign in or use a different email address.' }, 409);
      throw error;
    }
    if (!data.user || data.user.identities?.length === 0) {
      return reply(request, { error: 'An account with this email already exists. Use a different email address for a new test.' }, 409);
    }
    createdUserId = data.user.id;

    const { error: roleError } = await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...(data.user.app_metadata || {}), account_role: 'candidate' },
    });
    if (roleError) throw roleError;

    if (resume) {
      uploadedPath = `${data.user.id}/resume.${extension}`;
      uploadedRedactedPath = `${data.user.id}/resume-redacted.txt`;
      const { error: redactedUploadError } = await admin.storage.from(REDACTED_RESUME_BUCKET).upload(uploadedRedactedPath, redactedResume!, {
        cacheControl: '0',
        contentType: 'text/plain;charset=utf-8',
        upsert: false,
      });
      if (redactedUploadError) throw redactedUploadError;
      const { error: uploadError } = await admin.storage.from(RESUME_BUCKET).upload(uploadedPath, resume, {
        cacheControl: '0',
        contentType: type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: profileError } = await admin.from('candidate_profiles').upsert({
        user_id: data.user.id,
        email,
        full_name: `${firstName} ${lastName}`.trim(),
        calendar_link: calendarLink,
        experience: [],
        relevant_years: 0,
        summary: 'Resume submitted with candidate account.',
        profile_photo_path: '',
        resume_path: uploadedPath,
        resume_file_name: safeFileName(resume.name, extension),
        verification_status: 'draft',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (profileError) throw profileError;
    }

    return reply(request, { status: 'created' }, 201);
  } catch (error) {
    console.error('Candidate registration failed:', error);
    if (createdUserId) {
      const cleanup = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (uploadedPath) await cleanup.storage.from(RESUME_BUCKET).remove([uploadedPath]);
      if (uploadedRedactedPath) await cleanup.storage.from(REDACTED_RESUME_BUCKET).remove([uploadedRedactedPath]);
      await cleanup.auth.admin.deleteUser(createdUserId);
    }
    return reply(request, { error: 'Your account or resume could not be saved. Please try again.' }, 500);
  }
});
