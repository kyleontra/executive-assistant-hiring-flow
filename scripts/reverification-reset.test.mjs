import assert from 'node:assert/strict';
import { candidateAccess } from '../supabase/functions/_shared/candidate-access.mjs';
import { reviewSubmissionAcceptable, reviewSubmissionVisible } from '../supabase/functions/_shared/review-access.mjs';

const resetProfile = {
  resume_path: 'candidate/resume.txt',
  profile_photo_path: 'candidate/profile.jpg',
  verification_status: 'rejected',
  verification_bypass: false,
};

assert.equal(candidateAccess(resetProfile).applicationReady, false);
assert.equal(reviewSubmissionVisible('rejected'), false);
assert.equal(reviewSubmissionAcceptable('rejected'), false);
assert.equal(reviewSubmissionVisible('pending'), true);
assert.equal(reviewSubmissionAcceptable('pending'), true);
assert.equal(reviewSubmissionVisible('verified'), true);
assert.equal(reviewSubmissionAcceptable('verified'), false);

console.log('Reverification reset guards passed.');
