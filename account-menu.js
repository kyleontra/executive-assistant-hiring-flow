(() => {
  if (window.savaAccountContinuityMounted) return;
  window.savaAccountContinuityMounted = true;

  let currentMenu = null;

  function escapeAccount(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function accountRole(user) {
    return user?.app_metadata?.account_role === 'employer' ? 'employer' : 'candidate';
  }

  function accountName(user) {
    const firstName = String(user?.user_metadata?.first_name || '').trim();
    const lastName = String(user?.user_metadata?.last_name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;
    if (accountRole(user) === 'employer') return String(user?.user_metadata?.company_name || '').trim() || 'Employer account';
    return String(user?.email || '').split('@')[0] || 'My account';
  }

  function accountInitials(user) {
    return accountName(user).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SA';
  }

  function accountLinks(role) {
    if (role === 'employer') {
      return '<a href="./employer-profile.html">My Profile</a><a href="./employees.html">My Employees</a><a href="./billing.html">Billing</a>';
    }
    if (document.body.classList.contains('va-dashboard-page')) {
      return '<a href="./candidate-dashboard.html?tab=profile">My Profile</a><a href="./candidate-dashboard.html?tab=payments">Payments</a><a href="./candidate-dashboard.html?tab=settings">Settings</a><a href="./candidate-dashboard.html?tab=help">Help</a>';
    }
    return '<a href="./candidate-dashboard.html?tab=messages">Messages</a><a href="./candidate-dashboard.html?tab=applications">Applications</a><a href="./candidate-dashboard.html?tab=profile">My Profile</a><a href="./candidate-dashboard.html?tab=jobs">Apply for Jobs</a><a href="./candidate-dashboard.html?tab=payments">Payments</a><a href="./candidate-dashboard.html?tab=settings">Settings</a><a href="./candidate-dashboard.html?tab=help">Help</a>';
  }

  function setAccountPhoto(value) {
    if (!currentMenu) return;
    let photo = '';
    try {
      if (/^data:image\/(png|jpe?g|webp);base64,/.test(String(value))) photo = String(value);
      else {
        const url = new URL(value);
        if (['https:', 'http:'].includes(url.protocol)) photo = url.href;
      }
    } catch {}
    currentMenu.querySelectorAll('[data-account-avatar]').forEach((avatar) => {
      avatar.replaceChildren();
      if (photo) {
        const image = document.createElement('img');
        image.src = photo;
        image.alt = '';
        // Keep the photo small even if the menu stylesheet fails to load.
        image.width = avatar.closest('.sava-account-trigger') ? 40 : 42;
        image.height = image.width;
        avatar.append(image);
      } else {
        avatar.textContent = avatar.dataset.initials || 'SA';
      }
    });
  }

  function closeMenu() {
    if (!currentMenu) return;
    currentMenu.querySelector('.sava-account-panel').hidden = true;
    currentMenu.querySelector('.sava-account-trigger').setAttribute('aria-expanded', 'false');
  }

  function headerHost() {
    const header = document.querySelector('body > header, header');
    if (!header) return document.body;
    return header.querySelector('.header-actions')
      || header.querySelector('.dashboard-actions')
      || header.querySelector('nav')
      || header;
  }

  function renderAccount(user) {
    document.querySelectorAll('.sava-account-menu').forEach((menu) => menu.remove());
    document.querySelectorAll('[data-sava-hidden-auth]').forEach((element) => {
      element.hidden = false;
      delete element.dataset.savaHiddenAuth;
    });
    currentMenu = null;
    document.documentElement.dataset.authState = user ? 'signed-in' : 'signed-out';
    if (!user) return;

    const role = accountRole(user);
    const loginSelector = role === 'employer' ? 'a[href^="./employer-login.html"]' : 'a[href^="./candidate-login.html"]';
    document.querySelectorAll(loginSelector).forEach((link) => {
      link.hidden = true;
      link.dataset.savaHiddenAuth = 'true';
    });
    const name = accountName(user);
    const menu = document.createElement('div');
    menu.className = `sava-account-menu${headerHost() === document.body ? ' sava-account-floating' : ''}`;
    const initials = accountInitials(user);
    menu.innerHTML = `<button class="sava-account-trigger" type="button" aria-label="Open account menu for ${escapeAccount(name)}" aria-haspopup="menu" aria-expanded="false"><span data-account-avatar data-initials="${escapeAccount(initials)}">${escapeAccount(initials)}</span></button><section class="sava-account-panel" role="menu" hidden><header><span class="sava-account-panel-avatar" data-account-avatar data-initials="${escapeAccount(initials)}">${escapeAccount(initials)}</span><div><b>${escapeAccount(name)}</b><em>${role === 'employer' ? 'Employer account' : 'Candidate account'}</em></div></header><div class="sava-account-links">${accountLinks(role)}</div><button class="sava-account-signout" type="button">Sign out</button></section>`;
    headerHost().append(menu);
    if (user.app_metadata?.can_review && !document.body.classList.contains('va-dashboard-page')) menu.querySelector('.sava-account-links').insertAdjacentHTML('afterend', '<div class="sava-account-admin"><p>Master account</p><a href="./admin-review.html">Candidate approvals</a><a href="./admin-resumes.html">Resume database</a></div>');
    currentMenu = menu;
    // Example build: an employer's photo from My Profile is stored in this browser until the backend saves it.
    let savedEmployerPhoto = '';
    if (role === 'employer') { try { savedEmployerPhoto = JSON.parse(localStorage.getItem('hirefromsa:employer-profile') || '{}').photo || ''; } catch { /* ignore */ } }
    setAccountPhoto(window.savaPendingAccountPhoto || savedEmployerPhoto);

    const trigger = menu.querySelector('.sava-account-trigger');
    const panel = menu.querySelector('.sava-account-panel');
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = panel.hidden;
      closeMenu();
      panel.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
    });
    panel.addEventListener('click', (event) => event.stopPropagation());
    if (document.body.classList.contains('va-dashboard-page')) {
      menu.querySelectorAll('a[href*="candidate-dashboard.html?tab="]').forEach((link) => link.addEventListener('click', (event) => {
        if (!window.savaOpenDashboardTab) return;
        event.preventDefault();
        window.savaOpenDashboardTab(new URL(link.href).searchParams.get('tab'));
        closeMenu();
      }));
    }
    menu.querySelector('.sava-account-signout').addEventListener('click', async () => {
      const signoutButton = menu.querySelector('.sava-account-signout');
      signoutButton.disabled = true;
      signoutButton.textContent = 'Signing out…';
      try { await window.signOutAccount(); }
      catch { signoutButton.disabled = false; signoutButton.textContent = 'Sign-out failed. Try again'; return; }
      window.location.assign('./home.html');
    });
  }

  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  window.savaSetAccountPhoto = setAccountPhoto;

  if (window.savaAccountPreviewUser) {
    renderAccount(window.savaAccountPreviewUser);
    return;
  }

  window.getVerifiedUser().then(renderAccount).catch(() => renderAccount(null));
  window.savaAuth.auth.onAuthStateChange((_event, session) => {
    if (!window.masterSessionToken?.()) renderAccount(session?.user || null);
  });
})();
