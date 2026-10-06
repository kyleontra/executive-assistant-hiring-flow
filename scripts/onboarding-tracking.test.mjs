import test from 'node:test';
import assert from 'node:assert/strict';
import { trackingSummary } from '../supabase/functions/_shared/onboarding-tracking.mjs';
const user = { id:'test', email:'test@example.com', created_at:'2026-10-01T10:00:00Z', email_confirmed_at:'2026-10-01T10:05:00Z' };
test('opening a step does not complete it', () => {
  const row = trackingSummary(user,{}, {},[{step:'resume',first_seen_at:'2026-10-02T10:00:00Z',last_seen_at:'2026-10-02T10:00:00Z'}]);
  assert.equal(row.steps.find(step => step.id === 'resume').status,'started');
  assert.equal(row.steps.find(step => step.id === 'resume').completedAt,null);
});
test('existing saved data is complete without inventing historical timestamps', () => {
  const row = trackingSummary(user,{resume_path:'resume.pdf',profile_photo_path:'photo.jpg',verification_status:'verified'});
  assert.equal(row.steps.find(step => step.id === 'resume').status,'complete');
  assert.equal(row.steps.find(step => step.id === 'resume').completedAt,null);
  assert.equal(row.steps.find(step => step.id === 'review').status,'complete');
});
test('reset saved data overrides old tracking completions', () => {
  const row = trackingSummary(user,{preferences_completed_at:null},{},[{step:'preferences',completed_at:'2026-10-02',first_seen_at:'2026-10-01'}]);
  assert.equal(row.steps.find(step => step.id === 'preferences').status,'started');
  assert.equal(row.steps.find(step => step.id === 'preferences').completedAt,null);
});
test('optional intro is shown as skipped, rejected verification needs update', () => {
  const row = trackingSummary(user,{verification_status:'rejected'},{intro_skipped_at:'2026-10-02T10:00:00Z'});
  assert.equal(row.steps.find(step => step.id === 'recording').status,'skipped');
  assert.equal(row.steps.find(step => step.id === 'review').status,'needs_update');
});
test('timestamps and error counts stay attached to their own step', () => {
  const row = trackingSummary(user,{}, {},[{step:'welcome',completed_at:'2026-10-02T10:00:00Z',last_seen_at:'2026-10-02T10:00:00Z',error_count:2}]);
  assert.equal(row.errors,2);
  assert.equal(row.steps.find(step => step.id === 'welcome').status,'complete');
  assert.equal(row.steps.find(step => step.id === 'id_video').errors,0);
  assert.equal(row.lastActivityAt,'2026-10-02T10:00:00Z');
});
