import { parsePortfolioLinks, publicPortfolioLinks } from '../supabase/functions/_shared/portfolio-links.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { onboardingStage, identityApproved, pendingPhotoReview, validIntroFile } from '../supabase/functions/_shared/onboarding-state.mjs';
const profile = { resume_path: 'own/resume.txt', profile_photo_path: 'candidate-profiles/owner/profile', verification_status: 'pending' };
const submittedIdentity = { identity_video_uploaded_at: 'now' };
const completeGuides = { platform_completed_at: 'now', intro_completed_at: 'now' };
test('saved stages distinguish submission, waiting, approval, optional intro and completion', () => {
  assert.equal(onboardingStage({}), 'resume');
  assert.equal(onboardingStage({...profile,verification_status:'draft'}), 'verification');
  assert.equal(onboardingStage({...profile,profile_photo_path:'',verification_status:'draft'}), 'profile');
  assert.equal(onboardingStage(profile,submittedIdentity), 'identity');
  assert.equal(onboardingStage(profile,{...submittedIdentity,identity_completed_at:'now'}), 'platform');
  assert.equal(onboardingStage(profile,{...submittedIdentity,identity_completed_at:'now',platform_completed_at:'now'}), 'contract');
  assert.equal(onboardingStage(profile,{...submittedIdentity,identity_completed_at:'now',platform_completed_at:'now',contract_accepted_at:'now'}), 'waiting');
  assert.equal(onboardingStage({...profile,verification_status:'draft'},{identity_video_uploaded_at:'now'}), 'identity');
  assert.equal(onboardingStage({...profile,verification_status:'draft'},{identity_completed_at:'now'}), 'verification');
  assert.equal(onboardingStage({...profile,verification_status:'draft'},{identity_video_uploaded_at:'now',identity_completed_at:'now'}), 'platform');
  const approved = {...profile,verification_status:'verified'};
  assert.equal(onboardingStage(approved), 'platform');
  assert.equal(onboardingStage(approved,{platform_completed_at:'now'}), 'intro');
  assert.equal(onboardingStage(approved,completeGuides), 'recording');
  assert.equal(onboardingStage(approved,{...completeGuides,intro_skipped_at:'now'}), 'complete');
  assert.equal(onboardingStage(approved,{...completeGuides,intro_path:'own/intro.mp4'}), 'complete');
});
test('job preferences are first after identity approval and never interrupt verification', () => {
  const newProfile = { ...profile, onboarding_preferences_required: true };
  assert.equal(onboardingStage({ ...newProfile, profile_photo_path: '' }), 'profile');
  assert.equal(onboardingStage(newProfile), 'verification');
  assert.equal(onboardingStage({ ...newProfile, preferences_completed_at: 'now' }), 'verification');
  const readyForReview = { identity_completed_at: 'now', identity_video_uploaded_at: 'now', platform_completed_at: 'now', contract_accepted_at: 'now' };
  assert.equal(onboardingStage(newProfile, readyForReview), 'waiting');
  const approved = { ...newProfile, verification_status: 'verified' };
  assert.equal(onboardingStage(approved, readyForReview), 'preferences');
  assert.equal(onboardingStage(approved, { ...readyForReview, intro_completed_at: 'now', intro_path: 'own/intro.webm' }), 'preferences');
  assert.equal(onboardingStage({ ...approved, preferences_completed_at: 'now' }, readyForReview), 'intro');
  assert.equal(onboardingStage(profile), 'verification');
});
test('video validation rejects disguised files, empty files and oversized files', async () => {
  assert.equal(await validIntroFile(new Blob(['not a video'],{type:'video/mp4'})),false);
  assert.equal(await validIntroFile(new Blob([],{type:'video/webm'})),false);
  assert.equal(await validIntroFile(new Blob([new Uint8Array(26*1024*1024)],{type:'video/mp4'})),false);
  assert.equal(await validIntroFile(new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3])],{type:'video/webm'})),true);
});
function harness({user={id:'owner',email_confirmed_at:'now',app_metadata:{account_role:'candidate'}},verification='pending',progress=submittedIdentity}={}) {
  const state={profile:{...profile,verification_status:verification},progress:{...progress},writes:[],objects:new Map(),uploadError:false,signedUrlError:false,pendingError:false};
  const admin={auth:{getUser:async()=>({data:{user},error:null})},from(table){return {
    select(){return this},eq(key,value){assert.equal(key,'user_id');assert.equal(value,'owner');return this},
    async maybeSingle(){return {data:table==='candidate_profiles'?state.profile:state.progress,error:null}},
    async upsert(values){state.writes.push(values);Object.assign(state.progress,values);return {error:null}},
    update(values){state.writes.push(values);if(!state.pendingError)Object.assign(state.profile,values);return this},
    then(resolve){resolve({error:state.pendingError ? new Error('Temporary profile save error') : null})},
  }},storage:{from(){return {
    async upload(path,file){if(state.uploadError)return {error:new Error('Upload failed')};state.objects.set(path,file);return {error:null}},
    async remove(paths){paths.forEach(path=>state.objects.delete(path));return {error:null}},
    async createSignedUrl(path){return state.signedUrlError ? {data:null,error:new Error('Storage unavailable')} : {data:{signedUrl:'https://example.invalid/'+path},error:null}},
  }}}};
  let handler;
  const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/candidate-onboarding/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{mode:'strip'});
  vm.runInNewContext(source,{createClient:()=>admin,parsePortfolioLinks,publicPortfolioLinks,onboardingStage,identityApproved,pendingPhotoReview,validIntroFile,Deno:{env:{get:()=>''},serve:fn=>handler=fn},Response,File,Blob,crypto,console:{error(){}},Set});
  const request=async(body,token=true)=>{
    const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{origin:'https://www.hirefromsa.com',...(token?{authorization:'Bearer token'}:{}),...(!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body instanceof FormData?body:JSON.stringify(body)}));
    return {status:response.status,body:await response.json()};
  };
  return {state,request};
}
test('two surveys save independently, resume at step two, and complete only after goals', async () => {
  const h = harness({ verification: 'verified', progress: { platform_completed_at: 'now', contract_accepted_at: 'now' } });
  h.state.profile.onboarding_preferences_required = true;
  assert.equal((await h.request({ action: 'status' })).body.surveyStep, 1);
  const career = { action: 'saveCareerSurvey', jobIndustryPreferences: 'Healthcare and online retail customer support', desiredPositions: 'Medical VA managing appointments and patient enquiries', userId: 'someone-else' };
  const goals = { action: 'savePreferences', monthlyIncomeGoalZar: '25000.50', employmentPreference: 'open_to_all', startAvailability: 'two_weeks', preferredJobNote: 'Morning overlap preferred' };
  assert.equal((await h.request(goals)).status, 409);
  assert.equal((await h.request({ ...career, desiredPositions: '  ' })).status, 400);
  assert.equal((await h.request(career)).status, 200);
  assert.equal(h.state.profile.preferences_completed_at, undefined);
  const midway = (await h.request({ action: 'status' })).body;
  assert.equal(midway.stage, 'preferences');
  assert.equal(midway.surveyStep, 2);
  assert.equal(midway.preferences.desiredPositions, career.desiredPositions);
  assert.equal((await h.request(goals)).status, 200);
  assert.equal(h.state.profile.monthly_income_goal_zar, 25000.5);
  assert.equal(h.state.profile.employment_preference, 'open_to_all');
  assert.equal(h.state.profile.requested_rate_min_usd, undefined);
  assert.equal((await h.request({ action: 'status' })).body.stage, 'intro');
  assert.equal((await h.request({ action: 'status' })).body.preferences.monthlyIncomeGoalZar, 25000.5);
  assert.equal((await h.request({ ...career, desiredPositions: 'Executive Assistant in healthcare' })).status, 200);
  assert.equal(h.state.profile.monthly_income_goal_zar, 25000.5);
});
test('survey validation rejects invalid money, unsupported choices and oversized answers without advancing', async () => {
  const h = harness({ verification: 'verified', progress: {} });
  h.state.profile.career_survey_completed_at = 'now';
  const goals = { action: 'savePreferences', monthlyIncomeGoalZar: '20000', employmentPreference: 'full_time', startAvailability: 'immediately', preferredJobNote: '' };
  for (const amount of ['', '-1', '0', 'Infinity', '1e5', '12.345', '10000001', 'R20000']) {
    assert.equal((await h.request({ ...goals, monthlyIncomeGoalZar: amount })).status, 400);
  }
  assert.equal((await h.request({ ...goals, employmentPreference: 'invalid' })).status, 400);
  assert.equal((await h.request({ ...goals, preferredJobNote: 'a'.repeat(401) })).status, 400);
  assert.equal((await h.request({ action: 'saveCareerSurvey', jobIndustryPreferences: 'a'.repeat(2001), desiredPositions: 'Assistant' })).status, 400);
  assert.equal(h.state.profile.preferences_completed_at, undefined);
  assert.equal(h.state.writes.length, 0);
  for (const employmentPreference of ['full_time', 'part_time', 'contractor', 'open_to_all']) {
    assert.equal((await h.request({ ...goals, employmentPreference })).status, 200);
  }
});

