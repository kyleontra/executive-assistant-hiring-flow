// Search talent v2: one box for keywords or a plain-English sentence, ranked results with the reasons each person matched.
const stForm = document.querySelector('#stForm');
const stQuery = document.querySelector('#stQuery');
const stResults = document.querySelector('#stResults');
const stStatus = document.querySelector('#stStatus');
const stSort = document.querySelector('#stSort');
const stDemo = ['localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).has('demo');
const stState = { candidates: [], results: [], query: '', understood: null };

window.getVerifiedEmployer?.().then((user) => {
  const isMasterReviewer = Boolean(user?.app_metadata?.master && user?.app_metadata?.can_review);
  document.querySelectorAll('[data-master-resume]').forEach((link) => { link.hidden = !isMasterReviewer; });
}).catch(() => {});

function stEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
function stInitials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SA';
}

// ---- Query understanding -------------------------------------------------
const ST_STOP = new Set('a an and any are as at be been but by can could do does for from get good great has have help hire hiring i im in into is it its just know like looking me my need needs of on or our person people someone somebody something strong that the their them they this to us we who will with work would years year yrs yr experience experienced least plus more than also very really can\'t able candidate candidates va virtual managing manage manages handle handling answer answering doing done want wants find give make using use used available hour hours time worked working works directly direct before previously ever alongside closely'.split(' '));
// Related words: searching the key also looks for these (counted a little lower than an exact hit).
const ST_RELATED = {
  spreadsheet: ['excel', 'google sheets'], spreadsheets: ['excel', 'google sheets'], sheets: ['google sheets', 'excel'],
  bookkeeping: ['quickbooks', 'xero', 'accounts payable', 'reconciliations'], bookkeeper: ['bookkeeping', 'quickbooks', 'xero'], accounting: ['bookkeeping', 'quickbooks', 'xero'], books: ['bookkeeping', 'quickbooks'], invoicing: ['invoices', 'accounts receivable'],
  legal: ['paralegal', 'legal research', 'clio', 'law firm'], lawyer: ['paralegal', 'legal research', 'law firm'], attorney: ['paralegal', 'law firm'], law: ['paralegal', 'law firm', 'legal research'],
  ceo: ['ceo support', 'chief executive', 'founder', 'managing partner', 'chief of staff'], founder: ['ceo', 'founders'], founders: ['ceo', 'founder'], executive: ['executive assistant', 'ceo support', 'chief of staff'], executives: ['executive assistant', 'ceo support'], boss: ['ceo support', 'executive assistant'],
  calendar: ['calendar management', 'scheduling'], scheduling: ['calendar management', 'appointment setting'], inbox: ['inbox management', 'email management'], email: ['inbox management', 'email management'],
  rep: ['sales representative', 'sales'], reps: ['sales representative', 'sales'], sdr: ['sales', 'appointment setting', 'lead generation'],
  crm: ['hubspot', 'salesforce', 'gohighlevel'], sales: ['cold calling', 'lead generation', 'appointment setting', 'sdr'], calls: ['cold calling', 'phone support'], phone: ['phone support', 'cold calling'], leads: ['lead generation'], appointments: ['appointment setting'],
  support: ['customer support', 'zendesk', 'live chat'], customer: ['customer support', 'customer service'], tickets: ['zendesk', 'customer support'], chat: ['live chat'],
  video: ['video editing', 'premiere pro', 'davinci resolve'], editor: ['video editing', 'premiere pro'], editing: ['video editing', 'premiere pro'], weddings: ['wedding films'], wedding: ['wedding films'],
  social: ['social media', 'instagram', 'tiktok'], instagram: ['social media'], tiktok: ['social media', 'short-form video'], content: ['social media', 'copywriting', 'canva'],
  design: ['canva', 'figma', 'graphic design'], designer: ['graphic design', 'canva', 'figma'], logo: ['graphic design'],
  ecommerce: ['shopify', 'e-commerce', 'order management'], shopify: ['e-commerce'], store: ['shopify', 'e-commerce'],
  medical: ['medical billing', 'healthcare', 'insurance verification'], healthcare: ['medical billing', 'insurance verification'], billing: ['medical billing', 'invoices'],
  property: ['real estate', 'property management'], realtor: ['real estate'], estate: ['real estate'],
  data: ['data entry', 'excel'], typing: ['data entry'],
  project: ['project management', 'asana', 'clickup'], operations: ['operations', 'sops', 'project management'], sop: ['sops'], sops: ['process documentation'],
  website: ['wordpress', 'shopify', 'web design'], wordpress: ['web design'],
  recruiting: ['recruitment', 'sourcing', 'linkedin recruiter'], recruiter: ['recruitment', 'sourcing'],
  writing: ['copywriting', 'blog writing'], copywriter: ['copywriting'], seo: ['blog writing', 'wordpress'],
  american: ['us hours'], eastern: ['us hours'], est: ['us hours'], pst: ['us hours'], cst: ['us hours'], overnight: ['us hours'], night: ['us hours'],
};
// Preferences boost ranking but never decide on their own who shows up.
const ST_PREFERENCES = new Set(['us hours']);
const ST_PHRASES = ['legal research', 'google sheets', 'customer support', 'customer service', 'real estate', 'social media', 'lead generation', 'cold calling', 'appointment setting', 'data entry', 'video editing', 'graphic design', 'calendar management', 'inbox management', 'medical billing', 'project management', 'executive assistant', 'us hours', 'premiere pro', 'davinci resolve', 'accounts payable', 'accounts receivable', 'live chat', 'property management', 'wedding films', 'web design', 'blog writing', 'insurance verification', 'short-form video', 'phone support', 'order management', 'process documentation'];

