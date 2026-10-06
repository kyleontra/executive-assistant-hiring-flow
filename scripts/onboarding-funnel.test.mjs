import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingFunnel } from '../onboarding-funnel.mjs';
const now = Date.parse('2026-10-06T12:00:00Z');
const row = (status, date, stage='preferences') => ({currentStage:stage,lastActivityAt:date,steps:[{id:'career',label:'Career',status,firstSeenAt:date}]});
test('churn requires reached, incomplete and idle; completed and active candidates do not churn',()=>{
 const result=onboardingFunnel([row('started','2026-10-01'),row('started','2026-10-06'),row('complete','2026-10-01'),{steps:[{id:'career',label:'Career',status:'not_started'}]}],{now});
 assert.deepEqual(result.steps[0],{id:'career',label:'Career',reached:3,completed:1,active:1,stalled:1,waiting:0,churn:1/3,conversion:1/3});
});
test('approval wait is not candidate churn and historical wait counts as reached',()=>{
 const result=onboardingFunnel([{currentStage:'waiting',lastActivityAt:'2026-10-01',steps:[{id:'review',label:'Approval',status:'not_started'}]}],{now});
 assert.equal(result.steps[0].waiting,1);assert.equal(result.steps[0].stalled,0);
});
test('empty denominators are unknown and cohort uses signup date',()=>{
 const result=onboardingFunnel([{steps:[{id:'account',completedAt:'2026-09-01',status:'complete'}]}],{now,since:Date.parse('2026-10-01')});
 assert.equal(result.total,0);assert.equal(result.steps[0].churn,null);
});
test('completed onboarding cannot churn on unfinished optional guide',()=>{
 assert.equal(onboardingFunnel([row('started','2026-10-01','complete')],{now}).steps[0].stalled,0);
});
