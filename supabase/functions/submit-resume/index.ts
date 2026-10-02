import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRedactedResume } from '../_shared/resume-redaction.js';
import { indexResume, resumeIndexColumns } from '../_shared/resume-index.mjs';

const BUCKET = 'candidate-resumes';
const LEGACY_REDACTED_BUCKET = 'candidate-redacted-resumes';
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

function resumeType(file: File) {
  const supplied = file.type.split(';')[0].toLowerCase();
  if (TYPE_EXTENSIONS.has(supplied)) return supplied;
  if (supplied && supplied !== 'application/octet-stream') return '';
  const extension = file.name.toLowerCase().split('.').pop() || '';
  return EXTENSION_TYPES.get(extension) || '';
}

function safeTextFileName(value: string) {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '-').trim();
  const base = cleaned.replace(/\.[^.]+$/, '').trim().slice(0, 240) || 'resume';
  return `${base}.txt`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  try {
    const formData = await request.formData();
    const resume = formData.get('resume');
    if (!(resume instanceof File) || resume.size === 0 || resume.size > MAX_RESUME_BYTES) {
      return reply(request, { error: 'Choose a PDF, DOC, DOCX, TXT, RTF, or ODT resume no larger than 10 MB.' }, 400);
    }
    const type = resumeType(resume);
    const extension = TYPE_EXTENSIONS.get(type);
    if (!type || !extension) return reply(request, { error: 'Choose a PDF, DOC, DOCX, TXT, RTF, or ODT resume no larger than 10 MB.' }, 400);
    let redactedResume: Blob;
    try {
      redactedResume = await createRedactedResume(resume, extension);
    } catch (error) {
      return reply(request, { error: error instanceof Error ? error.message : 'This resume could not be redacted safely.' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await admin.auth.getUser(tokenFrom(request));
    if (userError || !user?.email_confirmed_at || user.app_metadata?.account_role !== 'candidate') return reply(request, { error: 'Sign in with your verified candidate account before connecting a resume.' }, 401);

    const path = `${user.id}/resume.txt`;
    const fileName = safeTextFileName(resume.name);
    const resumeIndex = indexResume(await redactedResume.text());
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, redactedResume, {
      cacheControl: '0',
      contentType: 'text/plain;charset=utf-8',
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const oldPaths = ['pdf', 'doc', 'docx', 'rtf', 'odt'].map((item) => `${user.id}/resume.${item}`);
    await admin.storage.from(BUCKET).remove(oldPaths);
    await admin.storage.from(LEGACY_REDACTED_BUCKET).remove([`${user.id}/resume-redacted.txt`]);

    const profileValues = {
      resume_path: path,
      resume_file_name: fileName,
      ...resumeIndexColumns(resumeIndex),
      updated_at: new Date().toISOString(),
    };
    const { data: savedProfile, error: profileError } = await admin.from('candidate_profiles')
      .update(profileValues)
      .eq('user_id', user.id)
      .select('user_id')
      .maybeSingle();
    if (profileError) throw profileError;
    if (!savedProfile) {
      const firstName = String(user.user_metadata?.first_name || '').trim();
      const lastName = String(user.user_metadata?.last_name || '').trim();
      const { error: insertError } = await admin.from('candidate_profiles').insert({
        user_id: user.id,
        email: String(user.email || '').toLowerCase(),
        full_name: `${firstName} ${lastName}`.trim() || String(user.email || 'Candidate'),
        ...profileValues,
      });
      if (insertError) throw insertError;
    }

    return reply(request, {
      path,
      fileName,
      index: {
        jobTitles: resumeIndex.jobTitles,
        software: resumeIndex.software,
        skills: resumeIndex.skills,
        industries: resumeIndex.industries,
      },
      status: 'resume_saved',
    }, 201);
  } catch (error) {
    console.error('Resume upload failed:', error);
    return reply(request, { error: 'Your resume could not be saved. Please try again.' }, 500);
  }
});
