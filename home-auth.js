(() => {
  const employerLoginUrl = (destination) => `./employer-login.html?next=${encodeURIComponent(destination)}`;

  async function isEmployerSignedIn() {
    const user = await window.getVerifiedEmployer?.();
    return Boolean(user);
  }

  document.querySelectorAll('[data-employer-auth]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const destination = link.getAttribute('href') || './talent.html';
      window.location.assign(await isEmployerSignedIn() ? destination : employerLoginUrl(destination));
    });
  });

  document.querySelector('#homeTalentSearch')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = document.querySelector('#homeJobSearch')?.value.trim() || '';
    const destination = `./talent.html${query ? `?q=${encodeURIComponent(query)}` : ''}`;
    window.location.assign(await isEmployerSignedIn() ? destination : employerLoginUrl(destination));
  });

  window.getVerifiedEmployer?.().then((user) => {
    if (!user) return;
    document.querySelector('.candidate-login-link')?.setAttribute('href', './talent.html');
    const accountLink = document.querySelector('.candidate-login-link');
    if (accountLink) accountLink.textContent = 'Employer dashboard';
  });
})();
