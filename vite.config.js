const { defineConfig } = require('vite');
const { copyFileSync } = require('node:fs');
const { resolve } = require('node:path');

const pages = {
  index: 'index.html',
  home: 'home.html',
  jobs: 'jobs.html',
  jobDetail: 'job-detail.html',
  responsibilities: 'responsibilities.html',
  jobDescription: 'job-description.html',
  applicantQuestions: 'applicant-questions.html',
  compensation: 'compensation.html',
  review: 'review.html',
  published: 'published.html',
  applicants: 'applicants.html',
  postedJobs: 'posted-jobs.html',
  adminReview: 'admin-review.html',
  verification: 'verification.html',
  idVerification: 'id-verification.html',
  candidateSignup: 'candidate-signup.html',
  emailConfirmed: 'email-confirmed.html',
  candidateExperience: 'candidate-experience.html',
  candidateResume: 'candidate-resume.html',
  candidateProfile: 'candidate-profile.html',
  applicationQuestions: 'application-questions.html',
  candidateLogin: 'candidate-login.html',
  candidateDashboard: 'candidate-dashboard.html',
  schedulerSettings: 'scheduler-settings.html',
  scheduleInterview: 'schedule-interview.html',
};

module.exports = defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(Object.entries(pages).map(([name, file]) => [name, resolve(__dirname, file)])),
    },
  },
  plugins: [{
    name: 'copy-classic-browser-scripts',
    writeBundle() {
      ['script.js', 'auth-client.js', 'platform-client.js', 'account-role.js', 'verification.js', 'id-verification.js', 'candidate-signup.js', 'email-confirmed.js', 'candidate-resume.js', 'candidate-experience.js', 'candidate-profile.js', 'application-questions.js', 'candidate-login.js', 'candidate-dashboard.js', 'scheduler-settings.js', 'schedule-interview.js', 'admin-review.js', 'posted-jobs.js'].forEach(file => {
        copyFileSync(resolve(__dirname, file), resolve(__dirname, 'dist', file));
      });
    },
  }],
});
