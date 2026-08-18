import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'candidate-resumes';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const TYPE_EXTENSIONS = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
]);
const EXTENSION_TYPES = new Map([
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
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

function safeFileName(value: string, extension: string) {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '-').trim().slice(0, 255);
  return cleaned || `resume.${extension}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  try {
    const formData = await request.formData();
    const resume = formData.get('resume');
    if (!(resume instanceof File) || resume.size === 0 || resume.size > MAX_RESUME_BYTES) {
      return reply(request, { error: 'Choose a PDF, DOC, or DOCX resume no larger than 10 MB.' }, 400);
    }
    const type = resumeType(resume);
    const extension = TYPE_EXTENSIONS.get(type);
    if (!type || !extension) return reply(request, { error: 'Choose a PDF, DOC, or DOCX resume no larger than 10 MB.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await admin.auth.getUser(tokenFrom(request));
    if (userError || !user?.email_confirmed_at) return reply(request, { error: 'Confirm your email before connecting a resume.' }, 401);

    const path = `${user.id}/resume.${extension}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, resume, {
      cacheControl: '0',
      contentType: type,
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const oldPaths = ['pdf', 'doc', 'docx'].filter((item) => item !== extension).map((item) => `${user.id}/resume.${item}`);
    await admin.storage.from(BUCKET).remove(oldPaths);

    return reply(request, {
      path,
      fileName: safeFileName(resume.name, extension),
      status: 'resume_saved',
    }, 201);
  } catch (error) {
    console.error('Resume upload failed:', error);
    return reply(request, { error: 'Your resume could not be saved. Please try again.' }, 500);
  }
});
