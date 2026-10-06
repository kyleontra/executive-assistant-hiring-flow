const candidatePages = ['candidate-dashboard', 'candidate-resume', 'candidate-onboarding', 'candidate-next-steps', 'candidate-profile', 'candidate-questions', 'welcome', 'id-verification', 'application-questions', 'jobs', 'job-detail', 'apply'];
const employerPages = ['index', 'talent', 'posted-jobs', 'inbox', 'candidate-public-profile', 'compensation', 'job-description', 'applicant-questions', 'review', 'promote', 'published', 'applicants', 'employer-profile', 'employees', 'billing', 'employer-job', 'post-ai', 'scheduler-settings'];

export function safeGoogleDestination(value, role, signup = false) {
  const fallback = role === 'candidate' ? './candidate-dashboard.html' : signup ? './index.html' : './talent.html';
  if (typeof value !== 'string' || value.includes('\\') || /[\r\n]/.test(value)) return fallback;
  const allowed = role === 'candidate' ? candidatePages : employerPages;
  return allowed.some(page => value === `./${page}.html` || value.startsWith(`./${page}.html?`)) ? value : fallback;
}

export function validGoogleContext(value, now = Date.now()) {
  return value && ['candidate', 'employer'].includes(value.role)
    && Number.isFinite(value.startedAt) && value.startedAt <= now
    && now - value.startedAt < 30 * 60 * 1000;
}

