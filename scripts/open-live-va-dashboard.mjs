// Private, one-off production QA login. Never included in a frontend deployment.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
const base = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/';
const tokenFile = '/tmp/hirefromsa-qa-provision-session.txt';
if (process.argv.includes('--prepare')) {
  const token = 'hfm_' + randomBytes(32).toString('hex');
  writeFileSync(tokenFile, token, { mode:0o600, flag:'wx' });
  const hash = createHash('sha256').update(token).digest('hex');
  console.log(`insert into public.master_sessions(token_hash,account_id,expires_at) select '${hash}',id,now()+interval '5 minutes' from public.master_accounts where username='master' and can_review and not disabled;`);
  process.exit(0);
}
const post = async (name, body, token) => {
  const r = await fetch(base + name, { method:'POST', headers:{ Origin:'https://www.hirefromsa.com', 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) }, body:JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(`${name}: ${r.status}: ${data.error || 'failed'}`);
  return data;
};
const session = {token:readFileSync(tokenFile,'utf8')};
try {
  const qaPassword = randomBytes(24).toString('base64url');
  const result = await post('qa-dashboard-once', {password:qaPassword}, session.token);
  writeFileSync('/Users/dylanontra/Documents/Hire From SA VA test login.txt', `Live VA dashboard test account\nEmail: ${result.email}\nPassword: ${qaPassword}\nURL: https://www.hirefromsa.com/candidate-login.html\nThis is a QA account with administrative onboarding bypass, not a verified real candidate.\n`, { mode:0o600, flag:'wx' });
  console.log(JSON.stringify({userId:result.userId,email:result.email,created:true}));
} finally { await post('master-auth',{action:'logout'},session.token); }
