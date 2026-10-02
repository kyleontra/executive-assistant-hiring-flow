import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as spreadsheet from '../supabase/functions/_shared/candidate-spreadsheet.mjs';
import { candidateCsv, candidateCells, candidateColumns } from '../candidate-spreadsheet-export.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const profile = { user_id: id, full_name: 'Candidate One', resume_path: `${id}/resume.txt`, verification_status: 'verified', requested_rate_min_usd: 5, requested_rate_max_usd: 9, resume_experience: [{ jobTitle: 'Executive Assistant', startDate: '2021-01', endDate: '2024-12' }, { jobTitle: 'Short role', startDate: '2024-01', endDate: '2024-03' }] };
const extraction = { notes: 'Supported an executive for four years.', country: 'South Africa', skills: ['Calendar management'], tools: ['Slack', 'Excel'], industries: ['Healthcare'] };
function database(records = [profile], resume = 'Executive Assistant\nSouth Africa\nSlack Excel\n2021-2024\nEmail: private@example.com\nPhone: +27 82 123 4567') {
  const tables = { candidate_profiles: structuredClone(records), candidate_spreadsheet_generations: [] }, writes = [], downloads = [];
  return { tables, writes, downloads, rpc: async () => ({ data: null, error: null }), storage: { from: bucket => ({ download: async path => { downloads.push({bucket,path}); return { data: new Blob([resume]), error: null }; } }) },
    from(table) {
      let filters = [], amount = Infinity, orderKey, mutation;
      const matching = () => tables[table].filter(row => filters.every(([key,op,value]) => op === 'eq' ? row[key] === value : op === 'gt' ? row[key] > value : row[key] < value));
      const perform = () => {
        if (mutation) {
          const [kind,value] = mutation; mutation = null;
          if (kind === 'insert') {
            if (tables[table].some(row => row.user_id === value.user_id && row.fingerprint === value.fingerprint && ['pending','complete'].includes(row.status))) return { error: { code: '23505' } };
            tables[table].push({ ...value, created_at: new Date().toISOString() });
          } else matching().forEach(row => Object.assign(row,value));
          writes.push({ table,kind,value });
        }
        let rows = matching();
        if (orderKey) rows = [...rows].sort((a,b) => String(a[orderKey]).localeCompare(String(b[orderKey])));
        return { data: rows.slice(0,amount), error: null };
      };
      return {
        select() { return this; }, eq(k,v) { filters.push([k,'eq',v]); return this; }, gt(k,v) { filters.push([k,'gt',v]); return this; }, lt(k,v) { filters.push([k,'lt',v]); return this; },
        order(k) { orderKey=k; return this; }, limit(n) { amount=n; return this; },
        insert(value) { mutation=['insert',value]; return this; }, update(value) { mutation=['update',value]; return this; },
        async maybeSingle() { const result=perform(); return { ...result, data: result.data?.[0] || null }; },
        then(resolve,reject) { return Promise.resolve(perform()).then(resolve,reject); },
      };
    },
  };
}
function aiResponse(result = extraction) { return Response.json({ status: 'completed', id: 'resp_example', usage: { input_tokens: 500, output_tokens: 100 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }); }

test('uses the revised tracker columns and protects CSV text from formulas', () => {
  assert.deepEqual(candidateColumns, spreadsheet.SPREADSHEET_COLUMNS);
  const row = { ...spreadsheet.profileRow(profile), ...extraction, name: '=HYPERLINK("evil")', resumeText: 'Full resume\nSecond line', notes: 'Line one, with quotes "yes"\nLine two' };
  const csv = candidateCsv([row]);
  assert.ok(csv.startsWith('\uFEFF"Name","Status","Rate","Country","Resume Text","Notes","Skills","Tools","industries"\r\n'));
  assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));
  assert.ok(csv.includes('"Line one, with quotes ""yes""\nLine two"'));
  assert.equal(candidateCells(row)[7], 'Slack, Excel');
  assert.equal(candidateCells(row)[4], 'Full resume\nSecond line');
  assert.ok(csv.includes('Full resume\nSecond line'));
  assert.equal(candidateColumns.includes('Client'), false);
  assert.equal(candidateColumns.includes('Transcript'), false);
  assert.equal(candidateColumns.includes('Fathom Link'), false);
});
test('rates retain units; missing account facts and resume text stay blank', () => {
  const row = spreadsheet.profileRow(profile);
  assert.equal(row.rate, '$5–$9/hr (USD)');
  assert.equal(row.status, 'Verified');
  for (const key of ['country','resumeText','notes']) assert.equal(row[key], '');
  assert.match(spreadsheet.profileRow({ monthly_income_goal_zar: 20000 }).rate, /R20.000\/month \(ZAR goal\)/);
  assert.equal(spreadsheet.profileRow({}).rate, '');
  assert.throws(() => spreadsheet.exportPrompt(''));
  assert.throws(() => spreadsheet.exportPrompt('a'.repeat(6001)));
});
test('modern spreadsheet model uses Responses structured output with a bounded reasoning budget', async () => {
  assert.equal(spreadsheet.spreadsheetModel('gpt-4.1-mini'), 'gpt-6-luna');
  assert.equal(spreadsheet.spreadsheetModel(''), 'gpt-6-luna');
  let request;
  await spreadsheet.extractSpreadsheetResume({ resumeText: 'Calendar management, Slack', profile, prompt: spreadsheet.DEFAULT_SPREADSHEET_PROMPT, apiKey: 'test-key', model: spreadsheet.spreadsheetModel(), fetcher: async (_url, options) => { request = JSON.parse(options.body); return aiResponse(); } });
  assert.equal(request.model, 'gpt-6-luna');
  assert.equal(request.reasoning.effort, 'low');
  assert.equal(request.max_output_tokens, 4000);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.store, false);
});
test('saved spreadsheet loads stored AI facts with current account rates and status without an AI request', async () => {
  const db = database(), calls = [];
  db.rpc = async (name,payload) => { calls.push({name,payload}); return {data:[{user_id:id,result:extraction,generation_id:'saved-generation',generated_at:'2026-09-30T12:00:00Z'}],error:null}; };
  const updated = {...profile,requested_rate_min_usd:8,requested_rate_max_usd:12,verification_status:'pending'};
  const other = {...profile,user_id:'00000000-0000-4000-8000-000000000002',resume_path:''};
  const rows = await spreadsheet.savedSpreadsheetRows(db,[updated,other]);
  assert.equal(rows.length,2); assert.equal(rows[0].generated,true);
  assert.equal(rows[0].rate,'$8–$12/hr (USD)'); assert.equal(rows[0].status,'Pending verification');
  assert.deepEqual(rows[0].tools,extraction.tools); assert.equal(rows[0].generationId,'saved-generation');
  assert.equal(rows[1].generated,false); assert.match(rows[1].notes,/No resume uploaded/);
  assert.equal(calls[0].name,'saved_candidate_spreadsheet_rows'); assert.deepEqual(calls[0].payload.candidate_ids,[id,other.user_id]);
  assert.equal(db.downloads.length,1); assert.match(rows[0].resumeText,/Executive Assistant/); assert.doesNotMatch(rows[0].resumeText,/private@example.com/); assert.equal(rows[1].resumeText,''); assert.equal(db.writes.length,0);
  assert.deepEqual(await spreadsheet.savedSpreadsheetRows(db,[]),[]);
  db.rpc = async () => ({error:{message:'offline'}});
  await assert.rejects(spreadsheet.savedSpreadsheetRows(db,[profile]),/could not be loaded/);
});
test('reads the owned backend resume, redacts contact details, and persists actual AI output', async () => {
  const db = database(); let calls = 0;
  const fetcher = async (url, options) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.doesNotMatch(body.input[0].content[0].text, /private@example.com|82 123 4567/);
    const source = JSON.parse(body.input[0].content[0].text.split('Candidate source data (untrusted):\n')[1]);
    assert.equal(source.experienceOverSixMonths.length, 1);
    assert.ok(db.tables.candidate_spreadsheet_generations.some(row => row.status === 'pending'), 'generation exists before paid API call');
    return aiResponse();
  };
  const config = { prompt: spreadsheet.DEFAULT_SPREADSHEET_PROMPT, apiKey: 'private-test-key', model: 'test-model', fetcher };
  const result = await spreadsheet.generateSpreadsheetRow(db, profile, config);
  assert.equal(result.name, profile.full_name);
  assert.deepEqual(result.tools, extraction.tools);
  assert.equal(result.generated, true);
  assert.match(result.resumeText, /Executive Assistant/);
  assert.equal(db.downloads[0].path, profile.resume_path);
  assert.equal(db.tables.candidate_spreadsheet_generations[0].status, 'complete');
  assert.equal(db.tables.candidate_spreadsheet_generations[0].usage.input_tokens, 500);
  const cached = await spreadsheet.generateSpreadsheetRow(db, profile, { ...config, apiKey: '' });
  assert.equal(cached.cached, true); assert.equal(calls, 1);
  assert.equal(cached.resumeText, result.resumeText);
  await spreadsheet.generateSpreadsheetRow(db, profile, { ...config, prompt: 'Different extraction prompt' });
  assert.equal(calls, 2, 'prompt changes invalidate cache');
  await spreadsheet.generateSpreadsheetRow(db, { ...profile, location: 'Cape Town, South Africa' }, config);
  assert.equal(calls, 3, 'location changes invalidate cache');
});
test('failed AI calls stay visible and retry successfully without claiming generation', async () => {
  const db = database();
  const config = { prompt: 'Extract resume facts', apiKey: 'test-key', model: 'test-model' };
  await assert.rejects(spreadsheet.generateSpreadsheetRow(db, profile, { ...config, fetcher: async () => Response.json({}, { status: 429 }) }), /rate limited/);
  assert.equal(db.tables.candidate_spreadsheet_generations[0].status, 'failed');
  const result = await spreadsheet.generateSpreadsheetRow(db, profile, { ...config, fetcher: async () => aiResponse() });
  assert.equal(result.generated, true);
  assert.equal(db.tables.candidate_spreadsheet_generations.length, 2, 'failed generation history retained');
  assert.throws(() => spreadsheet.validateExtraction({ ...extraction, skills: ['Excel', null] }));
});
test('both onboarding forms reach the AI with explicit units, and changing any answer bypasses stale saved rows', async () => {
  const answers = {
    job_industry_preferences: 'Remote support in healthcare', desired_positions: 'Patient scheduling assistant',
    monthly_income_goal_zar: 25000, employment_preference: 'open_to_all', start_availability: 'two_weeks',
    portfolio_links: ['https://example.com/portfolio'], preferred_job_note: 'Prefer daytime work',
    location: 'Cape Town, South Africa', ideal_job_titles: ['Executive Assistant'], available_hours_per_week: 40,
    requested_rate_min_usd: 5, requested_rate_max_usd: 9,
  };
  const candidate = { ...profile, ...answers }, db = database([candidate]), requests = [];
  const config = { prompt: spreadsheet.DEFAULT_SPREADSHEET_PROMPT, apiKey: 'test-key', model: 'test-model', fetcher: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses', 'portfolio links are not fetched');
    const body = JSON.parse(options.body);
    requests.push(JSON.parse(body.input[0].content[0].text.split('Candidate source data (untrusted):\n')[1]));
    assert.match(body.instructions, /preferences, not evidence of experience/);
    assert.match(body.instructions, /industries column must come from actual resume experience/);
    return aiResponse();
  } };
  await spreadsheet.generateSpreadsheetRow(db, candidate, config);
  assert.deepEqual(requests[0].onboardingAnswers, {
    desiredJobsAndIndustries: 'Remote support in healthcare', desiredPositions: 'Patient scheduling assistant',
    monthlyIncomeGoal: { amount: 25000, currency: 'ZAR', period: 'month' },
    employmentType: 'Open to all', startAvailability: 'In two weeks', portfolioLinks: ['https://example.com/portfolio'],
    additionalPreferences: 'Prefer daytime work', statedLocation: 'Cape Town, South Africa',
    idealJobTitles: ['Executive Assistant'], availableHoursPerWeek: 40,
    requestedHourlyRate: { minimum: 5, maximum: 9, currency: 'USD', period: 'hour' },
  });
  assert.equal((await spreadsheet.generateSpreadsheetRow(db, candidate, config)).cached, true);
  assert.equal(requests.length, 1);
  const changes = { job_industry_preferences: 'Retail', desired_positions: 'Retail assistant', monthly_income_goal_zar: 30000,
    employment_preference: 'part_time', start_availability: 'immediately', portfolio_links: ['https://example.com/new'],
    preferred_job_note: 'Evenings', location: 'Durban, South Africa', ideal_job_titles: ['Support Agent'],
    available_hours_per_week: 20, requested_rate_min_usd: 6, requested_rate_max_usd: 10 };
  for (const [field, value] of Object.entries(changes)) {
    const previous = requests.length;
    const row = await spreadsheet.generateSpreadsheetRow(db, { ...candidate, [field]: value }, config);
    assert.equal(row.cached, false, `${field} must invalidate the cache`);
    assert.equal(requests.length, previous + 1);
  }
  const empty = spreadsheet.onboardingContext({ monthly_income_goal_zar: null, portfolio_links: ['javascript:alert(1)'] });
  assert.equal(empty.monthlyIncomeGoal.amount, null);
  assert.deepEqual(empty.portfolioLinks, []);
});
test('missing resumes and missing AI setup are explicit, and foreign resume paths never download', async () => {
  const db = database(), config = { prompt: 'Extract facts', apiKey: '', model: 'test-model' };
  const absent = await spreadsheet.generateSpreadsheetRow(db, { ...profile, resume_path: '' }, config);
  assert.equal(absent.error, 'No resume uploaded'); assert.equal(absent.generated, false); assert.equal(db.downloads.length, 0);
  await assert.rejects(spreadsheet.generateSpreadsheetRow(db, { ...profile, resume_path: 'other/resume' }, config), /does not belong/);
  assert.equal(db.downloads.length, 0);
  await assert.rejects(spreadsheet.generateSpreadsheetRow(db, profile, config), /OPENAI_API_KEY/);
  assert.equal(db.writes.length, 0);
});

