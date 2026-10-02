// Local, short-lived key entry. The privileged setup session stays on the server.
import http from 'node:http';
import { readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const sessionFile = process.env.SAVA_SETUP_SESSION_FILE;
if (!sessionFile) throw new Error('Provide the protected temporary setup session file.');
let { token } = JSON.parse(readFileSync(sessionFile, 'utf8'));
const path = '/setup/' + randomUUID(), csrf = randomUUID(), nonce = randomUUID();
const project = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/';
const lifetimeMinutes = 60;
let origin, status = 'waiting', saving = false;
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Secure OpenAI setup | Hire From SA</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f2f6fb;color:#172e46;font:16px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,520px);padding:36px;border:1px solid #dce5ef;border-radius:20px;background:white;box-shadow:0 18px 70px #19355212}.brand{font-size:13px;color:#216c95;font-weight:700}h1{font-size:28px;line-height:1.25;margin:14px 0}p{color:#63758b;font-size:14px}label{display:block;font-weight:650;margin:24px 0 8px}input{width:100%;padding:14px;border:1px solid #c5d3e3;border-radius:9px;font:16px system-ui}button{width:100%;padding:14px;border:0;border-radius:9px;background:#1264d5;color:white;font:650 15px system-ui;margin-top:18px;cursor:pointer}button:disabled{opacity:.6;cursor:default}#status{min-height:24px;font-size:14px;overflow-wrap:anywhere}.success{color:#09634c!important}.footer{font-size:12px;margin-top:24px}</style></head><body><main class="card"><div class="brand">HIRE FROM SA · PRIVATE KEY SETUP</div><h1>Connect your OpenAI key</h1><p>Your key will be verified and saved encrypted in Supabase Vault for the candidate spreadsheet. This window runs locally on your computer and remains available for 60 minutes.</p><form autocomplete="off"><label for="key">OpenAI API key</label><input id="key" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" maxlength="303" placeholder="sk-…" required><button id="save" type="submit">Save securely to Supabase</button><p id="status" role="status" aria-live="polite"></p></form><p class="footer">The key is never placed in chat, a URL, browser storage, or source code.</p></main><script nonce="${nonce}">const form=document.querySelector('form'),input=document.querySelector('#key'),button=document.querySelector('#save'),message=document.querySelector('#status');form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;input.disabled=true;message.textContent='Verifying and saving to Supabase Vault…';try{const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:'${csrf}',apiKey:input.value.trim()})});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save.');input.value='';form.reset();input.hidden=true;form.querySelector('label').hidden=true;button.hidden=true;message.textContent='Saved securely in Supabase Vault. Your candidate spreadsheet AI is connected.';message.className='success';}catch(error){message.textContent=error instanceof TypeError?'This setup window has lost its local connection. Ask Codex to reopen it; your key has not been sent.':error.message;button.disabled=false;input.disabled=false;}});setTimeout(()=>{if(!input.hidden){button.disabled=true;input.disabled=true;message.textContent='This setup window has expired. Ask Codex to reopen it.';}},${lifetimeMinutes}*60000);</script></body></html>`;
function reply(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
async function backend(action, payload = {}) {
  const response = await fetch(project+'admin-review', { method:'POST', headers:{Authorization:'Bearer '+token, Origin:'https://www.hirefromsa.com', 'Content-Type':'application/json'}, body:JSON.stringify({action,...payload}), signal:AbortSignal.timeout(25000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Secure setup failed.');
  return data;
}
const server = http.createServer(async (req,res) => {
  if (req.headers.host !== new URL(origin).host) return reply(res,403,{error:'Local setup only.'});
  if (req.url === path+'/status' && req.method === 'GET') return reply(res,200,{status});
  if (req.url !== path) return reply(res,404,{error:'Not found.'});
  if (req.method === 'GET') return reply(res,200,page,'text/html;charset=utf-8');
  if (req.method !== 'POST' || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return reply(res,403,{error:'Local setup only.'});
  if (status === 'saved') return reply(res,409,{error:'This setup window has already saved the key.'});
  if (saving) return reply(res,409,{error:'A save is already in progress.'});
  try {
    let chunks=[],size=0;
    for await (const chunk of req) { size+=chunk.length; if(size>2048) return reply(res,413,{error:'The key is too long.'}); chunks.push(chunk); }
    const body=JSON.parse(Buffer.concat(chunks).toString()); chunks=[];
    if(body.csrf!==csrf) return reply(res,403,{error:'Reload the setup window and try again.'});
    saving=true;
    await backend('saveCandidateAiKey',{apiKey:body.apiKey}); body.apiKey='';
    const configured=await backend('candidateSpreadsheetConfig');
    if(!configured.configured) throw new Error('The key was not confirmed in the private store. Try again.');
    status='saved'; reply(res,200,{status:'saved'});
  } catch(error) { reply(res,400,{error:error.message || 'Could not save the key.'}); }
  finally { saving=false; }
});
server.listen(0,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;console.log(JSON.stringify({url:origin+path,expiresInMinutes:lifetimeMinutes}));});
async function cleanup() {
  if(token) {
    try { await fetch(project+'master-auth',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://www.hirefromsa.com','Content-Type':'application/json'},body:JSON.stringify({action:'logout'}),signal:AbortSignal.timeout(5000)}); } catch {}
    token='';
  }
  try { unlinkSync(sessionFile); } catch {}
  server.close(); process.exit(0);
}
process.once('SIGINT',cleanup); process.once('SIGTERM',cleanup);
setTimeout(cleanup,lifetimeMinutes*60000).unref();
