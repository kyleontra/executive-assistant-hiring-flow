import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTalentQuery,normalizeTalentQuery} from '../supabase/functions/_shared/ai-talent-search.mjs';
test('AI criteria remain bounded and cannot inject query operators',()=>{
 const result=normalizeTalentQuery({terms:['CRM','CRM','" or evil','x'.repeat(200)],minYears:200});
 assert.equal(result.minYears,50);assert.ok(result.query.length<=100);assert.deepEqual(result.terms,['crm','or evil']);
});
test('real Responses request uses strict schema and only the search request',async()=>{
 let sent;
 const result=await interpretTalentQuery('Need a bookkeeper with 3 years','fake-key','gpt-6-luna',async(url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({terms:['bookkeeping','quickbooks'],minYears:3,description:'Bookkeeping experience'})}]}]})};});
 assert.equal(result.minYears,3);assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.input[1].content,'Need a bookkeeper with 3 years');
});
test('provider failures and missing criteria produce actionable errors',async()=>{
 await assert.rejects(interpretTalentQuery('crm',''),/not configured/);
 await assert.rejects(interpretTalentQuery('crm','fake','model',async()=>({ok:false})),/temporarily unavailable/);
});
