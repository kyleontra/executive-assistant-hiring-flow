import { parsePortfolioLinks, publicPortfolioLinks } from '../_shared/portfolio-links.mjs';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { identityApproved, onboardingStage, pendingPhotoReview, validIntroFile } from '../_shared/onboarding-state.mjs';

const ORIGINS = new Set(['https://www.hirefromsa.com', 'https://hirefromsa.com', 'https://executive-assistant-hiring-flow.vercel.app', 'http://127.0.0.1:4183', 'http://localhost:5173', 'http://127.0.0.1:5173']);
const BUCKET = 'candidate-introductions';
const CONTRACT_VERSION = 'sendlink-6a99dcb2ea613131e9ac83f3-v1';
const COLUMNS = { identity: 'identity_completed_at', platform: 'platform_completed_at', intro: 'intro_completed_at' };
function headers(req: Request) {
  return { 'Access-Control-Allow-Origin': ORIGINS.has(req.headers.get('origin') || '') ? req.headers.get('origin')! : 'https://www.hirefromsa.com', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
}
function reply(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headers(req) });
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed.' }, 405);
  if (req.headers.get('origin') && !ORIGINS.has(req.headers.get('origin')!)) return reply(req, { error: 'Origin not allowed.' }, 403);
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!token) return reply(req, { error: 'Sign in to continue.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user?.email_confirmed_at || (user.app_metadata?.account_role && user.app_metadata.account_role !== 'candidate')) return reply(req, { error: 'Sign in with your verified candidate account.' }, 401);
    const { data: profile, error: profileError } = await admin.from('candidate_profiles').select('full_name, resume_path, profile_photo_path, verification_status, verification_bypass, requested_rate_min_usd, requested_rate_max_usd, available_hours_per_week, location, ideal_job_titles, start_availability, preferred_job_note, onboarding_preferences_required, preferences_completed_at, job_industry_preferences, desired_positions, career_survey_completed_at, monthly_income_goal_zar, employment_preference, portfolio_links, work_time_zones, nickname').eq('user_id', user.id).maybeSingle();
    if (profileError) throw profileError;
    const { data: saved, error: progressError } = await admin.from('candidate_onboarding').select('*').eq('user_id', user.id).maybeSingle();
    if (progressError) throw progressError;
    const progress = saved || {};
    const platformReady = Boolean(progress.platform_completed_at || progress.contract_accepted_at);
    if (Number(req.headers.get('content-length')) > 26 * 1024 * 1024) return reply(req, { error: 'Use a video under 25 MB.' }, 413);
    const multipart = req.headers.get('content-type')?.includes('multipart/form-data');
    const form = multipart ? await req.formData() : null;
    const body = form ? { action: 'saveIntro' } : await req.json();
    const action = body.action;
    const save = async (values: Record<string, unknown>) => {
      const { error } = await admin.from('candidate_onboarding').upsert({ user_id: user.id, ...values, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    };
    if (action === 'status') {
      let introUrl = '';
      let introPlaybackError = '';
      if (progress.intro_path) {
        const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(progress.intro_path, 3600);
        if (error || !data?.signedUrl) introPlaybackError = 'Your saved introduction could not load. You can retry, replace it, or keep it and continue.';
        else introUrl = data.signedUrl;
      }
      return reply(req, { stage: onboardingStage(profile, progress), approved: identityApproved(profile), verificationStatus: profile?.verification_status || 'draft', reviewReference: pendingPhotoReview(profile, progress), introUrl, introSaved: Boolean(progress.intro_path), introPlaybackError, contractName: progress.contract_name || profile?.full_name || '', contractCompleted: Boolean(progress.contract_accepted_at), surveyStep: profile?.career_survey_completed_at ? 2 : 1, preferences: { jobIndustryPreferences: profile?.job_industry_preferences || '', desiredPositions: profile?.desired_positions || '', monthlyIncomeGoalZar: profile?.monthly_income_goal_zar ?? null, employmentPreference: profile?.employment_preference || '', idealJobTitles: profile?.ideal_job_titles || [], requestedRateMinUsd: profile?.requested_rate_min_usd, requestedRateMaxUsd: profile?.requested_rate_max_usd, availableHoursPerWeek: profile?.available_hours_per_week, location: profile?.location || '', startAvailability: profile?.start_availability || '', preferredJobNote: profile?.preferred_job_note || '', portfolioLinks: publicPortfolioLinks(profile?.portfolio_links), workTimeZones: profile?.work_time_zones || [], nickname: profile?.nickname || '' }, guideCompleted: { identity: Boolean(progress.identity_completed_at), platform: Boolean(progress.platform_completed_at), intro: Boolean(progress.intro_completed_at) } });
    }
    if (action === 'saveCareerSurvey' || action === 'savePreferences') {
      if (!profile?.resume_path) return reply(req, { error: 'Connect your resume before completing the surveys.' }, 403);
      // VAs under review may answer these early from My Profile.
      if (!identityApproved(profile) && profile.verification_status !== 'pending') return reply(req, { error: 'Your job preferences open after your contract is submitted.' }, 403);
      const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
      const now = new Date().toISOString();
      let values: Record<string, unknown>;
      if (action === 'saveCareerSurvey') {
        const industries = text(body.jobIndustryPreferences);
        const positions = text(body.desiredPositions);
        if (!industries || industries.length > 2000 || !positions || positions.length > 2000) {
          return reply(req, { error: 'Answer both questions about your ideal work and positions, using up to 2,000 characters each.' }, 400);
        }
        values = { job_industry_preferences: industries, desired_positions: positions, career_survey_completed_at: profile.career_survey_completed_at || now };
      } else {
        if (!profile.career_survey_completed_at) return reply(req, { error: 'Complete the job and industry survey first.' }, 409);
        const incomeRaw = String(body.monthlyIncomeGoalZar ?? '').trim();
        const income = Number(incomeRaw);
        const employment = text(body.employmentPreference);
        const start = text(body.startAvailability);
        const note = text(body.preferredJobNote);
        const nickname = text(body.nickname).replace(/\s+/g, ' ');
        const zones = Array.isArray(body.workTimeZones) ? [...new Set(body.workTimeZones.filter((zone: unknown) => typeof zone === 'string'))] as string[] : [];
        const workTimeZones = zones.includes('ANY') ? ['ANY'] : zones;
        if (!workTimeZones.length || workTimeZones.some((zone) => !['EST', 'PST', 'SAST', 'ANY'].includes(zone)) || nickname.length > 30) {
          return reply(req, { error: 'Select at least one time zone you would be willing to work in, and keep your nickname under 30 characters.' }, 400);
        }
        if (!/^\d+(?:\.\d{1,2})?$/.test(incomeRaw) || !Number.isFinite(income) || income <= 0 || income > 10000000 ||
            !['full_time', 'part_time', 'contractor', 'open_to_all'].includes(employment) ||
            !['immediately', 'two_weeks', 'one_month', 'flexible'].includes(start) || note.length > 400) {
          return reply(req, { error: 'Enter a positive monthly income goal in rand, choose your employment type and start availability, and keep the note under 400 characters.' }, 400);
        }
        let portfolioLinks;
        try { portfolioLinks = parsePortfolioLinks(body.portfolioLinks); }
        catch (error) { return reply(req, { error: error.message }, 400); }
        values = { ...(body.portfolioLinks !== undefined ? { portfolio_links: portfolioLinks } : {}), monthly_income_goal_zar: income, employment_preference: employment, start_availability: start,
          preferred_job_note: note, work_time_zones: workTimeZones, nickname: nickname || null, preferences_completed_at: profile.preferences_completed_at || now };
      }
      const { data: updated, error } = await admin.from('candidate_profiles').update({ ...values, updated_at: now }).eq('user_id', user.id).select('user_id').maybeSingle();
      if (error) throw error;
      if (!updated) return reply(req, { error: 'Your profile was not found. Refresh and try again.' }, 409);
      return reply(req, { status: 'saved', surveyStep: action === 'saveCareerSurvey' ? 2 : null });
    }
    if (action === 'completeGuide') {
      const guide = body.guide as keyof typeof COLUMNS;
      if (!Object.hasOwn(COLUMNS, guide)) return reply(req, { error: 'Unknown guide.' }, 400);
      const identitySubmitted = Boolean(progress.identity_video_uploaded_at)
        && (profile?.verification_status !== 'rejected' || !progress.contract_accepted_at);
      if (guide === 'identity') {
        if (!profile?.resume_path || !identitySubmitted) return reply(req, { error: 'Submit your ID photos and private ID video before watching the review guide.' }, 403);
      } else if (guide === 'platform') {
        if (!profile?.resume_path || (!identityApproved(profile) && (!progress.identity_completed_at || !identitySubmitted))) return reply(req, { error: 'Watch the identity verification video and submit your ID first.' }, 403);
      } else if (!identityApproved(profile) || !profile?.resume_path || !platformReady) {
        return reply(req, { error: 'Complete the platform guide and identity approval first.' }, 403);
      }
      if (guide === 'intro' && profile?.onboarding_preferences_required && !profile.preferences_completed_at) {
        return reply(req, { error: 'Complete your job preferences before the introduction guide.' }, 403);
      }
      // Completion comes from the contiguous-playback UI; it is not proof of attention.
      const completedAt = progress[COLUMNS[guide]] || new Date().toISOString();
      const nextProgress = { ...progress, [COLUMNS[guide]]: completedAt };
      await save({ [COLUMNS[guide]]: completedAt });
      return reply(req, { status: 'saved', stage: onboardingStage(profile, nextProgress), contractName: progress.contract_name || profile?.full_name || '' });
    }
    if (action === 'completeContract') {
      const contractName = typeof body.contractName === 'string' ? body.contractName.trim().replace(/\s+/g, ' ').slice(0, 160) : '';
      const identitySubmitted = Boolean(progress.identity_video_uploaded_at)
        && (profile?.verification_status !== 'rejected' || !progress.contract_accepted_at);
      if (!profile?.resume_path || !identitySubmitted || !progress.identity_completed_at || !progress.platform_completed_at) return reply(req, { error: 'Watch both pre-contract videos before completing your contract.' }, 403);
      if (identityApproved(profile)) return reply(req, { error: 'Your identity is already approved.' }, 409);
      if (body.accepted !== true || contractName.length < 2) return reply(req, { error: 'Enter your full legal name and accept the contract.' }, 400);
      const previousContract = { contract_accepted_at: progress.contract_accepted_at || null, contract_name: progress.contract_name || null, contract_version: progress.contract_version || null };
      await save({ contract_accepted_at: new Date().toISOString(), contract_name: contractName, contract_version: CONTRACT_VERSION });
      const { error: pendingError } = await admin.from('candidate_profiles').update({ verification_status: 'pending', updated_at: new Date().toISOString() }).eq('user_id', user.id);
      if (pendingError) {
        await save(previousContract);
        throw pendingError;
      }
      return reply(req, { status: 'pending' });
    }
    if (action === 'skipIntro' || action === 'saveIntro' || action === 'removeIntro') {
      // VAs under review may record or remove their intro early from My Profile (not skip it).
      const underReview = !identityApproved(profile) && profile?.verification_status === 'pending';
      if (underReview) {
        if (!profile?.resume_path || action === 'skipIntro') return reply(req, { error: 'Record your intro from My Profile.' }, 403);
      } else {
        if (!identityApproved(profile) || !profile?.resume_path || !platformReady || !progress.intro_completed_at) return reply(req, { error: 'Complete your approved onboarding guides first.' }, 403);
        if (profile.onboarding_preferences_required && !profile.preferences_completed_at) return reply(req, { error: 'Complete your job preferences before your introduction.' }, 403);
      }
      if (action === 'skipIntro') {
        await save({ intro_skipped_at: new Date().toISOString() });
        return reply(req, { status: 'saved' });
      }
      if (action === 'removeIntro') {
        await save({ intro_path: null, intro_consent_at: null, intro_skipped_at: new Date().toISOString() });
        if (progress.intro_path) await admin.storage.from(BUCKET).remove([progress.intro_path]);
        return reply(req, { status: 'removed' });
      }
      const video = form!.get('video');
      if (form!.get('consent') !== 'true') return reply(req, { error: 'Confirm that employers may view your introduction.' }, 400);
      if (!(video instanceof File) || !await validIntroFile(video)) return reply(req, { error: 'Choose a valid MP4 or WebM video under 25 MB.' }, 400);
      const contentType = video.type.split(';')[0].toLowerCase();
      const path = `${user.id}/${crypto.randomUUID()}.${contentType === 'video/mp4' ? 'mp4' : 'webm'}`;
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, video, { contentType, cacheControl: '0', upsert: false });
      if (uploadError) throw uploadError;
      // Recording from My Profile includes the guide, so mark it watched too.
      try { await save({ intro_path: path, intro_consent_at: new Date().toISOString(), intro_skipped_at: null, ...(underReview && !progress.intro_completed_at ? { intro_completed_at: new Date().toISOString() } : {}) }); }
      catch (error) { await admin.storage.from(BUCKET).remove([path]); throw error; }
      if (progress.intro_path) await admin.storage.from(BUCKET).remove([progress.intro_path]);
      return reply(req, { status: 'saved' }, 201);
    }
    return reply(req, { error: 'Unknown onboarding action.' }, 400);
  } catch (error) {
    console.error('Candidate onboarding failed:', error);
    return reply(req, { error: 'Your progress could not be saved. Please try again.' }, 500);
  }
});