function stStem(word) { return word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word; }

function stUnderstand(raw) {
  let text = ` ${String(raw || '').toLowerCase().replace(/[^a-z0-9+\-\s]/g, ' ').replace(/\s+/g, ' ')} `;
  const yearsMatch = text.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/);
  const minYears = yearsMatch ? Number(yearsMatch[1]) : 0;
  if (yearsMatch) text = text.replace(yearsMatch[0], ' ');
  const terms = [];
  const labels = {};
  const usHours = /\b(us|u s|american|eastern|est|pst|cst)\s*(hours|time|shift|shifts|timezone|time zone)\b/;
  if (usHours.test(text)) { terms.push('us hours'); text = text.replace(new RegExp(usHours.source, 'g'), ' '); }
  ST_PHRASES.forEach((phrase) => {
    if (text.includes(` ${phrase} `)) { terms.push(phrase); text = text.replace(` ${phrase} `, ' '); }
  });
  text.split(' ').filter(Boolean).forEach((word) => {
    if (ST_STOP.has(word) || word.length < 2 || /^\d+$/.test(word)) return;
    const term = ST_RELATED[word] ? word : stStem(word);
    if (!terms.includes(term)) { terms.push(term); labels[term] = word; }
  });
  return { terms, minYears, labels };
}

// ---- Matching ------------------------------------------------------------
function stHas(haystack, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Short words must match a whole word ("rep" is not "reporting"); longer ones may continue ("quickbook" finds "QuickBooks").
  const pattern = term.length < 5 && !term.includes(' ') ? `(^|[^a-z0-9])${escaped}s?([^a-z0-9]|$)` : `(^|[^a-z0-9])${escaped}`;
  return new RegExp(pattern, 'i').test(haystack);
}

function stScore(candidate, understood) {
  const fields = [
    ['title', [candidate.primaryRole, ...(candidate.jobTitles || [])], 5],
    ['skills', candidate.skills || [], 3],
    ['software', candidate.software || [], 3],
    ['industries', candidate.industries || [], 2],
    ['hours', [candidate.hours || ''], 2],
    ['summary', [candidate.summary || ''], 1],
  ];
  let score = 0;
  let groupsHit = 0;
  let quality = 0;
  let coreHit = false;
  const hits = new Set();
  understood.terms.forEach((term) => {
    const variants = [[term, 1], ...(ST_RELATED[term] || []).map((related) => [related, 0.7])];
    let best = 0;
    let exact = false;
    variants.forEach(([variant, weight]) => {
      fields.forEach(([name, values, fieldWeight]) => {
        values.forEach((value) => {
          if (!value || !stHas(value, variant)) return;
          if (weight === 1 && name !== 'summary') exact = true;
          best = Math.max(best, fieldWeight * weight);
          if (name !== 'summary') hits.add(value); else hits.add(variant);
        });
      });
    });
    if (best > 0) { groupsHit += 1; quality += exact ? 1 : 0.75; if (!ST_PREFERENCES.has(term)) coreHit = true; }
    score += best;
  });
  return { score, groupsHit, quality, coreHit, hits: [...hits] };
}

