// Home hero search: describe the talent you need and see matching VA profiles instantly.
(() => {
  const form = document.querySelector('#homeTalentSearch');
  const box = document.querySelector('#homeJobSearch');
  const results = document.querySelector('#homeResults');
  if (!form || !box || !results) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const examples = [
    'I need a full-time bookkeeper who is QuickBooks certified.',
    'I need a social media manager.',
    'I need a part-time social media manager with experience in video editing.',
    'I need an executive assistant who can handle lots of different tasks inside of my business and grow with my company.',
    'I need a qualified appointment setter who can call my leads and book sales appointments on my calendar.',
  ];
  const stop = new Set(['the', 'and', 'for', 'who', 'with', 'that', 'can', 'need', 'looking', 'someone', 'help', 'want', 'our', 'my', 'me', 'to', 'of', 'in', 'on', 'an', 'a', 'is', 'be', 'will', 'work', 'hours', 'hour', 'week', 'per', 'time', 'full', 'part', 'remote', 'from', 'south', 'africa', 'african', 'good', 'great', 'experience', 'experienced', 'person', 'also', 'like', 'know', 'knows', 'certified', 'qualified', 'lots', 'different', 'tasks', 'inside', 'business', 'grow', 'company', 'handle', 'into', 'who', 'is', 'are', 'it', 'i']);
  const synonyms = { setter: 'appointment setter', leads: 'appointment setter', ea: 'executive assistant', va: 'assistant', admin: 'administrative assistant', bookkeeping: 'bookkeeper', accounting: 'bookkeeper', cs: 'customer support', support: 'customer support', legal: 'paralegal', social: 'social media', editing: 'video editor', editor: 'video editor', sales: 'sales', calls: 'appointment setter' };
  let profiles = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Typing placeholder, like a person describing who they need.
  let example = 0, chars = 0, deleting = false, typingTimer;
  function typePlaceholder() {
    if (document.activeElement === box || box.value) { typingTimer = setTimeout(typePlaceholder, 600); return; }
    const text = examples[example];
    chars += deleting ? -1 : 1;
    box.placeholder = text.slice(0, chars);
    let wait = deleting ? 22 : 45;
    if (!deleting && chars >= text.length) { deleting = true; wait = 1800; }
    if (deleting && chars <= 0) { deleting = false; example = (example + 1) % examples.length; wait = 300; }
    typingTimer = setTimeout(typePlaceholder, wait);
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) typePlaceholder();

  async function loadProfiles() {
    if (profiles) return profiles;
    // Localhost preview uses the sample profiles in local-preview/ (not published).
    if (!local) return (profiles = []);
    try { profiles = await (await fetch('./local-preview/demo-candidates.json')).json(); } catch { profiles = []; }
    return profiles;
  }
  function terms(query) {
    const words = query.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, ' ').split(/\s+/).filter(Boolean);
    const expanded = words.flatMap(word => synonyms[word] ? synonyms[word].split(' ') : [word]);
    return [...new Set(expanded.filter(word => word.length > 1 && !stop.has(word)))];
  }
  function score(person, list) {
    const fields = [
      [person.primaryRole, 6], [(person.idealJobTitles || []).join(' '), 4], [(person.skills || []).join(' '), 3],
      [(person.software || []).join(' '), 3], [(person.industries || []).join(' '), 2], [(person.searchSummary || '') + ' ' + (person.summary || ''), 1],
    ];
    return list.reduce((total, term) => {
      const stem = term.length > 5 ? term.slice(0, 5) : term;
      return total + fields.reduce((sum, [text, weight]) => sum + (String(text || '').toLowerCase().split(/[^a-z0-9+#.]+/).some(word => word.startsWith(stem)) ? weight : 0), 0);
    }, 0);
  }
  function rate(person) {
    const min = Number(person.requestedRateMinUsd), max = Number(person.requestedRateMaxUsd);
    return min > 0 ? '$' + min + (max > min ? '–$' + max : '') + '/hr' : '';
  }
  function card(person, index) {
    const [first, ...rest] = String(person.name || 'VA').split(/\s+/);
    const name = first + (rest.length ? ' ' + rest[rest.length - 1][0] + '.' : '');
    const initials = (first[0] + (rest.length ? rest[rest.length - 1][0] : '')).toUpperCase();
    const years = Number(person.relevantYears) ? Math.floor(person.relevantYears) + ' yrs experience' : '';
    const hours = Number(person.availableHoursPerWeek) ? person.availableHoursPerWeek + ' hrs/week' : '';
    const link = local ? './candidate-public-profile.html?demo=' + encodeURIComponent(person.id) : './talent.html?q=' + encodeURIComponent(person.primaryRole || '');
    return `<article class="hl-match" style="--delay:${index * 90}ms">
      <div class="hl-match-top"><span class="hl-match-avatar c${index % 4}">${escape(initials)}</span><div><h3>${escape(name)}</h3><p>${escape(person.primaryRole)}</p></div>${person.verified ? '<span class="hl-vetted">✓ Vetted</span>' : ''}</div>
      <div class="hl-match-facts">${[rate(person), years, hours].filter(Boolean).map(item => '<span>' + escape(item) + '</span>').join('')}</div>
      <p class="hl-match-summary">${escape(person.searchSummary || '')}</p>
      <div class="hl-match-skills">${(person.skills || []).slice(0, 3).map(skill => '<span>' + escape(skill) + '</span>').join('')}</div>
      <a class="hl-match-link" href="${escape(link)}"${local ? ' target="_blank" rel="noopener"' : ' data-employer-auth'}>View profile <span aria-hidden="true">→</span></a>
    </article>`;
  }
  async function search(query) {
    query = query.trim();
    if (!query) { box.focus(); return; }
    const destination = './talent.html?q=' + encodeURIComponent(query.slice(0, 100));
    const people = await loadProfiles();
    if (!people.length) { window.savaHomeOpenAsEmployer?.(destination); return; }
    const list = terms(query);
    let ranked = people.map(person => ({ person, points: score(person, list) })).filter(item => item.points > 0).sort((a, b) => b.points - a.points);
    if (ranked.length) ranked = ranked.filter(item => item.points >= ranked[0].points * 0.45);
    const exact = ranked.length > 0;
    if (!exact) ranked = people.filter(person => /assistant/i.test(person.primaryRole)).map(person => ({ person }));
    const top = ranked.slice(0, 3).map(item => item.person);
    results.hidden = false;
    results.innerHTML = `<div class="hl-results-head"><div><b>${exact ? 'Top matches for you' : 'No exact match yet. Popular assistants:'}</b><span>“${escape(query.length > 80 ? query.slice(0, 80) + '…' : query)}”</span></div><button type="button" class="hl-results-close" data-close-results aria-label="Close results">×</button></div>
      <div class="hl-matches" style="--n:${top.length}">${top.map(card).join('')}</div>
      <div class="hl-results-foot"><p>${exact && ranked.length > 3 ? 'Plus ' + (ranked.length - 3) + ' more matching VAs.' : 'See every matching VA and message them.'} It's free to sign up.</p><a class="hl-btn primary" data-employer-auth href="${escape(destination)}">See all matches <span aria-hidden="true">→</span></a></div>`;
    results.querySelectorAll('[data-employer-auth]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); window.savaHomeOpenAsEmployer?.(link.getAttribute('href')); }));
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  form.addEventListener('submit', event => { event.preventDefault(); search(box.value); });
  box.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); search(box.value); } });
  document.querySelectorAll('[data-home-chip]').forEach(chip => chip.addEventListener('click', () => { box.value = chip.dataset.homeChip; search(box.value); }));
  results.addEventListener('click', event => { if (event.target.closest('[data-close-results]')) { results.hidden = true; results.innerHTML = ''; } });
  document.querySelectorAll('[data-focus-search]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => box.focus(), 400); }));
  document.querySelector('[data-final-search]')?.addEventListener('submit', event => {
    event.preventDefault();
    const value = event.currentTarget.querySelector('input').value.trim();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!value) { setTimeout(() => box.focus(), 400); return; }
    box.value = value;
    setTimeout(() => search(value), 350);
  });
  const initial = new URLSearchParams(location.search).get('q');
  if (initial) { box.value = initial; search(initial); }
})();
