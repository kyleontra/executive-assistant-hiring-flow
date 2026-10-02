const talentForm = document.querySelector('#talentSearchForm');
const talentInput = document.querySelector('#talentSearch');
const talentResults = document.querySelector('#talentResults');
const talentStatus = document.querySelector('#talentStatus');
const talentSummary = document.querySelector('#talentResultSummary');
const talentTitle = document.querySelector('#talentResultTitle');
const clearTalentSearch = document.querySelector('#clearTalentSearch');
const talentPreviewMode = document.documentElement.dataset.preview === 'true';
window.getVerifiedEmployer().then((user) => {
  const isMasterReviewer = Boolean(user?.app_metadata?.master && user?.app_metadata?.can_review);
  document.querySelectorAll('[data-master-resume]').forEach((link) => { link.hidden = !isMasterReviewer; });
}).catch(() => {});
const talentPreviewCandidates = [
  { id: 'preview-1', name: 'Naledi Mokoena', primaryRole: 'Paralegal', relevantYears: 5, summary: 'Paralegal experienced in matter preparation, legal research, document review, and deadline coordination for busy legal teams.', experience: [{ jobTitle: 'Senior Paralegal', companyName: 'Mokoena Legal Partners', startDate: '2022-02', endDate: '', currentRole: true, description: 'Prepares case files, conducts legal research, coordinates court deadlines, and supports client intake.' }, { jobTitle: 'Legal Assistant', companyName: 'Cape Advisory Law', startDate: '2019-01', endDate: '2022-01', currentRole: false, description: 'Managed legal documents, correspondence, billing records, and matter calendars.' }] },
  { id: 'preview-2', name: 'Thandi Jacobs', primaryRole: 'Customer Support Specialist', relevantYears: 6, summary: 'Customer support professional with experience handling escalations, renewals, reporting, and high-volume client communication.', experience: [{ jobTitle: 'Customer Support Specialist', companyName: 'BrightDesk', startDate: '2021-04', endDate: '', currentRole: true, description: 'Owns escalated tickets, customer follow-ups, and weekly service reporting for international clients.' }] },
  { id: 'preview-3', name: 'Ayanda Khumalo', primaryRole: 'Executive Assistant', relevantYears: 7, summary: 'Executive assistant supporting founders and boards across multiple countries, with strong calendar, travel, and priority-management experience.', experience: [{ jobTitle: 'Executive Assistant to Founders', companyName: 'Northstar Group', startDate: '2020-06', endDate: '', currentRole: true, description: 'Coordinates two founder calendars, board meetings, international travel, and leadership follow-through.' }, { jobTitle: 'Operations Coordinator', companyName: 'Atlas Services', startDate: '2017-03', endDate: '2020-05', currentRole: false, description: 'Managed reporting deadlines, supplier coordination, and internal process documentation.' }] },
];

function escapeTalent(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SA';
}

function formatMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${value}-01T00:00:00Z`));
}

function experienceDate(entry) {
  const start = formatMonth(entry.startDate);
  const end = entry.currentRole ? 'Present' : formatMonth(entry.endDate);
  return [start, end].filter(Boolean).join(' – ');
}

function renderCandidates(candidates, query) {
  talentStatus.hidden = true;
  talentTitle.textContent = query ? `Results for “${query}”` : 'Available candidates';
  talentSummary.textContent = `${candidates.length} verified candidate${candidates.length === 1 ? '' : 's'}`;
  clearTalentSearch.hidden = !query;
  if (!candidates.length) {
    talentResults.innerHTML = `<div class="talent-empty"><h3>No exact matches yet.</h3><p>Try a broader role, skill, or keyword.</p></div>`;
    return;
  }
  talentResults.innerHTML = candidates.map((candidate) => {
    const photo = candidate.photoUrl
      ? `<img class="talent-avatar" src="${escapeTalent(candidate.photoUrl)}" alt="" />`
      : `<span class="talent-avatar" aria-hidden="true">${escapeTalent(initials(candidate.name))}</span>`;
    const experience = (candidate.experience || []).map((entry, index) => `<div class="experience-row${index > 1 ? ' extra' : ''}"${index > 1 ? ' hidden' : ''}><i aria-hidden="true"></i><span><b>${escapeTalent(entry.jobTitle)}</b><small>${escapeTalent(entry.companyName)}</small></span><span>${escapeTalent(experienceDate(entry))}</span>${entry.description ? `<p class="experience-description">${escapeTalent(entry.description)}</p>` : ''}</div>`).join('');
    const skills = [...new Set(candidate.skills || [])].slice(0, 12);
    const signalList = skills.length ? `<section class="talent-signals"><p>SKILLS FROM RESUME</p><div>${skills.map((skill) => `<span>${escapeTalent(skill)}</span>`).join('')}</div></section>` : '';
    return `<article class="talent-card"><header class="talent-card-head">${photo}<div><h3>${escapeTalent(candidate.name)}</h3><p>${escapeTalent(candidate.primaryRole)}</p></div><span class="talent-years">${Number(candidate.relevantYears || 0)} years relevant</span></header><p class="talent-summary">${escapeTalent(candidate.summary)}</p>${signalList}${candidate.introUrl ? `<details class="talent-intro"><summary>Watch introduction</summary><video src="${escapeTalent(candidate.introUrl)}" controls playsinline preload="none" style="width:100%;max-height:320px;margin-top:12px;border-radius:10px;background:#14233a" aria-label="${escapeTalent(candidate.name)} introduction"></video></details>` : ''}<section class="talent-experience"><p>RELEVANT EXPERIENCE</p>${experience || '<div class="experience-row"><i></i><span><b>Resume indexed</b><small>Searchable role, software, and skill data available above</small></span></div>'}</section>${(candidate.experience || []).length > 2 ? '<button class="talent-card-toggle" type="button" aria-expanded="false">View full experience</button>' : ''}</article>`;
  }).join('');
}

async function searchTalent(query = '') {
  const cleanQuery = query.trim();
  talentInput.value = cleanQuery;
  talentStatus.className = 'talent-status';
  talentStatus.textContent = cleanQuery ? `Searching for ${cleanQuery}…` : 'Loading verified candidates…';
  talentStatus.hidden = false;
  talentResults.innerHTML = '';
  const url = new URL(window.location.href);
  if (cleanQuery) url.searchParams.set('q', cleanQuery);
  else url.searchParams.delete('q');
  window.history.replaceState({}, '', url);
  if (talentPreviewMode) {
    const terms = cleanQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = talentPreviewCandidates.filter((candidate) => {
      const searchable = JSON.stringify(candidate).toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
    renderCandidates(matches, cleanQuery);
    return;
  }
  try {
    const result = await window.savaPlatform.employerRequest('searchCandidates', { query: cleanQuery, limit: 50 });
    renderCandidates(result.candidates || [], cleanQuery);
  } catch (error) {
    talentStatus.className = 'talent-status error';
    talentStatus.textContent = error.message || 'Candidate search is unavailable. Please try again.';
    talentSummary.textContent = 'Candidate search could not load';
  }
}

talentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  searchTalent(talentInput.value);
});

document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => searchTalent(button.dataset.query)));
clearTalentSearch.addEventListener('click', () => searchTalent(''));
talentResults.addEventListener('click', (event) => {
  const button = event.target.closest('.talent-card-toggle');
  if (!button) return;
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.closest('.talent-card').querySelectorAll('.experience-row.extra').forEach((row) => { row.hidden = expanded; });
  button.setAttribute('aria-expanded', String(!expanded));
  button.textContent = expanded ? 'View full experience' : 'Show less';
});

searchTalent(new URLSearchParams(window.location.search).get('q') || '');
