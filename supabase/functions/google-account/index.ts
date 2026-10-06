import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { googleAccountRole } from '../_shared/google-account-policy.mjs';

const origins = new Set(['https://www.hirefromsa.com', 'https://hirefromsa.com', 'https://executive-assistant-hiring-flow.vercel.app', 'http://127.0.0.1:5173', 'http://localhost:5173']);
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
function companyDetails(input: Record<string, unknown>) {
  const first_name = clean(input.firstName, 60), last_name = clean(input.lastName, 60);
  const company_name = clean(input.companyName, 120), phone = clean(input.phone, 30);
  const company_size = clean(input.companySize, 10);
  let company_website = '';
  try {
    const value = clean(input.website, 200);
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (['http:', 'https:'].includes(url.protocol) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) && !url.username && !url.password) company_website = url.origin + (url.pathname === '/' ? '' : url.pathname);
  } catch { /* Validated below. */ }
  if (!first_name || !last_name || !company_name) throw new Error('Enter your name and company name.');
  if (!/^\+\d{1,4} [\d\s().-]{6,20}$/.test(phone) || phone.replace(/\D/g, '').length > 18) throw new Error('Enter your phone number with a country code, such as +1 555 123 4567.');
  if (!company_website) throw new Error('Enter your business website, such as yourcompany.com.');
  if (!['0', '1-5', '6-25', '26-100', '100+'].includes(company_size)) throw new Error('Choose your company size.');
  return { first_name, last_name, company_name, phone, company_website, company_size };
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://www.hirefromsa.com', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin', 'Cache-Control': 'no-store' };
  const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (origin && !origins.has(origin)) return reply({ error: 'This site cannot finish account setup.' }, 403);
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!token) return reply({ error: 'Sign in with Google to continue.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return reply({ error: 'Your sign-in expired. Sign in with Google again.' }, 401);
    const input = await request.json().catch(() => ({}));
    let role;
    try { role = googleAccountRole(user, input.role); }
    catch (error) { return reply({ error: error.message }, 403); }
    // Existing server-issued roles win over the page the user selected.
    if (user.app_metadata?.account_role) return reply({ ok: true, role });
    const { data: previousClaim, error: previousClaimError } = await admin.from('google_account_roles').select('account_role').eq('user_id', user.id).maybeSingle();
    if (previousClaimError) throw previousClaimError;
    if (previousClaim) role = previousClaim.account_role;
    let details;
    if (role === 'employer') {
      if (!input.company) return reply({ needsCompanyDetails: true });
      try { details = companyDetails(input.company); }
      catch (error) { return reply({ error: error.message }, 400); }
    }
    // A database uniqueness constraint makes concurrent callbacks choose one role.
    const { error: claimError } = await admin.from('google_account_roles').upsert({ user_id: user.id, account_role: role }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (claimError) throw claimError;
    const { data: claim, error: readError } = await admin.from('google_account_roles').select('account_role').eq('user_id', user.id).single();
    if (readError) throw readError;
    role = claim.account_role;
    if (role === 'employer' && !details) {
      if (!input.company) return reply({ needsCompanyDetails: true });
      try { details = companyDetails(input.company); }
      catch (error) { return reply({ error: error.message }, 400); }
    }
    if (role === 'candidate') {
      const fullName = clean(user.user_metadata?.full_name || user.user_metadata?.name, 160) || user.email!.split('@')[0];
      // Ignore conflicts: never replace an existing resume, photo or verification state.
      const { error: profileError } = await admin.from('candidate_profiles').upsert({ user_id: user.id, email: user.email, full_name: fullName }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (profileError) throw profileError;
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, account_role: role, signup_source: 'google' },
      ...(role === 'employer' ? { user_metadata: { ...user.user_metadata, ...details } } : {}),
    });
    if (updateError) throw updateError;
    return reply({ ok: true, role });
  } catch (error) {
    console.error('Google account setup failed', error?.code || 'unexpected');
    return reply({ error: 'Could not finish account setup. Please try again.' }, 500);
  }
});