test('preference saving requires identity approval and intro actions cannot bypass required preferences', async () => {
  const career = { action: 'saveCareerSurvey', jobIndustryPreferences: 'Healthcare', desiredPositions: 'Executive Assistant' };
  const goals = { action: 'savePreferences', monthlyIncomeGoalZar: '20000', employmentPreference: 'full_time', startAvailability: 'immediately' };
  for (const verification of ['draft', 'pending', 'rejected']) {
    const h = harness({ verification });
    h.state.profile.career_survey_completed_at = 'now';
    assert.equal((await h.request(career)).status, 403);
    assert.equal((await h.request(goals)).status, 403);
    assert.equal(h.state.writes.length, 0);
  }
  const h = harness({ verification: 'verified', progress: completeGuides });
  h.state.profile.onboarding_preferences_required = true;
  assert.equal((await h.request({ action: 'completeGuide', guide: 'intro' })).status, 403);
  assert.equal((await h.request({ action: 'skipIntro' })).status, 403);
  const form = new FormData();
  form.append('video', new File([new Uint8Array([0x1a,0x45,0xdf,0xa3])], 'intro.webm', { type: 'video/webm' }));
  form.append('consent', 'true');
  assert.equal((await h.request(form)).status, 403);
  assert.equal(h.state.writes.length, 0);
});
test('server saves each guide and resumes an optional skip using account-owned state', async()=>{
 const h=harness();
 assert.equal((await h.request({action:'completeGuide',guide:'platform'})).status,403);
 assert.equal((await h.request({action:'completeGuide',guide:'identity'})).status,200);
 assert.equal((await h.request({action:'status'})).body.stage,'platform');
 const platformComplete=await h.request({action:'completeGuide',guide:'platform'});
 assert.equal(platformComplete.status,200);
 assert.equal(platformComplete.body.stage,'contract');
 assert.equal(platformComplete.body.contractName,'');
 assert.equal((await h.request({action:'status'})).body.stage,'contract');
 assert.equal((await h.request({action:'completeContract',contractName:'Test Candidate',accepted:true})).status,200);
 assert.equal((await h.request({action:'status'})).body.stage,'waiting');
 h.state.profile.verification_status='verified';
 assert.equal((await h.request({action:'completeGuide',guide:'intro'})).status,200);
 assert.equal((await h.request({action:'status'})).body.stage,'recording');
 await h.request({action:'skipIntro'});
 assert.equal((await h.request({action:'status'})).body.stage,'complete');
 assert(h.state.writes.filter(write=>Object.hasOwn(write,'user_id')).every(write=>write.user_id==='owner'));
});
test('contract requires the identity video and acceptance, then starts pending review',async()=>{
 const missing=harness({verification:'draft'});
 assert.equal((await missing.request({action:'completeContract',contractName:'Test Candidate',accepted:true})).status,403);
 const h=harness({verification:'draft',progress:{identity_video_uploaded_at:'now'}});
 assert.equal((await h.request({action:'completeGuide',guide:'identity'})).status,200);
 assert.equal((await h.request({action:'completeContract',contractName:'Test Candidate',accepted:true})).status,403);
 assert.equal((await h.request({action:'completeGuide',guide:'platform'})).status,200);
 assert.equal((await h.request({action:'completeContract',contractName:'Test Candidate',accepted:false})).status,400);
 assert.equal((await h.request({action:'completeContract',contractName:'Test Candidate',accepted:true})).status,200);
 assert.equal(h.state.profile.verification_status,'pending');
 assert.equal(h.state.progress.contract_version,'sendlink-6a99dcb2ea613131e9ac83f3-v1');
});
test('the review guide cannot complete until a private ID video has actually been submitted', async () => {
  const h = harness({ verification: 'draft', progress: {} });
  assert.equal((await h.request({ action: 'status' })).body.stage, 'verification');
  assert.equal((await h.request({ action: 'completeGuide', guide: 'identity' })).status, 403);
  assert.equal(h.state.writes.length, 0);
  h.state.progress.identity_video_uploaded_at = 'now';
  assert.equal((await h.request({ action: 'status' })).body.stage, 'identity');
  assert.equal((await h.request({ action: 'completeGuide', guide: 'identity' })).status, 200);
  assert.equal((await h.request({ action: 'status' })).body.stage, 'platform');
});
test('a rejected candidate must upload a fresh video before signing again',()=>{
 assert.equal(onboardingStage({...profile,verification_status:'rejected'},{identity_video_uploaded_at:'old',identity_completed_at:'old',contract_accepted_at:'old'}),'verification');
 assert.equal(onboardingStage({...profile,verification_status:'rejected'},{identity_video_uploaded_at:'new'}),'identity');
});
test('server rejects missing auth, wrong roles and unapproved intro uploads',async()=>{
 assert.equal((await harness().request({action:'status'},false)).status,401);
 assert.equal((await harness({user:null}).request({action:'status'})).status,401);
 assert.equal((await harness({user:{email_confirmed_at:'now',app_metadata:{account_role:'employer'}}}).request({action:'status'})).status,401);
 assert.equal((await harness().request({action:'skipIntro'})).status,403);
 assert.equal((await harness().request({action:'completeGuide',guide:'__proto__'})).status,400);
});
test('intro requires consent, saves only in owner folder, survives failed replacement and can be removed',async()=>{
 const h=harness({verification:'verified',progress:completeGuides});
 const form=new FormData();form.append('video',new File([new Uint8Array([0x1a,0x45,0xdf,0xa3])],'intro.webm',{type:'video/webm'}));
 assert.equal((await h.request(form)).status,400);
 form.append('consent','true');
 assert.equal((await h.request(form)).status,201);
 assert.match(h.state.progress.intro_path,/^owner\//);
 const savedPath=h.state.progress.intro_path;
 h.state.uploadError=true;
 assert.equal((await h.request(form)).status,500);
 assert.equal(h.state.progress.intro_path,savedPath);
 assert.equal((await h.request({action:'status',userId:'other'})).body.introSaved,true);
 assert.equal((await h.request({action:'removeIntro'})).status,200);
 assert.equal(h.state.progress.intro_path,null);
 assert.equal(h.state.objects.size,0);
});

test('saved ID photos resume without browser state and rejected photos are not reused', async () => {
  const h = harness({ verification: 'draft', progress: { identity_completed_at: 'now', review_reference: 'SA-ABCDEF12', identity_photos_uploaded_at: '2026-09-28T12:00:00Z' } });
  const status = (await h.request({ action: 'status' })).body;
  assert.equal(status.stage, 'verification');
  assert.equal(status.reviewReference, 'SA-ABCDEF12');
  h.state.profile.verification_status = 'rejected';
  h.state.progress.identity_video_uploaded_at = '2026-09-28T13:00:00Z';
  h.state.progress.contract_accepted_at = 'now';
  assert.equal((await h.request({ action: 'status' })).body.reviewReference, '');
  h.state.progress.review_reference = 'SA-AB123456';
  h.state.progress.identity_photos_uploaded_at = '2026-09-28T14:00:00Z';
  assert.equal((await h.request({ action: 'status' })).body.reviewReference, 'SA-AB123456');
  h.state.progress.review_reference = 'invalid';
  assert.equal((await h.request({ action: 'status' })).body.reviewReference, '');
});

test('optional portfolio links save to the account and survive reload; invalid links do not complete preferences', async () => {
  const h = harness({ verification: 'verified' });
  h.state.profile.career_survey_completed_at = 'now';
  h.state.profile.onboarding_preferences_required = true;
  const goals = { action: 'savePreferences', monthlyIncomeGoalZar: '20000', employmentPreference: 'full_time', startAvailability: 'immediately' };
  assert.equal((await h.request({ ...goals, portfolioLinks: 'javascript:alert(1)' })).status, 400);
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.profile.preferences_completed_at, undefined);
  assert.equal((await h.request({ ...goals, portfolioLinks: 'https://example.com/work\nhttps://behance.net/candidate\nhttps://example.com/work', userId: 'other' })).status, 200);
  assert.deepEqual(h.state.profile.portfolio_links, ['https://example.com/work', 'https://behance.net/candidate']);
  assert.deepEqual((await h.request({ action: 'status' })).body.preferences.portfolioLinks, h.state.profile.portfolio_links);
  assert.equal((await h.request(goals)).status, 200);
  assert.equal(h.state.profile.portfolio_links.length, 2, 'old clients preserve existing links');
  assert.equal((await h.request({ ...goals, portfolioLinks: '' })).status, 200);
  assert.deepEqual(h.state.profile.portfolio_links, []);
});