function stRank(understood) {
  const hasTerms = understood.terms.length > 0;
  return stState.candidates
    .filter((candidate) => !understood.minYears || candidate.relevantYears >= understood.minYears)
    .map((candidate) => {
      if (!hasTerms) return { candidate, match: 0, hits: [] };
      const { score, quality, coreHit, hits } = stScore(candidate, understood);
      const hasCoreTerms = understood.terms.some((term) => !ST_PREFERENCES.has(term));
      if (!score || (hasCoreTerms && !coreHit)) return null;
      // Direct hits count fully, related-word hits count less, missing terms count nothing.
      const match = Math.min(99, Math.round(50 + (quality / understood.terms.length) * 45 + Math.min(4, score / 4)));
      return { candidate, match, hits };
    })
    .filter(Boolean);
}

// ---- Rendering -----------------------------------------------------------
// Green = strong match, gray = partial, red = weak.
function stPillClass(match) { return match >= 80 ? '' : match >= 60 ? 'mid' : 'low'; }

function stRender() {
  const sorted = [...stState.results].sort((a, b) => {
    if (stSort.value === 'years') return b.candidate.relevantYears - a.candidate.relevantYears;
    if (stSort.value === 'az') return a.candidate.name.localeCompare(b.candidate.name);
    return b.match - a.match || b.candidate.relevantYears - a.candidate.relevantYears;
  });
  const searching = Boolean(stState.query);
  document.querySelector('#stTitle').textContent = searching ? `Results for "${stState.query}"` : 'All candidates';
  document.querySelector('#stSummary').textContent = `${sorted.length} ${sorted.length === 1 ? 'candidate' : 'candidates'}${searching ? ' matched' : ' available'}`;
  document.querySelector('#stClear').hidden = !searching;


  if (!sorted.length) {
    stResults.innerHTML = `<div class="st-empty"><h3>No exact matches yet</h3><p>Try fewer words, a broader role, or a tool like "Excel" or "QuickBooks".</p></div>`;
    return;
  }
  stResults.innerHTML = sorted.map(({ candidate, match, hits }, index) => {
    const tags = [...new Set([...(candidate.skills || []), ...(candidate.software || [])])].slice(0, 8);
    const hitSet = new Set(hits.map((hit) => hit.toLowerCase()));
    const avatar = candidate.photoUrl ? `<img src="${stEscape(candidate.photoUrl)}" alt="" />` : stEscape(stInitials(candidate.name));
    const name = candidate.profileUrl
      ? `<a class="st-name" href="${stEscape(candidate.profileUrl)}" target="_blank" rel="noopener">${stEscape(candidate.name)}</a>`
      : `<span class="st-name">${stEscape(candidate.name)}</span>`;
    const why = searching && hits.length ? `<p class="st-why">Matched on <b>${[...hits].sort((a, b) => a.length - b.length).slice(0, 3).map(stEscape).join(', ')}</b></p>` : '';
    return `<article class="st-card" style="--i:${Math.min(index, 8)}">
      <span class="st-avatar" aria-hidden="true">${avatar}</span>
      <div>
        <div class="st-name-row">${name}${searching ? `<span class="st-pill ${stPillClass(match)}">${stDemo ? `${match}% match` : 'Relevant experience'}</span>` : ''}</div>
        <p class="st-role">${stEscape(candidate.primaryRole)} · ${candidate.relevantYears} ${candidate.relevantYears === 1 ? 'year' : 'years'} relevant${candidate.hours ? ` · ${stEscape(candidate.hours)}` : ''}</p>
        <p class="st-summary">${stEscape(candidate.summary)}</p>
        <div class="st-tags">${tags.map((tag) => `<span class="${hitSet.has(tag.toLowerCase()) ? 'hit' : ''}">${stEscape(tag)}</span>`).join('')}</div>
        ${why}
      </div>
      ${candidate.profileUrl ? `<a class="st-view" href="${stEscape(candidate.profileUrl)}" target="_blank" rel="noopener">View profile</a>` : ''}
    </article>`;
  }).join('');
}

