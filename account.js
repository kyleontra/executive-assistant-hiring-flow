const accountStatus = document.querySelector('#accountStatus');
const accountContent = document.querySelector('#accountContent');

function accountPageName(user) {
  const firstName = String(user.user_metadata?.first_name || '').trim();
  const lastName = String(user.user_metadata?.last_name || '').trim();
  return `${firstName} ${lastName}`.trim() || String(user.user_metadata?.company_name || '').trim() || user.email?.split('@')[0] || 'My account';
}

function accountPageInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SA';
}

function progressItem(done, text) {
  return `<span><i>${done ? '✓' : '•'}</i>${text}</span>`;
}

function renderEmployerAccount(user) {
  const company = String(user.user_metadata?.company_name || '').trim() || 'Your company';
  document.querySelector('#accountRole').textContent = 'EMPLOYER ACCOUNT';
  document.querySelector('#accountType').textContent = 'Employer';
  document.querySelector('#companyDetail').hidden = false;
  document.querySelector('#accountCompany').textContent = company;
  document.querySelector('#accountProgressTitle').textContent = 'Your hiring workspace';
  document.querySelector('#accountProgressCopy').textContent = 'Your employer session carries across candidate search, job posting, and applicant management.';
  document.querySelector('#accountProgressDetails').innerHTML = progressItem(true, 'Employer account connected') + progressItem(true, 'Candidate search available') + progressItem(true, 'Job posting access available');
  document.querySelector('#accountActions').innerHTML = '<a class="primary" href="./talent.html">Search talent →</a><a href="./index.html">Post a job</a><a href="./applicants.html">Hiring inbox</a><a href="./posted-jobs.html">Posted jobs</a>';
  if (user.app_metadata?.can_review) document.querySelector('#accountActions').insertAdjacentHTML('beforeend', '<a href="./admin-review.html">Candidate approvals</a><a href="./admin-resumes.html">Resume index</a>');
  document.querySelector('#accountHeaderNav').insertAdjacentHTML('afterbegin', '<a href="./talent.html">Talent</a><a href="./applicants.html">Hiring inbox</a>');
}

async function renderCandidateAccount(user) {
  document.querySelector('#accountRole').textContent = 'CANDIDATE ACCOUNT';
  document.querySelector('#accountType').textContent = 'Candidate';
  document.querySelector('#accountProgressTitle').textContent = 'Your candidate profile';
  document.querySelector('#accountActions').innerHTML = '<a class="primary" href="./candidate-dashboard.html">My applications →</a><a href="./candidate-profile.html">Manage profile</a><a href="./candidate-resume.html?next=./account.html">Manage resume</a>';
  document.querySelector('#accountHeaderNav').insertAdjacentHTML('afterbegin', '<a href="./candidate-dashboard.html">My applications</a>');
  try {
    const { profile } = await window.savaPlatform.candidateRequest('getProfile');
    const resumeConnected = Boolean(profile?.resumePath);
    const verificationComplete = Boolean(profile?.verificationComplete);
    document.querySelector('#accountProgressCopy').textContent = resumeConnected
      ? 'Your account, resume, and application history stay connected across the candidate portal.'
      : 'Add your resume to complete the core of your candidate account.';
    document.querySelector('#accountProgressDetails').innerHTML = progressItem(true, 'Candidate account connected') + progressItem(resumeConnected, resumeConnected ? `Resume connected${profile.resumeFileName ? `: ${profile.resumeFileName}` : ''}` : 'Resume still needed') + progressItem(verificationComplete, verificationComplete ? 'Identity steps complete' : 'Identity steps can be completed later');
  } catch {
    document.querySelector('#accountProgressDetails').innerHTML = progressItem(true, 'Candidate account connected') + progressItem(false, 'Profile details temporarily unavailable');
  }
}

async function loadAccountPage() {
  const user = await window.getVerifiedUser();
  if (!user) {
    window.location.replace('./home.html');
    return;
  }
  const name = accountPageName(user);
  document.querySelector('#accountAvatar').textContent = accountPageInitials(name);
  document.querySelector('#accountName').textContent = name;
  document.querySelector('#accountEmail').textContent = user.email || `Username: ${user.username || ''}`;
  document.querySelector('#accountDetailName').textContent = name;
  document.querySelector('#accountDetailEmail').textContent = user.email || 'No email attached';
  if (user.app_metadata?.account_role === 'employer') await renderEmployerAccount(user);
  else await renderCandidateAccount(user);
  accountStatus.hidden = true;
  accountContent.hidden = false;
}

document.querySelector('#accountSignOut').addEventListener('click', async () => {
  const button = document.querySelector('#accountSignOut');
  button.disabled = true;
  button.textContent = 'Signing out…';
  try { await window.signOutAccount(); }
  catch { button.disabled = false; button.textContent = 'Sign-out failed. Try again'; return; }
  window.location.assign('./home.html');
});

loadAccountPage().catch((error) => {
  accountStatus.textContent = error.message || 'Your account could not be loaded.';
  accountStatus.className = 'account-status error';
});
