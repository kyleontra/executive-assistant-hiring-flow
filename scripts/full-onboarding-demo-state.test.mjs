import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, demoStatus, transition } from './full-onboarding-demo-state.mjs';
const media = async () => {};
const ready = () => {
 const state=initial();
 state.profile.resume_path='test/resume'; state.profile.verification_status='verified';
 state.progress.platform_completed_at='2026-09-30'; state.progress.contract_accepted_at='2026-09-30';
 return state;
};
test('new demo cannot jump past resume and identity', async () => {
 const state=initial();
 assert.equal(demoStatus(state).stage,'resume');
 await assert.rejects(transition(state,{action:'completeGuide',guide:'intro'},null,media));
 await assert.rejects(transition(state,{action:'saveCareerSurvey',jobIndustryPreferences:'Tech',desiredPositions:'Assistant'},null,media));
});
test('approved candidate completes the two forms before the guide', async () => {
 const state=ready();
 assert.equal(demoStatus(state).stage,'preferences');
 await assert.rejects(transition(state,{action:'savePreferences'},null,media));
 await transition(state,{action:'saveCareerSurvey',jobIndustryPreferences:'Technology',desiredPositions:'Executive Assistant'},null,media);
 assert.equal(demoStatus(state).surveyStep,2);
 await transition(state,{action:'savePreferences',monthlyIncomeGoalZar:'25000',employmentPreference:'open_to_all',startAvailability:'immediately',portfolioLinks:'https://example.com/portfolio'},null,media);
 assert.equal(state.preferences.monthlyIncomeGoalZar,25000);
 assert.deepEqual(state.preferences.portfolioLinks,['https://example.com/portfolio']);
 assert.equal(demoStatus(state).stage,'intro');
 await transition(state,{action:'completeGuide',guide:'intro'},null,media);
 assert.equal(demoStatus(state).stage,'recording');
 await transition(state,{action:'skipIntro'},null,media);
 assert.equal(demoStatus(state).stage,'complete');
});
test('invalid portfolio or missing consent cannot mutate completion', async () => {
 const state=ready(); state.profile.career_survey_completed_at='2026-09-30';
 await assert.rejects(transition(state,{action:'savePreferences',monthlyIncomeGoalZar:'25000',employmentPreference:'full_time',startAvailability:'immediately',portfolioLinks:'javascript:alert(1)'},null,media));
 assert.equal(state.profile.preferences_completed_at,undefined);
 state.profile.preferences_completed_at='2026-09-30'; state.progress.intro_completed_at='2026-09-30';
 const form=new FormData(); form.set('video',new Blob(['not a video'],{type:'video/mp4'}));form.set('consent','true');
 await assert.rejects(transition(state,{action:'saveIntro'},form,media));
 assert.equal(state.progress.intro_path,undefined);
});
test('failed local media storage preserves a retryable intro stage', async () => {
 const state=ready();state.profile.preferences_completed_at='2026-09-30';state.progress.intro_completed_at='2026-09-30';
 const form=new FormData();form.set('video',new Blob([new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109])],{type:'video/mp4'}));form.set('consent','true');
 await assert.rejects(transition(state,{action:'saveIntro'},form,async()=>{throw Error('storage full')}),/storage full/);
 assert.equal(demoStatus(state).stage,'recording');
});