// ---- Data ------------------------------------------------------------------
async function stDemoCandidates() {
  // Same 20 sample people the profile page opens on localhost (local-preview/ is never deployed).
  const people = await (await fetch('./local-preview/demo-candidates.json')).json();
  return people.map((person) => ({
    id: person.id, name: person.name, primaryRole: person.primaryRole, relevantYears: person.relevantYears, hours: person.hours,
    summary: person.searchSummary || person.summary, skills: person.skills, software: person.software, industries: person.industries,
    jobTitles: [...(person.idealJobTitles || []), ...(person.experience || []).map((entry) => entry.jobTitle)],
    profileUrl: `./candidate-public-profile.html?demo=${person.id}`,
  }));
}

function stFromLive(candidate) {
  return {
    id: candidate.id,
    name: candidate.name || 'Candidate',
    primaryRole: candidate.primaryRole || 'Remote professional',
    relevantYears: Math.floor(Number(candidate.relevantYears || 0)),
    hours: '',
    summary: candidate.summary || '',
    skills: candidate.skills || [],
    software: candidate.software || [],
    industries: candidate.industries || [],
    jobTitles: candidate.jobTitles || [],
    photoUrl: candidate.photoUrl || '',
    profileUrl: /^[0-9a-f]{32}$/.test(candidate.shareSlug || '') ? `./candidate-public-profile.html?profile=${candidate.shareSlug}` : '',
  };
}

let stSearchRun = 0;
// Live results are already chosen by the AI search; the demo ranks its sample people here.
function stResultsFor(understood) {
  if (stDemo || !stState.query) return stRank(understood);
  const terms = understood || { terms: [], minYears: 0 };
  return stState.candidates.map((candidate) => { const scored = stScore(candidate, terms); return { candidate, match: scored.score, hits: scored.hits }; });
}
const stWait = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });
const stCalm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stThink = document.querySelector('#stThink');
const stThinkLines = document.querySelector('#stThinkLines');
const stThinkHead = document.querySelector('#stThinkHead');
const ST_SAY = { ceo: 'CEO', crm: 'CRM', sdr: 'SDR', seo: 'SEO', sop: 'SOPs', sops: 'SOPs', 'us hours': 'U.S. hours', excel: 'Excel', quickbook: 'QuickBooks', quickbooks: 'QuickBooks', shopify: 'Shopify', canva: 'Canva', hubspot: 'HubSpot', xero: 'Xero' };
const stCaps = (text) => String(text).replace(/\b(ceo|crm|sdr|seo|sops?)\b/g, (word) => word.toUpperCase()).replace(/\bSOPS\b/, 'SOPs');
const stSay = (understood, term) => ST_SAY[term] || stCaps(understood.labels?.[term] || term);
const stList = (items) => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

stThinkHead.addEventListener('click', () => {
  if (stThink.classList.contains('working')) return;
  const open = stThinkHead.getAttribute('aria-expanded') !== 'true';
  stThinkHead.setAttribute('aria-expanded', String(open));
});

// Writes one thought out like it is being typed, then marks it done when the next one starts.
async function stThought(run, text) {
  if (run !== stSearchRun) return;
  stThinkLines.querySelector('li.active')?.classList.replace('active', 'done');
  const line = document.createElement('li');
  line.className = 'active';
  line.innerHTML = '<span class="st-tick" aria-hidden="true"></span><span class="st-text"></span>';
  stThinkLines.append(line);
  const out = line.querySelector('.st-text');
  if (stCalm) out.textContent = text;
  else for (let index = 1; index <= text.length; index += 3) {
    if (run !== stSearchRun) return;
    out.textContent = text.slice(0, index);
    await stWait(14);
  }
  out.textContent = text;
  await stWait(stCalm ? 200 : 380);
}

