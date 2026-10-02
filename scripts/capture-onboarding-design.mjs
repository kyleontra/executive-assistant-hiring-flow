import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const binary = process.env.AGENT_BROWSER_BINARY || '/Users/dylanontra/.npm/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser-darwin-x64';
const output = resolve('design-review/onboarding-2026-09-18');
mkdirSync(output, { recursive: true });
const pages = [
  ['Create account','candidate-signup'], ['Check inbox','check-email'],
  ['Verify email','email-confirmed'], ['Upload resume','candidate-resume'],
  ['Referral source','referral'], ['Next steps','candidate-next-steps'],
  ['Upload headshot','candidate-profile'], ['Identity guide','candidate-onboarding','identity'],
  ['ID photos','id-verification'], ['Private ID recording','verification'],
  ['Platform guide','candidate-onboarding','platform'], ['Contract','candidate-onboarding','contract'],
  ['Pending verification','candidate-onboarding','waiting'], ['Approval guide','candidate-onboarding','intro'],
  ['Public introduction','candidate-onboarding','recording'], ['Sign in','candidate-login'],
  ['Password reset','reset-password'], ['New password','reset-password',null,'reset-code'],
];
const browser = (...args) => execFileSync(binary, ['--session','onboarding-design',...args], { encoding:'utf8', timeout:45000 });
const report = [];
for (const [size, width, height] of [['desktop',1440,1000],['mobile',390,844]]) {
  browser('set','viewport',String(width),String(height));
  for (const [index,[title,page,stage,state]] of pages.entries()) {
    const query = new URLSearchParams({page,...(stage ? {stage} : {}),...(state ? {state} : {})});
    browser('open',`http://127.0.0.1:5173/scripts/onboarding-design-review.html?${query}`);
    browser('wait','html[data-review-ready="true"]');
    browser('eval','document.fonts.ready.then(() => true)');
    const metrics = browser('eval',`JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,content:document.body.innerText.length,brokenImages:[...document.images].filter(i=>i.getClientRects().length&&(!i.complete||!i.naturalWidth)).map(i=>i.src),overlay:!!document.querySelector('vite-error-overlay')})`);
    const check = JSON.parse(JSON.parse(metrics));
    if (check.scrollWidth > width || check.content < 10 || check.brokenImages.length || check.overlay) throw new Error(`Visual layout check failed: ${title} ${metrics}`);
    const filename = `${String(index+1).padStart(2,'0')}-${page}${stage ? '-'+stage : ''}${state ? '-'+state : ''}-${size}.png`;
    browser('screenshot','--full',resolve(output,filename));
    report.push({title,size,filename,metrics});
    console.log(`${size}: ${title} ${metrics.trim()}`);
  }
}
writeFileSync(resolve(output,'checks.json'), JSON.stringify(report,null,2));
writeFileSync(resolve(output,'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Onboarding design review</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f7fc;color:#14233a;font:16px/1.6 system-ui}header,main{max-width:1480px;margin:auto;padding:32px}h1{font-size:36px;margin:0}header p{max-width:850px;color:#52647c}section{margin:0 0 40px}h2{font-size:22px}.pair{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:24px;align-items:start}img{width:100%;display:block;border:1px solid #dce4ef;border-radius:12px;background:white}a{color:inherit;text-decoration:none}small{display:block;margin-bottom:8px;color:#52647c}@media(max-width:700px){.pair{grid-template-columns:1fr}header,main{padding:20px}}</style><header><h1>Candidate onboarding</h1><p>Private design review · 18 screens · desktop and mobile. These are screenshots of the real page templates and styles, rendered locally with read-only staged onboarding states. No candidate data, account submissions, or sandbox pages are published.</p></header><main>${pages.map(([title],index)=>`<section><h2>${String(index+1).padStart(2,'0')} / ${title}</h2><div class="pair">${['desktop','mobile'].map(size=>{const item=report.find(r=>r.title===title&&r.size===size);return `<a href="${item.filename}" target="_blank"><small>${size==='desktop'?'Desktop · 1440 px':'Mobile · 390 px'}</small><img loading="lazy" src="${item.filename}" alt="${title} — ${size}"></a>`;}).join('')}</div></section>`).join('')}</main></html>`);
console.log(`Gallery: ${output}/index.html`);
writeFileSync(resolve(output,'overview.html'), `<!doctype html><html><meta charset="utf-8"><title>Onboarding overview</title><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#eaf0f8;color:#14233a;font:16px/1.5 system-ui}h1{margin:0}p{color:#52647c;margin:4px 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}figure{margin:0;background:white;border:1px solid #dce4ef;border-radius:12px;overflow:hidden}figcaption{padding:12px;font-weight:650}img{width:100%;display:block}</style><h1>Candidate onboarding — every screen</h1><p>Private review · desktop screenshots · September 18, 2026</p><div class="grid">${report.filter(r=>r.size==='desktop').map((r,i)=>`<figure><img src="${r.filename}"><figcaption>${String(i+1).padStart(2,'0')} / ${r.title}</figcaption></figure>`).join('')}</div></html>`);
