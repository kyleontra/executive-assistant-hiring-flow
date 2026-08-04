const $ = (selector) => document.querySelector(selector);
const storageKey = 'ea-hiring-role';
const sampleQuestions = [
  'Tell us about the most complex executive calendar you have managed.',
  'How do you keep an executive’s priorities and follow-ups on track?',
  'Describe a problem you noticed and solved without being asked.',
];
const defaults = {
  title: 'Executive Assistant',
  description: '',
  commitment: 'Full-time (40 hours per week)',
  minRate: '3',
  maxRate: '5',
  questions: [''],
  promote: true,
  promotionBudget: '8',
  published: false,
  // Kept for older saved drafts and the existing public job board.
  arrangement: 'Remote',
  type: 'Full-time',
  location: 'South Africa',
  hours: '40 hours / week',
  skills: [],
  showPay: true,
};

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const questions = Array.isArray(stored.questions) && stored.questions.length ? stored.questions : defaults.questions;
    return { ...defaults, ...stored, questions };
  } catch {
    return { ...defaults };
  }
}

function write(patch) {
  const next = { ...read(), ...patch };
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

function text(value) { return (value || '').trim(); }
function money(value) { const number = Number(value); return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0$/, ''); }
function rate(role) { return `$${money(role.minRate)} – $${money(role.maxRate)} / hour`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

function toast(message) {
  const element = $('#toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 2200);
}

function hydrateRoleContent() {
  const role = read();
  document.querySelectorAll('[data-review="title"]').forEach((element) => { element.textContent = role.title || defaults.title; });
  document.querySelectorAll('[data-review="commitment"]').forEach((element) => { element.textContent = role.commitment; });
  document.querySelectorAll('[data-review="description"]').forEach((element) => { element.textContent = role.description || 'No description added.'; });
  document.querySelectorAll('[data-review="rate"]').forEach((element) => { element.textContent = rate(role); });
  document.querySelectorAll('[data-review="location"]').forEach((element) => { element.textContent = `${role.arrangement} · ${role.location}`; });
  document.querySelectorAll('[data-review="type"]').forEach((element) => { element.textContent = role.commitment.split(' (')[0]; });
  const reviewQuestions = $('#reviewQuestions');
  if (reviewQuestions) reviewQuestions.innerHTML = role.questions.filter(text).map((question) => `<li>${escapeHtml(question)}</li>`).join('');
}

function showPostError(message) {
  const result = $('#postFormResult');
  if (!result) return;
  result.textContent = message;
  result.className = 'simple-form-result show';
  result.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindPostJob() {
  const form = $('#postJobForm');
  if (!form) return;
  const role = read();
  const title = $('#title');
  const description = $('#description');
  const questionList = $('#jobQuestionList');
  const addButton = $('#addQuestion');
  title.value = role.title === defaults.title && !role.description ? '' : role.title;
  description.value = role.description;
  $('#descriptionCount').textContent = description.value.length.toLocaleString();
  description.addEventListener('input', () => { $('#descriptionCount').textContent = description.value.length.toLocaleString(); });

  document.querySelectorAll('[data-format]').forEach((button) => {
    button.addEventListener('click', () => {
      const start = description.selectionStart;
      const end = description.selectionEnd;
      const selected = description.value.slice(start, end);
      const format = button.dataset.format;
      const replacements = {
        bold: `**${selected || 'bold text'}**`,
        italic: `_${selected || 'italic text'}_`,
        bullet: selected ? selected.split('\n').map((line) => `• ${line.replace(/^[•\-]\s*/, '')}`).join('\n') : '• ',
        number: selected ? selected.split('\n').map((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s*/, '')}`).join('\n') : '1. ',
      };
      description.setRangeText(replacements[format], start, end, 'end');
      description.dispatchEvent(new Event('input', { bubbles: true }));
      description.focus();
    });
  });

  $('#draftDescription').addEventListener('click', () => {
    if (text(description.value) && !window.confirm('Replace the current description with a structured starting point?')) return;
    const roleTitle = text(title.value) || 'this role';
    description.value = `About the role\n\nWe are looking for a ${roleTitle} to help our team stay organised, move priorities forward, and communicate clearly.\n\nWhat you will manage\n• Add the core responsibilities for this role\n• Add the recurring tasks and relationships they will own\n• Explain what success looks like after 30, 60, and 90 days\n\nWhat makes someone a strong fit\n• Add the experience that matters most\n• Add the tools or working style they should know\n• Add any must-have availability or communication expectations`;
    description.dispatchEvent(new Event('input', { bubbles: true }));
    description.focus();
  });

  function refreshQuestionRows() {
    const rows = [...questionList.querySelectorAll('.job-question-row')];
    rows.forEach((row, index) => {
      row.querySelector('label').firstChild.textContent = `Question ${index + 1} `;
      row.querySelector('.remove-question').hidden = rows.length === 1;
    });
  }

  function addQuestion(value = '', focus = false) {
    const row = document.createElement('div');
    row.className = 'job-question-row';
    row.innerHTML = `<label class="simple-field">Question <em>*</em><input class="job-question-input" maxlength="240" placeholder="e.g. Tell us about relevant experience for this role." required /></label><button class="remove-question" type="button" aria-label="Remove question">×</button>`;
    row.querySelector('input').value = value;
    questionList.appendChild(row);
    refreshQuestionRows();
    if (focus) row.querySelector('input').focus();
  }

  const savedQuestions = role.questions.length ? role.questions : [''];
  savedQuestions.forEach((question) => addQuestion(question));
  addButton.addEventListener('click', () => addQuestion('', true));
  questionList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-question');
    if (!removeButton || questionList.children.length === 1) return;
    removeButton.closest('.job-question-row').remove();
    refreshQuestionRows();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      showPostError('Add the job title, description, and at least one applicant question.');
      return;
    }
    const questions = [...questionList.querySelectorAll('.job-question-input')].map((input) => text(input.value));
    write({
      title: text(title.value),
      description: text(description.value),
      questions,
      promote: true,
      promotionBudget: '8',
      published: false,
    });
    window.location.href = './compensation.html';
  });
}

function bindCompensation() {
  const form = $('#compensationForm');
  if (!form) return;
  const role = read();
  const minRate = $('#minRate');
  const maxRate = $('#maxRate');
  minRate.value = role.minRate || '3';
  maxRate.value = role.maxRate || '5';
  const commitments = [...form.querySelectorAll('input[name="commitment"]')];
  const selected = commitments.find((input) => input.value === role.commitment) || commitments[0];
  selected.checked = true;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      showPostError('Choose a commitment and complete the hourly range.');
      return;
    }
    const minimum = Number(minRate.value);
    const maximum = Number(maxRate.value);
    if (minimum < 3) {
      minRate.focus();
      showPostError('The minimum hourly rate is $3 USD.');
      return;
    }
    if (maximum <= minimum) {
      maxRate.focus();
      showPostError('The top of the hourly range must be higher than the starting rate.');
      return;
    }
    write({
      commitment: form.querySelector('input[name="commitment"]:checked').value,
      minRate: minRate.value,
      maxRate: maxRate.value,
      showPay: true,
      published: false,
    });
    window.location.href = './review.html';
  });
}

function bindPublish() {
  const button = $('#publishJob');
  if (!button) return;
  const role = read();
  const promotionOptions = [...document.querySelectorAll('input[name="promotion"]')];
  const budgetPanel = $('#promotionBudgetPanel');
  const budgetInput = $('#promotionBudget');
  const selected = promotionOptions.find((input) => input.value === String(role.promote)) || promotionOptions[0];
  selected.checked = true;
  budgetInput.value = role.promotionBudget || '8';

  function updatePromotion() {
    const promote = document.querySelector('input[name="promotion"]:checked')?.value === 'true';
    budgetPanel.hidden = !promote;
    budgetInput.required = promote;
  }

  promotionOptions.forEach((input) => input.addEventListener('change', updatePromotion));
  updatePromotion();
  button.addEventListener('click', () => {
    const promote = document.querySelector('input[name="promotion"]:checked')?.value === 'true';
    const promotionBudget = Number(budgetInput.value);
    if (promote && (!budgetInput.reportValidity() || promotionBudget < 5)) {
      budgetInput.focus();
      showPostError('Promotion requires a budget of at least $5 per day.');
      return;
    }
    write({ published: true, promote, promotionBudget: promote ? budgetInput.value : '' });
    window.location.href = './published.html';
  });
}

const sampleJobs = [
  { id:'aster', company:'Aster & Co.', initial:'A', title:'Executive Assistant to CEO', arrangement:'Remote', type:'Full-time', location:'South Africa', pay:'$10–$14 / hour', posted:'2 days ago', description:'Aster & Co. is looking for an experienced Executive Assistant to keep the CEO organised and help the leadership team move quickly.', responsibilities:['Manage a complex CEO calendar and protect focus time','Prepare meeting briefs, notes, and follow-up actions','Coordinate domestic and international travel','Handle professional communication with clients and partners'], skills:['Calendar management','Executive support','Travel coordination','Google Workspace'], questions:sampleQuestions },
  { id:'bright', company:'BrightHouse', initial:'B', title:'Senior Executive Assistant', arrangement:'Hybrid', type:'Full-time', location:'Cape Town', pay:'$12–$16 / hour', posted:'3 days ago', description:'Support two founders at a growing professional-services company. Keep decisions, meetings, and key relationships moving forward.', responsibilities:['Coordinate leadership schedules and off-sites','Own travel, expenses, and meeting logistics','Track company priorities and follow-ups','Support internal communications'], skills:['Microsoft Office','Project coordination','Expense management','Written communication'], questions:sampleQuestions },
  { id:'harbor', company:'Harbor Health', initial:'H', title:'Executive Assistant — Operations', arrangement:'Remote', type:'Contract', location:'South Africa', pay:'$11–$15 / hour', posted:'5 days ago', description:'Support an operations lead during a period of growth with structured, varied work focused on making the team more efficient.', responsibilities:['Maintain operational calendars and reporting deadlines','Schedule stakeholder meetings','Create simple process documents','Manage the shared inbox'], skills:['Inbox management','Notion','Meeting coordination','Process documentation'], questions:sampleQuestions },
  { id:'mosaic', company:'Mosaic Studio', initial:'M', title:'Part-time Executive Assistant', arrangement:'Remote', type:'Part-time', location:'South Africa', pay:'$9–$12 / hour', posted:'1 week ago', description:'Support a creative director with administrative organisation, client follow-up, and weekly planning.', responsibilities:['Organise the weekly schedule','Prepare client meeting notes','Follow up on actions and invoices','Keep files and contacts current'], skills:['Calendar management','Client communication','Attention to detail','Asana'], questions:sampleQuestions },
];

function currentPostedJob() {
  const role = read();
  if (!role.published) return null;
  return { id:'current', company:'Your company', initial:'Y', title:role.title, arrangement:'Remote', type:role.commitment.split(' (')[0], location:'South Africa', pay:rate(role), posted:'Just now', description:role.description, responsibilities:[], skills:[], questions:role.questions };
}

function jobBoard() {
  const current = currentPostedJob();
  return current ? [current, ...sampleJobs] : sampleJobs;
}

function renderJobs(filter = '') {
  const root = $('#jobResults');
  if (!root) return;
  const matches = jobBoard().filter((job) => `${job.title} ${job.company} ${job.description}`.toLowerCase().includes(filter.toLowerCase()));
  $('#resultCount').textContent = matches.length;
  root.innerHTML = matches.map((job) => `<a class="job-card" href="./job-detail.html?job=${encodeURIComponent(job.id)}"><div class="job-card-top"><div class="job-company">${escapeHtml(job.initial)}</div><div><h2>${escapeHtml(job.title)}</h2><p class="company-name">${escapeHtml(job.company)}</p></div><span class="posted">${escapeHtml(job.posted)}</span></div><div class="job-tags"><span>${escapeHtml(job.arrangement)}</span><span>${escapeHtml(job.type)}</span><span>${escapeHtml(job.location)}</span></div><p>${escapeHtml(job.description)}</p><div class="job-card-footer"><b>${escapeHtml(job.pay)}</b><span>View job →</span></div></a>`).join('') || '<p class="no-results">No roles match that search.</p>';
}

function bindJobs() {
  if (!$('#jobResults')) return;
  renderJobs();
  $('#searchJobs').addEventListener('click', () => renderJobs($('#jobSearch').value));
  $('#jobSearch').addEventListener('input', (event) => renderJobs(event.target.value));
}

function bindJobDetail() {
  if (!$('#detailTitle')) return;
  const id = new URLSearchParams(window.location.search).get('job');
  const job = jobBoard().find((item) => item.id === id) || jobBoard()[0];
  $('#detailInitial').textContent = job.initial;
  $('#detailCompany').textContent = job.company;
  $('#detailTitle').textContent = job.title;
  $('#detailArrangement').textContent = job.arrangement;
  $('#detailEmployment').textContent = job.type;
  $('#detailLocation').textContent = job.location;
  $('#detailPay').textContent = job.pay;
  $('#detailDescription').textContent = job.description;
  $('#detailResponsibilities').innerHTML = job.responsibilities.length ? job.responsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>Responsibilities are included in the full job description above.</li>';
  $('#detailSkills').innerHTML = job.skills.length ? job.skills.map((item) => `<span>${escapeHtml(item)}</span>`).join('') : '<span>Role-specific experience</span>';
  const questions = $('#detailQuestions');
  if (questions) questions.innerHTML = job.questions.map((question) => `<li>${escapeHtml(question)}</li>`).join('');
  $('#showApplication').addEventListener('click', () => {
    sessionStorage.setItem('sava-applying-job', job.id);
    window.location.href = `./candidate-signup.html?job=${encodeURIComponent(job.id)}`;
  });
}

function questionsForCandidate(job) {
  if (job === 'current') {
    const savedQuestions = read().questions.filter(text);
    return savedQuestions.length ? savedQuestions : sampleQuestions;
  }
  if (job === 'operations') return ['How have you kept an operations leader organised?', 'How do you follow up across multiple departments?', 'Describe a process you improved without being asked.'];
  return ['How have you supported a customer-facing leader?', 'How do you track customer commitments and risks?', 'Describe a customer process you improved proactively.'];
}

function bindApplicants() {
  const candidates = [...document.querySelectorAll('.simple-candidate')];
  if (!candidates.length) return;
  const filter = $('#jobFilter');
  const rankSelect = $('#candidateRank');
  let selectedCandidate = null;
  const newestOption = filter.querySelector('option[value="current"]');
  newestOption.textContent = read().published ? read().title : 'Your newest role';
  candidates.filter((candidate) => candidate.dataset.job === 'current').forEach((candidate) => {
    candidate.querySelector('.candidate-role').textContent = read().published ? read().title : candidate.dataset.role;
  });

  function candidateRankKey(candidate) {
    return `sava-candidate-rank:${candidate.dataset.job}:${candidate.dataset.name}`;
  }

  function schedulerLink(candidate) {
    const defaults = { eventName: 'Intro interview', duration: '30', timezone: 'America/New_York', location: 'Google Meet link sent after booking', availability: [{ day: 1, start: '09:00', end: '17:00' }, { day: 2, start: '09:00', end: '17:00' }, { day: 3, start: '09:00', end: '17:00' }, { day: 4, start: '09:00', end: '17:00' }, { day: 5, start: '09:00', end: '15:00' }] };
    let config = defaults;
    try { config = { ...defaults, ...JSON.parse(localStorage.getItem('sava-scheduler-config') || '{}') }; } catch { /* Use defaults. */ }
    const origin = window.location.protocol === 'file:' ? 'https://www.hirefromsa.com' : window.location.origin;
    const url = new URL('/schedule-interview.html', origin);
    url.searchParams.set('event', config.eventName);
    url.searchParams.set('duration', config.duration);
    url.searchParams.set('tz', config.timezone);
    url.searchParams.set('location', config.location);
    url.searchParams.set('availability', config.availability.map((item) => `${item.day}-${item.start}-${item.end}`).join(','));
    url.searchParams.set('candidate', candidate.dataset.name);
    url.searchParams.set('role', candidate.dataset.role);
    return url.toString();
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const temporary = document.createElement('textarea');
      temporary.value = value;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
    }
  }

  function selectCandidate(candidate) {
    selectedCandidate = candidate;
    candidates.forEach((item) => item.classList.toggle('active', item === candidate));
    const roleName = candidate.dataset.job === 'current' && read().published ? read().title : candidate.dataset.role;
    const questions = questionsForCandidate(candidate.dataset.job);
    $('#profilePhoto').src = candidate.dataset.photo;
    $('#profilePhoto').alt = candidate.dataset.name;
    $('#profileName').textContent = candidate.dataset.name;
    $('#profileRole').textContent = roleName;
    $('#profileExperience').textContent = candidate.dataset.experience;
    $('#profileMatch').textContent = `${candidate.dataset.match}% match`;
    $('#profileSummary').textContent = candidate.dataset.summary;
    rankSelect.value = localStorage.getItem(candidateRankKey(candidate)) || '';
    [1, 2, 3].forEach((number) => {
      const questionElement = $(`#profileQuestion${number}`);
      const card = questionElement.closest('.answer-card');
      const question = questions[number - 1];
      card.hidden = !question;
      if (question) {
        questionElement.textContent = question;
        $(`#profileAnswer${number}`).textContent = candidate.dataset[`answer${number}`];
      }
    });
    $('#shortlist').textContent = 'Shortlist candidate';
  }

  function applyFilter() {
    const value = filter.value;
    let firstVisible = null;
    let visibleCount = 0;
    candidates.forEach((candidate) => {
      const visible = value === 'all' || candidate.dataset.job === value;
      candidate.hidden = !visible;
      if (visible) { visibleCount += 1; if (!firstVisible) firstVisible = candidate; }
    });
    $('#newCandidateCount').textContent = visibleCount;
    if (firstVisible) selectCandidate(firstVisible);
  }

  candidates.forEach((candidate) => candidate.addEventListener('click', () => selectCandidate(candidate)));
  filter.addEventListener('change', applyFilter);
  rankSelect.addEventListener('change', () => {
    if (!selectedCandidate) return;
    const key = candidateRankKey(selectedCandidate);
    if (rankSelect.value) {
      localStorage.setItem(key, rankSelect.value);
      toast(`${selectedCandidate.dataset.name} ranked ${rankSelect.value} out of 10`);
    } else {
      localStorage.removeItem(key);
      toast(`Ranking removed for ${selectedCandidate.dataset.name}`);
    }
  });
  $('#messageCandidate').addEventListener('click', () => {
    if (selectedCandidate) toast(`Message thread opened for ${selectedCandidate.dataset.name}`);
  });
  $('#inviteInterview').addEventListener('click', async () => {
    if (!selectedCandidate) return;
    await copyText(schedulerLink(selectedCandidate));
    toast(`Booking link copied for ${selectedCandidate.dataset.name}`);
  });
  $('#shortlist').addEventListener('click', () => { $('#shortlist').textContent = 'Shortlisted ✓'; toast('Candidate moved to Shortlisted'); });
  applyFilter();
}

hydrateRoleContent();
bindPostJob();
bindCompensation();
bindPublish();
bindApplicants();
bindJobs();
bindJobDetail();

window.savaJobBoard = jobBoard;
window.savaEscapeHtml = escapeHtml;