// Narrates the real steps of the search, using real counts from the profiles it is ranking.
async function stThinkThrough(run, loading) {
  const started = performance.now();
  stThinkLines.innerHTML = '';
  stThink.hidden = false;
  stThink.classList.add('working');
  stThinkHead.setAttribute('aria-expanded', 'true');
  document.querySelector('#stThinkTitle').textContent = 'Thinking';

  await stThought(run, 'Reading what you are looking for');
  if (!stDemo) await stThought(run, 'Understanding your request with AI');
  await loading;
  if (run !== stSearchRun) return;
  const understood = stState.understood || { terms: [], minYears: 0 };
  const core = understood.terms.filter((term) => !ST_PREFERENCES.has(term));
  const wantsHours = understood.terms.some((term) => ST_PREFERENCES.has(term));
  const named = core.slice(0, 3).map((term) => stSay(understood, term));
  if (understood.description) await stThought(run, `Looking for: ${understood.description.length > 150 ? `${understood.description.slice(0, 147).trim()}…` : understood.description}`);
  if (understood.minYears && named.length) await stThought(run, `Gathering resumes with ${understood.minYears}+ years of ${named[0]} experience`);
  else if (named.length) await stThought(run, `Gathering resumes that mention ${stList(named)}`);
  else await stThought(run, 'Gathering resumes');
  const pool = stState.candidates;
  await stThought(run, `Reviewing ${pool.length} candidate ${pool.length === 1 ? 'profile' : 'profiles'}`);
  for (const term of core.slice(0, 3)) {
    const found = pool.filter((candidate) => stScore(candidate, { terms: [term] }).score > 0).length;
    await stThought(run, found
      ? `${found} ${found === 1 ? 'has' : 'have'} ${stSay(understood, term)} in their job titles, skills or tools`
      : `No one lists ${stSay(understood, term)} directly, so checking related experience`);
  }
  const related = core.flatMap((term) => ST_RELATED[term] || []).filter((word, index, all) => all.indexOf(word) === index && !core.some((term) => word.includes(term)) && word !== 'chief executive').slice(0, 2);
  if (related.length) await stThought(run, `Also counting related experience like ${stList(related.map((word) => ST_SAY[word] || stCaps(word)))}`);
  if (understood.minYears) {
    const seasoned = pool.filter((candidate) => candidate.relevantYears >= understood.minYears).length;
    await stThought(run, `${seasoned} ${seasoned === 1 ? 'has' : 'have'} ${understood.minYears}+ years of relevant experience`);
  }
  if (wantsHours) await stThought(run, 'Favoring people who can work U.S. hours');
  await stThought(run, 'Comparing past roles and industries with what you need');
  stState.results = stResultsFor(understood);
  const count = stState.results.length;
  await stThought(run, count ? `Ranking your ${count === 1 ? 'best match' : `${count} best matches`}` : 'No strong matches found, a broader search may help');

  if (run !== stSearchRun) return;
  stThinkLines.querySelector('li.active')?.classList.replace('active', 'done');
  stThink.classList.remove('working');
  document.querySelector('#stThinkTitle').textContent = `Thought for ${Math.max(1, Math.round((performance.now() - started) / 1000))}s`;
  stThinkHead.setAttribute('aria-expanded', 'false');
}

async function stSearch(raw) {
  const query = String(raw || '').trim();
  const run = ++stSearchRun;
  stQuery.value = query;
  const url = new URL(window.location.href);
  if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
  window.history.replaceState({}, '', url);
  stState.query = query;
  stState.understood = stDemo || !query ? stUnderstand(query) : null;
  stStatus.hidden = true;
  stThink.hidden = !query;
  try {
    const loading = (async () => {
      if (stDemo) return;
      if (!query) { stStatus.textContent = 'Loading candidates…'; stStatus.className = 'st-status'; stStatus.hidden = false; }
      const result = await window.savaPlatform.employerRequest(query ? 'aiSearchCandidates' : 'searchCandidates', { query, limit: 50 });
      if (run !== stSearchRun) return;
      stState.candidates = (result.candidates || []).map(stFromLive);
      if (query) stState.understood = result.interpretation;
      stStatus.hidden = true;
    })();
    if (query) {
      document.querySelector('#stTitle').textContent = `Results for "${query}"`;
      document.querySelector('#stSummary').textContent = 'Searching…';
      stResults.innerHTML = '';
      await stThinkThrough(run, loading);
    } else await loading;
    if (run !== stSearchRun) return;
    stState.results = stResultsFor(stState.understood);
    stRender();
  } catch (error) {
    if (run !== stSearchRun) return;
    stThink.hidden = true;
    stResults.innerHTML = '';
    stStatus.textContent = error.message || 'Candidate search is unavailable. Please try again.';
    stStatus.className = 'st-status error';
    stStatus.hidden = false;
  }
}

stForm.addEventListener('submit', (event) => { event.preventDefault(); stSearch(stQuery.value); });
document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => stSearch(button.dataset.example)));
document.querySelector('#stClear').addEventListener('click', () => stSearch(''));
stSort.addEventListener('change', stRender);
(async () => {
  if (stDemo) stState.candidates = await stDemoCandidates();
  stSearch(new URLSearchParams(window.location.search).get('q') || '');
})();
