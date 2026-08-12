import { createClient } from 'npm:@supabase/supabase-js@2';

const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'https://hirefromsa.com',
  'https://executive-assistant-hiring-flow.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Browsers serialize requests from a directly opened local HTML file as Origin: null.
  'null',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validOrigin(request: Request) {
  return ALLOWED_ORIGINS.has(request.headers.get('origin') || '');
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function messagesResponse(messages: Array<Record<string, unknown>>) {
  return messages.map((message) => ({
    id: message.id,
    sender: message.sender,
    body: message.body,
    createdAt: message.created_at,
  }));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!validOrigin(request)) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 20);
    const employerId = clean(body.employerId, 36);
    const editToken = clean(body.editToken, 100);
    const candidateKey = clean(body.candidateKey, 180);
    const candidateName = clean(body.candidateName, 120);
    const roleName = clean(body.roleName, 180);
    const applicationId = candidateKey.startsWith('application:') ? candidateKey.slice('application:'.length) : '';

    if (!UUID_PATTERN.test(employerId) || editToken.length < 32 || !candidateKey || !candidateName) {
      return reply(request, { error: 'Message access is missing or invalid.' }, 400);
    }

    const tokenHash = await sha256(editToken);
    let { data: thread, error: threadError } = await admin
      .from('candidate_message_threads')
      .select('id, edit_token_hash')
      .eq('employer_id', employerId)
      .eq('candidate_key', candidateKey)
      .maybeSingle();
    if (threadError) throw threadError;

    let linkedCandidateId = '';
    if (applicationId) {
      if (!UUID_PATTERN.test(applicationId)) return reply(request, { error: 'Invalid application conversation.' }, 400);
      const { data: application, error: applicationError } = await admin.from('job_applications').select('candidate_id, job_id').eq('id', applicationId).maybeSingle();
      if (applicationError) throw applicationError;
      if (!application) return reply(request, { error: 'That application is no longer available.' }, 404);
      const { data: job, error: jobError } = await admin.from('hiring_jobs').select('employer_id').eq('id', application.job_id).single();
      if (jobError) throw jobError;
      if (job.employer_id !== employerId) return reply(request, { error: 'That application belongs to a different hirer workspace.' }, 403);
      linkedCandidateId = application.candidate_id;
    }

    if (!thread) {
      const { data: created, error: createError } = await admin.from('candidate_message_threads').insert({
        employer_id: employerId,
        edit_token_hash: tokenHash,
        candidate_key: candidateKey,
        candidate_name: candidateName,
        role_name: roleName,
        candidate_id: linkedCandidateId || null,
        application_id: applicationId || null,
      }).select('id, edit_token_hash').single();
      if (createError) throw createError;
      thread = created;
    }

    if (thread.edit_token_hash !== tokenHash) return reply(request, { error: 'This browser cannot access that conversation.' }, 403);

    if (action === 'send') {
      const messageBody = clean(body.body, 2000);
      if (!messageBody) return reply(request, { error: 'Write a message before sending.' }, 400);
      const { error: insertError } = await admin.from('candidate_messages').insert({
        thread_id: thread.id,
        sender: 'employer',
        body: messageBody,
      });
      if (insertError) throw insertError;
      const { error: updateError } = await admin.from('candidate_message_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread.id);
      if (updateError) throw updateError;
    } else if (action !== 'list') {
      return reply(request, { error: 'Unknown messaging action.' }, 400);
    }

    const { data: messages, error: messagesError } = await admin
      .from('candidate_messages')
      .select('id, sender, body, created_at')
      .eq('thread_id', thread.id)
      .order('created_at')
      .limit(200);
    if (messagesError) throw messagesError;
    return reply(request, { messages: messagesResponse(messages || []) });
  } catch (error) {
    console.error('Candidate messaging failed:', error);
    return reply(request, { error: 'Messages could not complete that request. Try again.' }, 500);
  }
});
