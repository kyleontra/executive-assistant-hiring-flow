import { createClient } from 'npm:@supabase/supabase-js@2';

// Self-serve hirer sign-up (employer-signup.html). Creates an unconfirmed hirer account; the page then emails a
// 6-digit code, and verifying it confirms the email and sets the password.
const PRIMARY_ORIGIN = 'https://www.hirefromsa.com';
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'https://hirefromsa.com',
  'https://executive-assistant-hiring-flow.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'null',
]);
const COMPANY_SIZES = new Set(['0', '1-5', '6-25', '26-100', '100+']);

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
function reply(request: Request, body: Record<string, string | boolean>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}
function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}
function cleanWebsite(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) || url.username || url.password) return '';
    return url.origin + (url.pathname === '/' ? '' : url.pathname);
  } catch {
    return '';
  }
}
function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  try {
    const input = await request.json().catch(() => ({}));
    const firstName = clean(input.firstName, 60);
    const lastName = clean(input.lastName, 60);
    const email = clean(input.email, 254).toLowerCase();
    const phone = clean(input.phone, 24);
    const website = cleanWebsite(clean(input.website, 200));
    const companySize = clean(input.companySize, 10);
    const companyName = clean(input.companyName, 120);
    if (!firstName || !lastName) return reply(request, { error: 'Enter your first and last name.' }, 400);
    if (!companyName) return reply(request, { error: 'Enter your company name.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(request, { error: 'Enter a valid email address.' }, 400);
    if (!/^\+\d{1,4} [\d\s().-]{6,20}$/.test(phone) || phone.replace(/\D/g, '').length > 18) return reply(request, { error: 'Enter a valid phone number with your country code.' }, 400);
    if (!website) return reply(request, { error: 'Enter your business website, like yourcompany.com.' }, 400);
    if (!COMPANY_SIZES.has(companySize)) return reply(request, { error: 'Choose your company size.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: false,
      user_metadata: { first_name: firstName, last_name: lastName, phone, company_name: companyName, company_website: website, company_size: companySize },
      app_metadata: { account_role: 'employer', signup_source: 'self_serve' },
    });
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
        return reply(request, { error: 'An account with this email already exists. Use Employer Login, or reset your password there.' }, 409);
      }
      throw error;
    }
    if (!data.user) throw new Error('Account was not created.');
    return reply(request, { ok: true }, 200);
  } catch (error) {
    console.error('register-employer failed', error);
    return reply(request, { error: 'We could not create your account. Please try again in a minute.' }, 500);
  }
});
