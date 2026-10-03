(() => {
  const employerLoginUrl = (destination) => `./employer-login.html?next=${encodeURIComponent(destination)}`;

  async function isEmployerSignedIn() {
    const user = await window.getVerifiedEmployer?.();
    return Boolean(user);
  }

  window.savaHomeOpenAsEmployer = async (destination) => window.location.assign(await isEmployerSignedIn() ? destination : employerLoginUrl(destination));

  document.querySelectorAll('[data-employer-auth]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const destination = link.getAttribute('href') || './talent.html';
      window.location.assign(await isEmployerSignedIn() ? destination : employerLoginUrl(destination));
    });
  });

  window.getVerifiedEmployer?.().then((user) => {
    if (!user) return;
    const accountLink = document.querySelector('.hl-employer-login');
    if (!accountLink) return;
    accountLink.setAttribute('href', './talent.html');
    accountLink.textContent = 'Dashboard';
  });
})();
