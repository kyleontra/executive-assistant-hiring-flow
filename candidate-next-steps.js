async function loadNextSteps() {
  const status = document.querySelector('#nextStepsStatus');
  const link = document.querySelector('#continueVerification');
  const job = new URLSearchParams(window.location.search).get('job');
  if (job) sessionStorage.setItem('sava-applying-job', job);
  const user = await window.getVerifiedCandidate();
  if (!user) {
    window.location.replace(`./candidate-login.html?next=${encodeURIComponent(`./candidate-next-steps.html${job ? `?job=${encodeURIComponent(job)}` : ''}`)}`);
    return;
  }
  try {
    const { profile } = await window.savaPlatform.candidateRequest('getProfile');
    if (!profile?.resumePath) {
      window.location.replace(`./candidate-resume.html?next=${encodeURIComponent(`./candidate-next-steps.html${job ? `?job=${encodeURIComponent(job)}` : ''}`)}`);
      return;
    }
    if (profile.applicationReady) {
      window.location.replace(job ? `./application-questions.html?job=${encodeURIComponent(job)}` : './candidate-dashboard.html');
      return;
    }
    if (profile.photoPath) {
      document.querySelector('#headshotStep').textContent = '✓';
      document.querySelector('#headshotStep').classList.add('complete');
      link.href = './candidate-onboarding.html';
    }
    status.textContent = profile.verificationStatus === 'rejected'
      ? 'Your previous verification needs an update. Please submit clear ID photos and a new video.'
      : 'Your progress is saved as you complete each step. No work-history form required.';
    link.hidden = false;
  } catch (error) {
    status.textContent = error.message || 'Your progress could not be loaded. Refresh the page to try again.';
  }
}

loadNextSteps();
