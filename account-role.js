(async () => {
  const candidate = await window.getVerifiedCandidate?.();
  if (!candidate) return;

  document.documentElement.dataset.accountRole = 'candidate';
  document.querySelectorAll('[data-employer-link]').forEach((link) => { link.hidden = true; });
  document.querySelectorAll('[data-candidate-auth-link]').forEach((link) => {
    link.textContent = 'My account →';
    link.href = './candidate-dashboard.html';
  });

  if (!document.body.classList.contains('employer-only')) return;
  const main = document.querySelector('main');
  if (!main) return;
  main.className = 'candidate-access-shell';
  main.innerHTML = '<section class="candidate-access-card"><span aria-hidden="true">✓</span><p class="simple-kicker">ASSISTANT ACCOUNT</p><h1>This account cannot post jobs.</h1><p>You are signed in with an assistant account. Assistants can browse roles, upload a resume, and apply, but they cannot use the hirer workspace.</p><div><a class="primary-button" href="./jobs.html">Browse jobs <span>→</span></a><button id="candidateAccessSignOut" type="button">Sign out</button></div></section>';
  document.querySelector('#candidateAccessSignOut')?.addEventListener('click', async () => {
    await window.savaAuth.auth.signOut();
    window.location.reload();
  });
})();
