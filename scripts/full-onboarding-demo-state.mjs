import { onboardingStage, pendingPhotoReview, validIntroFile } from '../supabase/functions/_shared/onboarding-state.mjs';
import { parsePortfolioLinks } from '../supabase/functions/_shared/portfolio-links.mjs';
export const demoKey = 'hfsa-full-candidate-demo-v1';
export const initial = () => ({ profile: { user_id: 'local-demo', verification_status: 'draft', onboarding_preferences_required: true }, progress: {}, preferences: {}, confirmed: false, email: '', firstName: '', lastName: '', applications: [], conversations: [], failures: {} });
export function demoStatus(saved, introUrl = '') {
  return { stage: onboardingStage(saved.profile, saved.progress), reviewReference: pendingPhotoReview(saved.profile, saved.progress), approved: saved.profile.verification_status === 'verified', introSaved: !!saved.progress.intro_path, introUrl, surveyStep: saved.profile.career_survey_completed_at ? 2 : 1, preferences: saved.preferences, contractName: saved.profile.full_name || '', guideCompleted: { intro: !!saved.progress.intro_completed_at } };
}
export async function transition(saved, body, form, media, now = new Date().toISOString()) {
  const text = value => typeof value === 'string' ? value.trim() : '';
  switch (body.action) {
    case 'completeGuide': {
      const stage = onboardingStage(saved.profile, saved.progress);
      if (!['identity', 'platform', 'intro'].includes(body.guide) || stage !== body.guide) throw Error('Complete the earlier steps first.');
      saved.progress[body.guide + '_completed_at'] = now;
      break;
    }
    case 'completeContract':
      if (onboardingStage(saved.profile, saved.progress) !== 'contract' || body.accepted !== true || text(body.contractName).length < 2) throw Error('Complete the guides and confirm the demo contract first.');
      saved.progress.contract_accepted_at = now;
      saved.profile.verification_status = 'pending';
      break;
    case 'saveCareerSurvey': {
      if (saved.profile.verification_status !== 'verified') throw Error('Approve the demo identity first.');
      const jobIndustryPreferences = text(body.jobIndustryPreferences), desiredPositions = text(body.desiredPositions);
      if (!jobIndustryPreferences || !desiredPositions || jobIndustryPreferences.length > 2000 || desiredPositions.length > 2000) throw Error('Answer both questions using up to 2,000 characters each.');
      Object.assign(saved.preferences, { jobIndustryPreferences, desiredPositions });
      saved.profile.career_survey_completed_at = now;
      break;
    }
    case 'savePreferences': {
      if (!saved.profile.career_survey_completed_at) throw Error('Complete the ideal job questions first.');
      const monthlyIncomeGoalZar = Number(body.monthlyIncomeGoalZar), employmentPreference = text(body.employmentPreference), startAvailability = text(body.startAvailability), preferredJobNote = text(body.preferredJobNote);
      if (!/^\d+(?:\.\d{1,2})?$/.test(String(body.monthlyIncomeGoalZar)) || monthlyIncomeGoalZar <= 0 || monthlyIncomeGoalZar > 10000000 || !['full_time', 'part_time', 'contractor', 'open_to_all'].includes(employmentPreference) || !['immediately', 'two_weeks', 'one_month', 'flexible'].includes(startAvailability) || preferredJobNote.length > 400) throw Error('Enter your monthly income goal in rand, employment type and start availability.');
      Object.assign(saved.preferences, { monthlyIncomeGoalZar, employmentPreference, startAvailability, preferredJobNote, portfolioLinks: parsePortfolioLinks(body.portfolioLinks) });
      saved.profile.preferences_completed_at = now;
      break;
    }
    case 'saveIntro': {
      if (!saved.profile.preferences_completed_at || !saved.progress.intro_completed_at) throw Error('Complete the forms and introduction guide first.');
      const file = form?.get('video');
      if (!await validIntroFile(file) || form.get('consent') !== 'true') throw Error('Choose an MP4 or WebM under 25 MB and confirm sharing.');
      await media('put', 'intro', file);
      saved.progress.intro_path = 'browser-only/intro';
      saved.progress.intro_skipped_at = null;
      break;
    }
    case 'skipIntro':
      if (!saved.progress.intro_completed_at || !saved.profile.preferences_completed_at) throw Error('Complete the forms and introduction guide first.');
      saved.progress.intro_skipped_at = now;
      break;
    case 'removeIntro':
      await media('delete', 'intro');
      saved.progress.intro_path = null;
      saved.progress.intro_skipped_at = now;
      break;
    default: throw Error('This action is unavailable in this demo.');
  }
}
