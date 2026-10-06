import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { masterAccount, masterHash, masterUser } from '../_shared/master-access.mjs';

const origins = new Set(['https://www.hirefromsa.com', 'https://hirefromsa.com', 'http://localhost:5173', 'http://127.0.0.1:5173']);
const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000,
    salt: new TextEncoder().encode(salt) }, key, 256);
  return Array.from(new Uint8Array(bits), n => n.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://www.hirefromsa.com',
    'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!origins.has(origin)) return reply({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: 'Request too large.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid request.' }, 400); }
    if (!body || typeof body !== 'object') return reply({ error: 'Invalid request.' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (body.action === 'login') {
      const { data: allowed, error: limitError } = await admin.rpc('reserve_master_login');
      if (limitError) throw limitError;
      if (!allowed) return reply({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, 429);
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const { data: account, error } = await admin.from('master_accounts').select('*').eq('username', username).maybeSingle();
      if (error) throw error;
      const hash = await passwordHash(password, account?.password_salt || 'unknown-account-dummy-salt');
      if (!account || account.disabled || !equal(hash, account.password_hash)) return reply({ error: 'Incorrect username or password.' }, 401);
      const accessToken = `hfm_${randomHex()}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: sessionError } = await admin.from('master_sessions').insert({ token_hash: await masterHash(accessToken), account_id: account.id, expires_at: expiresAt });
      if (sessionError) throw sessionError;
      return reply({ token: accessToken, expiresAt, user: masterUser(account), employerId: account.employer_id });
    }
    const account = await masterAccount(admin, token);
    if (!account) return reply({ error: 'Your session has expired. Sign in again.' }, 401);
    if (body.action === 'logout') {
      const { error } = await admin.from('master_sessions').delete().eq('token_hash', await masterHash(token));
      if (error) throw error;
      return reply({ signedOut: true });
    }
    if (body.action === 'status') return reply({ user: masterUser(account), employerId: account.employer_id });
    return reply({ error: 'Unknown action.' }, 400);
  } catch {
    return reply({ error: 'Sign-in service is temporarily unavailable. Please try again.' }, 503);
  }
});