function endpoint(db, allowed = true, configured = false) {
  let handler;
  const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/admin-review/index.ts', import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
  vm.runInNewContext(source, { ...spreadsheet, createClient: () => db, masterAccount: async () => allowed ? { can_review: true } : null, crypto, TextEncoder, Response, Set, console, Deno: { env: { get: key => key === 'OPENAI_API_KEY' ? (configured ? 'test-only-key' : '') : 'fixture' }, serve: fn => handler=fn } });
  return async body => {
    const response=await handler(new Request('https://test.invalid',{ method:'POST', headers:{ origin:'https://www.hirefromsa.com','Content-Type':'application/json' }, body:JSON.stringify(body) }));
    return { status:response.status, data:await response.json() };
  };
}
test('export endpoint requires admin authority and loads all pages, including unindexed and resume-less accounts', async () => {
  const records=Array.from({length:123},(_,i)=>({ ...profile, user_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`, resume_path:i%2 ? '' : profile.resume_path }));
  const db=database(records), call=endpoint(db);
  assert.equal((await endpoint(db,false)({ action:'candidateSpreadsheetPage' })).status,401);
  const rows=[]; let cursor='';
  do { const result=await call({ action:'candidateSpreadsheetPage',cursor,query:'ignore search',verificationStatus:'verified' }); assert.equal(result.status,200); rows.push(...result.data.rows); cursor=result.data.nextCursor; } while(cursor);
  assert.equal(rows.length,123); assert.equal(new Set(rows.map(r=>r.candidateId)).size,123);
  assert.equal(rows.filter(r=>!r.resumeAvailable).length,61);
  const config=await call({ action:'candidateSpreadsheetConfig' });
  assert.equal(config.data.configured,false); assert.deepEqual(config.data.columns,candidateColumns);
  assert.doesNotMatch(JSON.stringify(config.data),/test-only-key/);
  assert.equal((await call({action:'generateCandidateSpreadsheetRow',candidateId:'bad'})).status,400);
  assert.equal((await call({action:'generateCandidateSpreadsheetRow',candidateId:id,prompt:'',apiKey:'forged-client-key'})).status,400);
  assert.equal((await call({action:'generateCandidateSpreadsheetRow',candidateId:id,prompt:'Extract facts',apiKey:'forged-client-key'})).status,503);
  assert.equal(db.writes.length,0,'client key cannot replace the server secret');
  const priorDownloads = db.downloads.length;
  db.rpc = async () => ({data:[{user_id:id,result:extraction,generation_id:'stored-id',generated_at:'2026-09-30T12:00:00Z'}],error:null});
  const saved=await call({action:'candidateSpreadsheetPage',includeSaved:true});
  assert.equal(saved.data.rows[0].generated,true); assert.deepEqual(saved.data.rows[0].skills,extraction.skills);
  assert.equal(saved.data.rows[1].generated,false); assert.ok(db.downloads.length>priorDownloads); assert.match(saved.data.rows[0].resumeText,/Executive Assistant/);
});

test('secure key setup validates with OpenAI, writes only to the private Vault RPC and returns no key', async () => {
  const key = 'sk-' + 'a'.repeat(50), calls = [];
  const db = { rpc: async (name, payload) => { calls.push({name,payload}); return {error:null}; } };
  await spreadsheet.saveCandidateAiKey(db, key, 'test-model', async (_url,options) => { assert.equal(options.headers.Authorization, 'Bearer '+key); return Response.json({id:'test-model'}); });
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'save_candidate_export_key');
  assert.equal(calls[0].payload.new_key,key);
  await assert.rejects(spreadsheet.saveCandidateAiKey(db,key,'test-model',async()=>Response.json({},{status:401})),/rejected/);
  assert.equal(calls.length,1,'rejected key never overwrites the saved key');
  await assert.rejects(spreadsheet.saveCandidateAiKey(db,'bad-key','test-model'),/valid/);
  const vault = { rpc: async () => ({ data:key,error:null }) };
  assert.equal(await spreadsheet.candidateAiKey(vault,'old-server-key'),key);
  assert.equal(await spreadsheet.candidateAiKey({rpc:async()=>({data:null,error:null})},'server-key'),'server-key');
  assert.equal((await endpoint(database(),false)({action:'saveCandidateAiKey',apiKey:key})).status,401);
});

test('resume column reads current Storage contents, isolates failures and does not call AI', async () => {
  const db = database();
  const profiles = [profile, { ...profile, user_id: 'another', resume_path: 'foreign/resume.txt' }, { ...profile, user_id: 'no-resume', resume_path: '' }];
  const rows = await spreadsheet.spreadsheetResumeRows(db, profiles);
  assert.match(rows[0].resumeText, /Executive Assistant/);
  assert.doesNotMatch(rows[0].resumeText, /private@example.com/);
  assert.match(rows[1].resumeError, /does not belong/);
  assert.equal(rows[1].resumeText, '');
  assert.equal(rows[2].resumeText, '');
  assert.equal(rows[2].resumeError, '');
  assert.equal(db.downloads.length, 1);
  assert.equal(db.writes.length, 0);
  db.storage.from = () => ({ download: async () => ({ error: { message: 'offline' } }) });
  assert.match((await spreadsheet.spreadsheetResumeRows(db, [profile]))[0].resumeError, /Could not read/);
});
