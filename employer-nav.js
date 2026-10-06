// One header for every hirer page: the same four buttons on the right, master-only tools in the middle.
(function employerNav() {
  const header = document.querySelector('header.simple-header, header.admin-header');
  if (!header) return;
  const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const postingSteps = ['index.html', 'compensation.html', 'job-description.html', 'review.html', 'promote.html', 'published.html'];
  const links = [
    { href: './talent.html', label: 'Search talent', pages: ['talent.html'] },
    { href: './inbox.html', label: 'Messages', pages: ['inbox.html', 'applicants.html'] },
    { href: './posted-jobs.html', label: 'Posted jobs', pages: ['posted-jobs.html'] },
  ];
  const internal = [
    { href: './admin-onboarding.html', label: 'Onboarding progress' },
    { href: './admin-resumes.html', label: 'Resume database' },
    { href: './admin-review.html', label: 'Candidate approvals' },
  ];
  const current = (pages) => (pages.includes(page) ? ' class="active" aria-current="page"' : '');

  const accountMenu = header.querySelector('.sava-account-menu');
  header.querySelectorAll(':scope > nav, :scope > .header-actions').forEach((element) => element.remove());
  header.classList.add('hfsa-header');
  header.insertAdjacentHTML('beforeend', `
    <nav class="hfsa-internal" aria-label="Master tools" hidden>${internal.map((link) => `<a href="${link.href}"${current([link.href.slice(2)])}>${link.label}</a>`).join('')}</nav>
    <div class="header-actions hfsa-actions">
      <nav class="hfsa-nav" aria-label="Hirer menu">
        ${links.map((link) => `<a href="${link.href}"${current(link.pages)}>${link.label}</a>`).join('')}
      </nav>
      <a class="hfsa-post${postingSteps.includes(page) ? ' active' : ''}" href="./index.html" data-new-job>Post a job</a>
    </div>`);
  if (accountMenu) header.querySelector('.hfsa-actions').append(accountMenu);

  // "Post a job" from the menu always starts a blank draft, except when already inside the posting steps.
  header.querySelector('.hfsa-post').addEventListener('click', () => {
    if (postingSteps.includes(page) && page !== 'published.html') return;
    try { localStorage.removeItem('ea-hiring-role'); } catch { /* storage unavailable */ }
  });

  // Master tools show only for master reviewer accounts.
  const showInternal = (user) => {
    const isMaster = Boolean(user?.app_metadata?.master || user?.app_metadata?.can_review);
    header.querySelector('.hfsa-internal').hidden = !isMaster;
  };
  const check = () => {
    if (typeof window.getVerifiedEmployer !== 'function') return;
    window.getVerifiedEmployer().then(showInternal).catch(() => {});
  };
  if (document.readyState === 'complete') check();
  else window.addEventListener('load', check);
}());
