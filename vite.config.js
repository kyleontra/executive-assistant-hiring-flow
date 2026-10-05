const { defineConfig } = require('vite');
const { copyFileSync } = require('node:fs');
const { resolve } = require('node:path');
const isVercelBuild = process.env.VERCEL === '1';

const pages = {
  index: 'index.html',
  home: 'home.html',
  talent: 'talent.html',
  employerLogin: 'employer-login.html',
  resetPassword: 'reset-password.html',
  employerSignup: 'employer-signup.html',
  account: 'account.html',
  employerProfile: 'employer-profile.html',
  employees: 'employees.html',
  billing: 'billing.html',
  jobs: 'jobs.html',
  jobDetail: 'job-detail.html',
  responsibilities: 'responsibilities.html',
  jobDescription: 'job-description.html',
  applicantQuestions: 'applicant-questions.html',
  compensation: 'compensation.html',
  review: 'review.html',
  promote: 'promote.html',
  published: 'published.html',
  applicants: 'applicants.html',
  inbox: 'inbox.html',
  postedJobs: 'posted-jobs.html',
  adminReview: 'admin-review.html',
  adminResumes: 'admin-resumes.html',
  verification: 'verification.html',
  idVerification: 'id-verification.html',
  candidateSignup: 'candidate-signup.html',
  checkEmail: 'check-email.html',
  candidateNextSteps: 'candidate-next-steps.html',
  emailConfirmed: 'email-confirmed.html',
  referral: 'referral.html',
  candidateExperience: 'candidate-experience.html',
  candidateResume: 'candidate-resume.html',
  candidateProfile: 'candidate-profile.html',
  candidateQuestions: 'candidate-questions.html',
  welcome: 'welcome.html',
  apply: 'apply.html',
  employerJob: 'employer-job.html',
  applicationQuestions: 'application-questions.html',
  applied: 'applied.html',
  candidateLogin: 'candidate-login.html',
  candidateDashboard: 'candidate-dashboard.html',
  candidatePublicProfile: 'candidate-public-profile.html',
  onboardingDemo: 'onboarding-demo.html',
  signupPreview: 'signup-preview.html',
  candidateOnboarding: 'candidate-onboarding.html',
  virtualBackgroundTest: 'virtual-background-test.html',
  schedulerSettings: 'scheduler-settings.html',
  scheduleInterview: 'schedule-interview.html',
};

if (isVercelBuild) {
  delete pages.candidateExperience;
  delete pages.onboardingDemo;
  delete pages.signupPreview;
}

const plugins = [{
  name: 'copy-classic-browser-scripts',
  writeBundle() {
    ['account-menu.css', 'script.js', 'auth-client.js', 'platform-client.js', 'account-role.js', 'account-menu.js', 'account.js', 'home-auth.js', 'home-search.js', 'employer-signup.js', 'employer-auth.js', 'employer-login.js', 'reset-password.js', 'talent.js', 'verification.js', 'id-verification.js', 'candidate-signup.js', 'email-confirmed.js', 'referral.js', 'candidate-resume.js', 'candidate-next-steps.js', 'candidate-profile.js', 'headshot-image.mjs', 'camera-request.mjs', 'video-thumbnail.mjs', 'candidate-public-profile.js', 'application-questions.js', 'candidate-login.js', 'scheduler-settings.js', 'schedule-interview.js', 'admin-review.js', 'posted-jobs.js', 'employer-job.js', 'inbox.js', 'employer-nav.js', 'applied.js', 'employer-profile.js', 'employees.js', 'billing.js'].forEach(file => {
      copyFileSync(resolve(__dirname, file), resolve(__dirname, 'dist', file));
    });
  },
}];

if (!isVercelBuild) {
  // Keep the local-only preview builder out of the production dependency graph.
  const previewBuilderPath = ['./flow', '-preview-build.cjs'].join('');
  plugins.unshift({ name: 'build-isolated-flow-preview', closeBundle() { require(previewBuilderPath)(__dirname); } });
}

module.exports = defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(Object.entries(pages).map(([name, file]) => [name, resolve(__dirname, file)])),
    },
  },
  plugins,
});
