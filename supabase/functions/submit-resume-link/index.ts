// Turns a shared resume link (Google Docs, Google Drive or Dropbox) into a file and hands it to
// submit-resume, so linked resumes get the same contact redaction and search indexing as uploads.
const SUBMIT_RESUME_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/submit-resume';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'https://hirefromsa.com',
  'https://executive-assistant-hiring-flow.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
// Only these hosts are ever fetched, including after redirects.
const FETCH_HOSTS = [/^docs\.google\.com$/, /^drive\.google\.com$/, /^drive\.usercontent\.google\.com$/, /\.googleusercontent\.com$/, /^(www\.)?dropbox\.com$/, /\.dropboxusercontent\.com$/];
const EXTENSIONS = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['text/plain', 'txt'],
  ['application/rtf', 'rtf'],
  ['text/rtf', 'rtf'],
  ['application/vnd.oasis.opendocument.text', 'odt'],
]);
const LINK_HELP = 'Paste a Google Docs, Google Drive or Dropbox link to your resume.';
const SHARING_HELP = 'We could not open that link. Set sharing to "Anyone with the link" and try again.';

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

function reply(request: Request, body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function downloadUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host === 'docs.google.com') {
    const id = url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([\w-]+)/)?.[1];
    return id ? { url: `https://docs.google.com/document/d/${id}/export?format=docx`, name: 'Google Docs resume' } : null;
  }
  if (host === 'drive.google.com') {
    const id = url.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([\w-]+)/)?.[1] || url.searchParams.get('id');
    return id && /^[\w-]+$/.test(id) ? { url: `https://drive.google.com/uc?export=download&id=${id}`, name: 'Google Drive resume' } : null;
  }
  if (host === 'dropbox.com' || host === 'www.dropbox.com') {
    url.searchParams.delete('dl');
    url.searchParams.set('dl', '1');
    return { url: url.toString(), name: 'Dropbox resume' };
  }
  return null;
}

async function fetchAllowed(start: string) {
  let current = start;
  for (let hop = 0; hop < 6; hop += 1) {
    const host = new URL(current).hostname.toLowerCase();
    if (new URL(current).protocol !== 'https:' || !FETCH_HOSTS.some((pattern) => pattern.test(host))) throw new Error(SHARING_HELP);
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(SHARING_HELP);
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  throw new Error(SHARING_HELP);
}

function fileNameFrom(response: Response, fallback: string, extension: string) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  let name = '';
  try { name = encoded ? decodeURIComponent(encoded) : plain || ''; } catch { name = plain || ''; }
  name = name.replace(/[\u0000-\u001f\u007f\\/]/g, '').trim();
  return name && /\.[a-z]{2,4}$/i.test(name) ? name : `${fallback}.${extension}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  if (!ALLOWED_ORIGINS.has(request.headers.get('origin') || '')) return reply(request, { error: 'This endpoint only accepts requests from the hiring site.' }, 403);
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(authorization)) return reply(request, { error: 'Sign in with your verified candidate account before connecting a resume.' }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const source = downloadUrl(String(body?.url || ''));
    if (!source) return reply(request, { error: LINK_HELP }, 400);

    let response: Response;
    try { response = await fetchAllowed(source.url); } catch { return reply(request, { error: SHARING_HELP }, 400); }
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    let extension = EXTENSIONS.get(type);
    // Dropbox and Drive sometimes label files generically; fall back to the file name.
    const guessedName = fileNameFrom(response, source.name, extension || 'pdf');
    if (!extension && type === 'application/octet-stream') {
      const fromName = guessedName.toLowerCase().split('.').pop() || '';
      if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(fromName)) extension = fromName;
    }
    if (!response.ok || !extension) return reply(request, { error: type === 'text/html' ? SHARING_HELP : 'That link is not a PDF, Word, TXT, RTF or ODT resume.' }, 400);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_RESUME_BYTES) return reply(request, { error: 'That resume is empty or larger than 10 MB.' }, 400);

    const mime = [...EXTENSIONS].find(([, value]) => value === extension)?.[0] || 'application/octet-stream';
    const form = new FormData();
    form.append('resume', new File([bytes], guessedName, { type: mime }), guessedName);
    const saved = await fetch(SUBMIT_RESUME_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: authorization, Origin: PRIMARY_ORIGIN },
      body: form,
      signal: AbortSignal.timeout(90000),
    });
    const payload = await saved.json().catch(() => ({}));
    return reply(request, payload, saved.status);
  } catch (error) {
    console.error('Resume link failed:', error);
    return reply(request, { error: 'Your resume link could not be saved. Please try again.' }, 500);
  }
});
