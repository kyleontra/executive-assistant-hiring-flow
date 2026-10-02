(() => {
  const localPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('preview') === '1';
  if (localPreview) {
    document.documentElement.dataset.accountRole = 'employer';
    document.documentElement.dataset.preview = 'true';
    document.documentElement.classList.remove('auth-pending');
    return;
  }

  function currentDestination() {
    const file = window.location.pathname.split('/').pop() || 'talent.html';
    return `./${file}${window.location.search}`;
  }

  async function checkEmployer() {
    document.querySelector('#employerAuthRetry')?.remove();
    try {
    const employer = await window.getVerifiedEmployer();
    if (employer) {
      document.documentElement.dataset.accountRole = 'employer';
      document.documentElement.classList.remove('auth-pending');
      return;
    }
    const next = encodeURIComponent(currentDestination());
    window.location.replace(`./employer-login.html?next=${next}`);
    } catch (error) {
      console.warn('[employer-auth] Sign-in check unavailable; session preserved.');
      const notice = document.createElement('div');
      notice.id = 'employerAuthRetry';
      notice.setAttribute('role', 'alert');
      const copy = document.createElement('p');
      copy.textContent = error.message;
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Retry sign-in check';
      retry.onclick = checkEmployer;
      notice.append(copy, retry);
      document.body.prepend(notice);
    }
  }
  checkEmployer();
})();