test('approved legacy accounts with a signed contract can finish the intro steps', async () => {
  const h = harness({ verification: 'verified', progress: { contract_accepted_at: 'legacy' } });
  assert.equal((await h.request({ action: 'status' })).body.stage, 'intro');
  assert.equal((await h.request({ action: 'completeGuide', guide: 'intro' })).status, 200);
  assert.equal((await h.request({ action: 'skipIntro' })).status, 200);
  assert.equal((await h.request({ action: 'status' })).body.stage, 'complete');
  const notReady = harness({ verification: 'verified', progress: {} });
  assert.equal((await notReady.request({ action: 'completeGuide', guide: 'intro' })).status, 403);
});
test('an unavailable saved intro cannot block forms, replacement or optional continuation', async () => {
  const h = harness({ verification: 'verified', progress: { ...completeGuides, intro_path: 'owner/old.webm' } });
  h.state.signedUrlError = true;
  h.state.profile.onboarding_preferences_required = true;
  const state = await h.request({ action: 'status' });
  assert.equal(state.status, 200);
  assert.equal(state.body.stage, 'preferences');
  assert.equal(state.body.introUrl, '');
  assert.equal(state.body.introSaved, true);
  assert.match(state.body.introPlaybackError, /could not load/);
  h.state.profile.preferences_completed_at = 'now';
  assert.equal((await h.request({ action: 'skipIntro' })).status, 200);
});
test('a failed pending-status save keeps a rejected candidate at the contract for retry', async () => {
  const h = harness({ verification: 'rejected', progress: { identity_video_uploaded_at: 'new', identity_completed_at: 'now', platform_completed_at: 'now' } });
  h.state.pendingError = true;
  const contract = { action: 'completeContract', contractName: 'Test Candidate', accepted: true };
  assert.equal((await h.request(contract)).status, 500);
  assert.equal((await h.request({ action: 'status' })).body.stage, 'contract');
  h.state.pendingError = false;
  assert.equal((await h.request(contract)).status, 200);
  assert.equal((await h.request({ action: 'status' })).body.stage, 'waiting');
});
