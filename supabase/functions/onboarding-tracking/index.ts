import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { masterAccount } from '../_shared/master-access.mjs';
import { ONBOARDING_STEPS, trackingSummary } from '../_shared/onboarding-tracking.mjs';
import { onboardingStage } from '../_shared/onboarding-state.mjs';
const origins = new Set(['https://www.hirefromsa.com','https://hirefromsa.com','http://localhost:5173','http://127.0.0.1:5173']);
Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':origins.has(origin) ? origin : 'https://www.hirefromsa.com', 'Access-Control-Allow-Headers':'authorization,content-type', 'Access-Control-Allow-Methods':'POST,OPTIONS', 'Cache-Control':'no-store', Vary:'Origin' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply({ error:'Method not allowed.' },405);
  if (origin && !origins.has(origin)) return reply({ error:'Origin not allowed.' },403);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth:{persistSession:false} });
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
    const body = await request.json();
    if (body.action === 'list') {
      const master = await masterAccount(admin, token);
      if (!master?.can_review) return reply({ error:'Sign in with a master reviewer account.' },403);
      const page = Math.max(1, Math.min(10000, Number(body.page) || 1));
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage:100 });
      if (error) throw error;
      const users = data.users.filter(user => !user.app_metadata?.account_role || user.app_metadata.account_role === 'candidate');
      if (!users.length) return reply({ rows:[], nextPage:data.users.length === 100 ? page + 1 : null });
      const ids = users.map(user => user.id);
      const [profiles, progress, tracked] = await Promise.all([
        admin.from('candidate_profiles').select('*').in('user_id',ids),
        admin.from('candidate_onboarding').select('*').in('user_id',ids),
        admin.from('candidate_onboarding_steps').select('*').in('user_id',ids),
      ]);
      for (const result of [profiles,progress,tracked]) if (result.error) throw result.error;
      return reply({ rows:users.filter(user => user.app_metadata?.account_role === 'candidate' || profiles.data?.some(row => row.user_id === user.id)).map(user => {
        const profile = profiles.data?.find(row => row.user_id === user.id) || {};
        const state = progress.data?.find(row => row.user_id === user.id) || {};
        return { ...trackingSummary(user,profile,state,tracked.data?.filter(row => row.user_id === user.id)), currentStage:!user.email_confirmed_at ? 'email' : onboardingStage(profile,state) };
      }), nextPage:data.users.length === 100 ? page + 1 : null });
    }
    const { data:{user}, error } = await admin.auth.getUser(token);
    if (error || !user?.email_confirmed_at || user.app_metadata?.account_role !== 'candidate') return reply({ error:'Sign in as a candidate.' },401);
    if (!ONBOARDING_STEPS.some(([step]) => step === body.step) || !['visit','error','welcomeComplete','videoComplete'].includes(body.action)) return reply({ error:'Invalid tracking event.' },400);
    if (body.action === 'welcomeComplete' && body.step !== 'welcome') return reply({ error:'Invalid welcome completion.' },400);
    if (body.action === 'videoComplete' && !['welcome','intro','next_steps'].includes(body.step)) return reply({ error:'This completion is saved by the onboarding service.' },400);
    const { error:trackError } = await admin.rpc('record_onboarding_step', { candidate_id:user.id, step_id:body.step, event_type:body.action });
    if (trackError) throw trackError;
    return reply({ ok:true });
  } catch { return reply({ error:'Onboarding tracking is temporarily unavailable.' },500); }
});
