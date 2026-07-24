const SUPABASE_URL = 'https://jyxamdvvnoylaxolhlht.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gz9khyKvk-yvFAVZqJPk4g_BC4n7FlY';

if (!window.supabase) throw new Error('The authentication library did not load. Refresh the page and try again.');

window.savaAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

window.getVerifiedCandidate = async () => {
  const { data: { user }, error } = await window.savaAuth.auth.getUser();
  if (error || !user?.email_confirmed_at) return null;
  return user;
};

window.getAccessToken = async () => {
  const { data: { session } } = await window.savaAuth.auth.getSession();
  return session?.access_token || null;
};
