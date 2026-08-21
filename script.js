const $ = (selector) => document.querySelector(selector);
const storageKey = 'ea-hiring-role';
const candidateMessagesEndpoint = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/candidate-messages';
const messagingIdentityKey = 'sava-employer-messaging-identity';
let serverJobs = [];
let serverJobsPromise = null;
let serverJobsLoaded = false;
let applicantJobsById = new Map();
const sampleQuestions = [
  { text: 'Tell us about the most complex executive calendar you have managed.', type: 'text', options: [] },
  { text: 'How do you keep an executive’s priorities and follow-ups on track?', type: 'text', options: [] },
  { text: 'Which working schedule can you reliably support?', type: 'multiple-choice', options: ['US Eastern business hours', 'South African business hours', 'Flexible overlap with both'] },
];
const defaults = {
  title: 'Executive Assistant',
  company: 'Your company',
  description: '',
  commitment: 'Full-time (40 hours per week)',
  minRate: '3',
  maxRate: '5',
  questions: [],
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
    const questions = Array.isArray(stored.questions) ? stored.questions : defaults.questions;
    return { ...defaults, ...stored, questions: questions.map(normalizeQuestion) };
  } catch {
    return { ...defaults, questions: defaults.questions.map(normalizeQuestion) };
  }
}

function write(patch) {
  const next = { ...read(), ...patch };
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

function text(value) { return (value || '').trim(); }
function normalizeQuestion(question) {
  if (typeof question === 'string') return { text: text(question), type: 'text', options: [] };
  const type = question?.type === 'multiple-choice' ? 'multiple-choice' : 'text';
  const options = Array.isArray(question?.options) ? question.options.map(text).filter(Boolean) : [];
  return { text: text(question?.text), type, options };
}
function questionText(question) { return normalizeQuestion(question).text; }
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
  if (reviewQuestions) reviewQuestions.innerHTML = role.questions.filter((question) => questionText(question)).map((question) => {
    const normalized = normalizeQuestion(question);
    const detail = normalized.type === 'multiple-choice' ? `<small>Multiple choice · ${normalized.options.map(escapeHtml).join(' · ')}</small>` : '<small>Written response</small>';
    return `<li><span>${escapeHtml(normalized.text)}</span>${detail}</li>`;
  }).join('');
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
  const step = form.dataset.step;
  let roleDescription = null;

  if (step === 'title') {
    const title = $('#title');
    const companyName = $('#companyName');
    const savedTitle = text(role.title);
    const clearSavedTitle = savedTitle.toLowerCase() === 'sad';
    title.value = clearSavedTitle || (role.title === defaults.title && !role.description) ? '' : role.title;
    companyName.value = role.company === defaults.company ? '' : role.company;
    if (clearSavedTitle) write({ title: '' });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) {
        showPostError('Add the company name and job title to continue.');
        return;
      }
      write({ title: text(title.value), company: text(companyName.value), published: false, ...(role.published ? { serverJobId: '' } : {}) });
      window.location.href = './job-description.html';
    });
    return;
  }

  if (step === 'description' || step === 'details') {
    const description = $('#description');
    roleDescription = description;
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

    if (step === 'description') {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!form.reportValidity()) {
          showPostError('Add the job description to continue.');
          return;
        }
        write({ description: text(description.value), published: false });
        window.location.href = './job-description.html';
      });
      return;
    }
  }

  if (step === 'details' && !$('#jobQuestionList')) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) {
        showPostError('Add the job description to continue.');
        return;
      }
      write({ description: text(roleDescription.value), questions: [], published: false });
      window.location.href = './compensation.html';
    });
    return;
  }

  const questionList = $('#jobQuestionList');
  const addButton = $('#addQuestion');

  function refreshQuestionRows() {
    const rows = [...questionList.querySelectorAll('.job-question-row')];
    rows.forEach((row, index) => {
      row.querySelector('.question-number').textContent = String(index + 1).padStart(2, '0');
      row.querySelector('.question-label-text').textContent = `Question ${index + 1}`;
      row.querySelector('.remove-question').hidden = rows.length === 1;
    });
  }

  function refreshOptionRows(row) {
    const options = [...row.querySelectorAll('.question-option-row')];
    options.forEach((option, index) => {
      option.querySelector('.option-number').textContent = `Option ${index + 1}`;
      option.querySelector('.remove-option').hidden = options.length <= 2;
    });
  }

  function addOption(row, value = '', focus = false) {
    const option = document.createElement('div');
    option.className = 'question-option-row';
    option.innerHTML = `<label><span class="option-number">Option</span><input class="question-option-input" maxlength="120" placeholder="Enter an answer choice" /></label><button class="remove-option" type="button" aria-label="Remove answer option">×</button>`;
    option.querySelector('input').value = value;
    row.querySelector('.question-option-list').appendChild(option);
    refreshOptionRows(row);
    if (focus) option.querySelector('input').focus();
  }

  function updateQuestionType(row) {
    const isMultipleChoice = row.querySelector('.job-question-type').value === 'multiple-choice';
    const builder = row.querySelector('.multiple-choice-builder');
    builder.hidden = !isMultipleChoice;
    builder.querySelectorAll('input').forEach((input) => {
      input.disabled = !isMultipleChoice;
      input.required = isMultipleChoice;
    });
  }

  function addQuestion(value = { text: '', type: 'text', options: [] }, focus = false) {
    const question = normalizeQuestion(value);
    const row = document.createElement('div');
    row.className = 'job-question-row';
    row.innerHTML = `<span class="question-number" aria-hidden="true">01</span><div class="question-content"><div class="job-question-main"><label class="simple-field"><span><span class="question-label-text">Question 1</span> <em>*</em></span><input class="job-question-input" maxlength="240" placeholder="Enter a question" required /></label><label class="simple-field question-type-field"><span>Answer type <em>*</em></span><select class="job-question-type"><option value="text">Written response</option><option value="multiple-choice">Multiple choice</option></select></label><button class="remove-question" type="button" aria-label="Remove question">×</button></div><section class="multiple-choice-builder" hidden><div class="option-builder-heading"><div><b>Answer options</b><small>Add at least two choices.</small></div><button class="add-option" type="button"><span>+</span> Add option</button></div><div class="question-option-list"></div></section></div>`;
    row.querySelector('.job-question-input').value = question.text;
    row.querySelector('.job-question-type').value = question.type;
    questionList.appendChild(row);
    const optionValues = question.options.length >= 2 ? question.options : ['', ''];
    optionValues.forEach((option) => addOption(row, option));
    updateQuestionType(row);
    refreshQuestionRows();
    if (focus) row.querySelector('.job-question-input').focus();
  }

  const savedQuestions = role.questions.length ? role.questions : [{ text: '', type: 'text', options: [] }];
  savedQuestions.forEach((question) => addQuestion(question));
  addButton.addEventListener('click', () => addQuestion(undefined, true));
  questionList.addEventListener('change', (event) => {
    if (!event.target.matches('.job-question-type')) return;
    updateQuestionType(event.target.closest('.job-question-row'));
  });
  questionList.addEventListener('click', (event) => {
    const addOptionButton = event.target.closest('.add-option');
    if (addOptionButton) {
      addOption(addOptionButton.closest('.job-question-row'), '', true);
      return;
    }
    const removeOptionButton = event.target.closest('.remove-option');
    if (removeOptionButton) {
      const row = removeOptionButton.closest('.job-question-row');
      if (row.querySelectorAll('.question-option-row').length <= 2) return;
      removeOptionButton.closest('.question-option-row').remove();
      refreshOptionRows(row);
      return;
    }
    const removeButton = event.target.closest('.remove-question');
    if (!removeButton || questionList.children.length === 1) return;
    removeButton.closest('.job-question-row').remove();
    refreshQuestionRows();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!questionList.children.length || !form.reportValidity()) {
      showPostError(step === 'details' ? 'Complete the job description and every applicant question.' : 'Add at least one complete applicant question.');
      return;
    }
    const questions = [...questionList.querySelectorAll('.job-question-row')].map((row) => {
      const type = row.querySelector('.job-question-type').value;
      return {
        text: text(row.querySelector('.job-question-input').value),
        type,
        options: type === 'multiple-choice' ? [...row.querySelectorAll('.question-option-input')].map((input) => text(input.value)) : [],
      };
    });
    write({
      ...(step === 'details' ? { description: text(roleDescription.value) } : {}),
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
  const promoteInput = $('#promoteJob');
  const budgetPanel = $('#promotionBudgetPanel');
  const budgetInput = $('#promotionBudget');
  promoteInput.checked = role.promote !== false;
  budgetInput.value = role.promotionBudget || '8';

  function updatePromotion() {
    const promote = promoteInput.checked;
    budgetPanel.hidden = !promote;
    budgetInput.required = promote;
  }

  promoteInput.addEventListener('change', updatePromotion);
  updatePromotion();
  button.addEventListener('click', async () => {
    const promote = promoteInput.checked;
    const promotionBudget = Number(budgetInput.value);
    if (promote && (!budgetInput.reportValidity() || promotionBudget < 5)) {
      budgetInput.focus();
      showPostError('Promotion requires a budget of at least $5 per day.');
      return;
    }
    const publishedRole = write({ published: true, promote, promotionBudget: promote ? budgetInput.value : '' });
    button.disabled = true;
    button.textContent = 'Publishing role…';
    try {
      if (!window.savaPlatform) throw new Error('The publishing service did not load. Refresh and try again.');
      const { job } = await window.savaPlatform.employerRequest('createJob', {
        jobId: publishedRole.serverJobId || '',
        companyName: publishedRole.company || 'Your company',
        title: publishedRole.title,
        description: publishedRole.description,
        arrangement: publishedRole.arrangement,
        employmentType: publishedRole.commitment.split(' (')[0],
        location: publishedRole.location,
        payMin: Number(publishedRole.minRate),
        payMax: Number(publishedRole.maxRate),
        questions: publishedRole.questions,
        responsibilities: publishedRole.responsibilities || [],
        skills: publishedRole.skills || [],
        promoted: promote,
        promotionBudget: promote ? promotionBudget : 0,
      });
      write({ serverJobId: job.id, published: true });
      window.location.href = './published.html';
    } catch (error) {
      button.disabled = false;
      button.innerHTML = 'Publish role <span>→</span>';
      showPostError(error.message || 'The role could not be published. Please try again.');
    }
  });
}

function currentPostedJob() {
  const role = read();
  if (!role.published) return null;
  return { id:role.serverJobId || 'current', company:role.company || 'Your company', initial:'Y', title:role.title, arrangement:'Remote', type:role.commitment.split(' (')[0], location:'South Africa', pay:rate(role), posted:'Just now', description:role.description, responsibilities:role.responsibilities || [], skills:role.skills || [], questions:role.questions };
}

function jobBoard() {
  if (serverJobsLoaded) return serverJobs;
  const current = currentPostedJob();
  return current ? [current] : [];
}

function postedLabel(createdAt) {
  if (!createdAt) return 'Recently';
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 14) return `${days} days ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(createdAt));
}

async function loadServerJobs(force = false) {
  if (!window.savaPlatform) return jobBoard();
  if (force) serverJobsPromise = null;
  if (!serverJobsPromise) {
    serverJobsPromise = (async () => {
      const localRole = read();
      if (localRole.published && !localRole.serverJobId && localRole.description) {
        const { job } = await window.savaPlatform.employerRequest('createJob', {
          companyName: localRole.company || 'Your company', title: localRole.title, description: localRole.description,
          arrangement: localRole.arrangement, employmentType: localRole.commitment.split(' (')[0], location: localRole.location,
          payMin: Number(localRole.minRate), payMax: Number(localRole.maxRate), questions: localRole.questions,
          responsibilities: localRole.responsibilities || [], skills: localRole.skills || [], promoted: localRole.promote,
          promotionBudget: Number(localRole.promotionBudget || 0),
        });
        write({ serverJobId: job.id });
      }
      const { jobs } = await window.savaPlatform.publicRequest('listJobs');
      serverJobs = (jobs || []).map((job) => ({ ...job, posted: postedLabel(job.createdAt) }));
      serverJobsLoaded = true;
      return serverJobs;
    })().catch((error) => {
      console.warn('Live jobs unavailable.', error);
      serverJobs = [];
      serverJobsLoaded = true;
      return serverJobs;
    });
  }
  return serverJobsPromise;
}

function renderJobs(filter = '') {
  const root = $('#jobResults');
  if (!root) return;
  const checkedValues = (name) => [...document.querySelectorAll(`.filter-group[data-filter="${name}"] input:checked`)].map((input) => input.value);
  const arrangements = checkedValues('arrangement');
  const types = checkedValues('type');
  const matches = jobBoard().filter((job) => {
    const matchesSearch = `${job.title} ${job.company} ${job.description} ${(job.skills || []).join(' ')}`.toLowerCase().includes(filter.toLowerCase());
    const matchesArrangement = !arrangements.length || arrangements.includes(job.arrangement);
    const matchesType = !types.length || types.includes(job.type);
    return matchesSearch && matchesArrangement && matchesType;
  });
  $('#resultCount').textContent = matches.length;
  root.innerHTML = matches.map((job) => `<a class="job-card" href="./job-detail.html?job=${encodeURIComponent(job.id)}"><div class="job-card-top"><div class="job-company">${escapeHtml(job.initial)}</div><div><h2>${escapeHtml(job.title)}</h2><p class="company-name">${escapeHtml(job.company)}</p></div><span class="posted">${escapeHtml(job.posted)}</span></div><div class="job-tags"><span>${escapeHtml(job.arrangement)}</span><span>${escapeHtml(job.type)}</span><span>${escapeHtml(job.location)}</span></div><p>${escapeHtml(job.description)}</p><div class="job-card-footer"><b>${escapeHtml(job.pay)}</b><span>View job →</span></div></a>`).join('') || '<p class="no-results">No roles match that search.</p>';
}

async function bindJobs() {
  if (!$('#jobResults')) return;
  await loadServerJobs();
  renderJobs();
  $('#searchJobs').addEventListener('click', () => renderJobs($('#jobSearch').value));
  $('#jobSearch').addEventListener('input', (event) => renderJobs(event.target.value));
  document.querySelectorAll('.filters input[type="checkbox"]').forEach((input) => input.addEventListener('change', () => renderJobs($('#jobSearch').value)));
}

async function bindJobDetail() {
  if (!$('#detailTitle')) return;
  const id = new URLSearchParams(window.location.search).get('job');
  await loadServerJobs();
  const job = jobBoard().find((item) => item.id === id) || jobBoard()[0];
  if (!job) {
    $('#detailTitle').textContent = 'This role is no longer available';
    $('#showApplication').disabled = true;
    return;
  }
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
  if (questions) questions.innerHTML = job.questions.map((question) => {
    const normalized = normalizeQuestion(question);
    return `<li><span>${escapeHtml(normalized.text)}</span><small class="question-type-note">${normalized.type === 'multiple-choice' ? 'Multiple choice' : 'Written response'}</small></li>`;
  }).join('');
  $('#showApplication').addEventListener('click', async () => {
    sessionStorage.setItem('sava-applying-job', job.id);
    const applyButton = $('#showApplication');
    const applyHelp = applyButton.closest('.apply-card')?.querySelector('small');
    applyButton.disabled = true;
    applyButton.textContent = 'Checking profile…';
    try {
      const candidate = await window.getVerifiedCandidate?.();
      if (!candidate) {
        window.location.href = `./candidate-signup.html?job=${encodeURIComponent(job.id)}`;
        return;
      }
      const { profile } = await window.savaPlatform.candidateRequest('getProfile');
      const applicationDestination = `./application-questions.html?job=${encodeURIComponent(job.id)}`;
      const destination = profile?.resumePath
        ? applicationDestination
        : `./candidate-resume.html?next=${encodeURIComponent(applicationDestination)}`;
      window.location.href = destination;
    } catch (error) {
      applyButton.disabled = false;
      applyButton.innerHTML = 'Apply with resume <span>→</span>';
      if (applyHelp) applyHelp.textContent = error.message || 'Your candidate profile could not be checked. Try again.';
    }
  });
}

function questionsForCandidate(job) {
  const liveJob = applicantJobsById.get(job);
  if (liveJob) return (liveJob.questions || []).map(questionText).filter(Boolean);
  if (job === 'current') {
    const savedQuestions = read().questions.map(questionText).filter(Boolean);
    return savedQuestions.length ? savedQuestions : sampleQuestions.map(questionText);
  }
  if (job === 'operations') return ['How have you kept an operations leader organised?', 'How do you follow up across multiple departments?', 'Describe a process you improved without being asked.'];
  return ['How have you supported a customer-facing leader?', 'How do you track customer commitments and risks?', 'Describe a customer process you improved proactively.'];
}

async function bindApplicants() {
  const candidateList = $('#candidateList');
  if (!candidateList) return;
  let dashboard = null;
  let dashboardError = '';
  try {
    if (!window.savaPlatform) throw new Error('The hiring service did not load.');
    const savedRole = read();
    if (savedRole.published && !savedRole.serverJobId && window.savaPlatform) {
      const { job } = await window.savaPlatform.employerRequest('createJob', {
        companyName: savedRole.company || 'Your company',
        title: savedRole.title,
        description: savedRole.description,
        arrangement: savedRole.arrangement,
        employmentType: savedRole.commitment.split(' (')[0],
        location: savedRole.location,
        payMin: Number(savedRole.minRate),
        payMax: Number(savedRole.maxRate),
        questions: savedRole.questions,
        responsibilities: savedRole.responsibilities || [],
        skills: savedRole.skills || [],
        promoted: savedRole.promote,
        promotionBudget: Number(savedRole.promotionBudget || 0),
      });
      write({ serverJobId: job.id });
    }
    dashboard = await window.savaPlatform?.employerRequest('employerDashboard', { companyName: read().company || 'Your company' });
    applicantJobsById = new Map((dashboard?.jobs || []).map((job) => [String(job.id), job]));
    if (dashboard) {
      $('#jobOptions').innerHTML = `<button class="selected" type="button" role="option" aria-selected="true" data-job="all">All active jobs</button>${(dashboard.jobs || []).map((job) => `<button type="button" role="option" aria-selected="false" data-job="${escapeHtml(job.id)}">${escapeHtml(job.title)}</button>`).join('')}`;
    }
    if (dashboard) {
      candidateList.querySelectorAll('.simple-candidate').forEach((candidate) => candidate.remove());
      const rows = (dashboard.applications || []).map((application) => {
        const candidate = application.candidate;
        const answers = application.answers || [];
        const photo = candidate.photoUrl || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&h=240&q=75';
        const years = Number(candidate.relevantYears || 0);
        return `<button class="simple-candidate" data-application-id="${escapeHtml(application.id)}" data-job="${escapeHtml(application.jobId)}" data-status="${escapeHtml(application.status)}" data-name="${escapeHtml(candidate.name)}" data-role="${escapeHtml(application.job.title)}" data-experience="${years} years experience" data-match="${Number(application.match || 0)}" data-summary="${escapeHtml(candidate.summary)}" data-photo="${escapeHtml(photo)}" data-resume="${escapeHtml(candidate.resumeUrl || '')}" data-resume-name="${escapeHtml(candidate.resumeFileName || '')}" data-answers="${escapeHtml(JSON.stringify(answers))}" data-answer1="${escapeHtml(answers[0]?.answer || '')}" data-answer2="${escapeHtml(answers[1]?.answer || '')}" data-answer3="${escapeHtml(answers[2]?.answer || '')}"><img src="${escapeHtml(photo)}" alt="" /><span class="candidate-identity"><b>${escapeHtml(candidate.name)}</b><small>${escapeHtml(application.job.title)} · ${years} years</small></span><span class="candidate-overview">${escapeHtml(candidate.summary)}</span><strong class="match-badge">${Number(application.match || 0)}% match</strong><span class="candidate-arrow" aria-hidden="true">→</span></button>`;
      }).join('');
      candidateList.insertAdjacentHTML('afterbegin', rows);
    }
  } catch (error) {
    console.warn('Live hiring inbox unavailable.', error);
    dashboardError = error.message || 'The hiring inbox could not connect.';
    dashboard = { jobs: [], applications: [] };
    candidateList.querySelectorAll('.simple-candidate').forEach((candidate) => candidate.remove());
  }
  candidateList.classList.remove('server-loading');
  const requestedJob = new URLSearchParams(window.location.search).get('job');
  const candidates = [...document.querySelectorAll('.simple-candidate')];
  if (!candidates.length) {
    const requestedJobOption = requestedJob ? document.querySelector(`#jobOptions [data-job="${CSS.escape(requestedJob)}"]`) : null;
    if (requestedJobOption) {
      $('#selectedJobLabel').textContent = requestedJobOption.textContent;
      document.querySelectorAll('#jobOptions [data-job]').forEach((option) => {
        const selected = option === requestedJobOption;
        option.classList.toggle('selected', selected);
        option.setAttribute('aria-selected', String(selected));
      });
    }
    ['allCandidateCount', 'newCandidateCount', 'shortlistedCandidateCount', 'interviewingCandidateCount'].forEach((id) => { $(`#${id}`).textContent = '0'; });
    $('#applicantResultSummary').textContent = '0 applicants';
    $('#candidateEmpty').textContent = dashboardError || 'No applications yet. New applications will appear here as soon as candidates submit them.';
    $('#candidateEmpty').hidden = false;
    $('#headerMessages').addEventListener('click', () => {
      $('#messagePanel').hidden = false;
      document.body.classList.add('messages-open');
      $('#conversationList').innerHTML = '';
      $('#conversationEmpty').hidden = false;
      $('#messageThread').innerHTML = '<p class="message-empty">No conversations yet. Candidate messages will appear here.</p>';
      $('#messageForm').hidden = true;
    });
    $('#messagePanel').querySelectorAll('[data-close-messages]').forEach((button) => button.addEventListener('click', () => {
      $('#messagePanel').hidden = true;
      document.body.classList.remove('messages-open');
    }));
    if (new URLSearchParams(window.location.search).get('view') === 'messages') $('#headerMessages').click();
    return;
  }
  const filter = $('#jobFilter');
  const jobCombobox = $('#jobCombobox');
  const jobDropdown = $('#jobDropdown');
  const jobDropdownButton = $('#jobDropdownButton');
  const selectedJobLabel = $('#selectedJobLabel');
  const jobOptions = [...document.querySelectorAll('#jobOptions [data-job]')];
  const pipelineButtons = [...document.querySelectorAll('.simple-pipeline [data-status]')];
  const applicantSort = $('#applicantSort');
  const questionSort = $('#questionSort');
  const questionSortControl = $('#questionSortControl');
  const profilePanel = $('#profilePanel');
  const messagePanel = $('#messagePanel');
  const conversationList = $('#conversationList');
  const conversationSearch = $('#conversationSearch');
  const messageThread = $('#messageThread');
  const messageForm = $('#messageForm');
  const messageBody = $('#messageBody');
  const messageStatus = $('#messageStatus');
  let selectedCandidate = null;
  let selectedJob = 'all';
  let activeStatus = 'all';
  let pendingInterviewCandidate = null;
  const questionScores = {
    'Lerato Mokoena': [96, 91, 78],
    'Ayanda Khumalo': [90, 94, 85],
    'Zinhle Ndlovu': [88, 92, 95],
    'Thandi Jacobs': [84, 89, 93],
  };
  const currentJobTitle = read().published ? read().title : 'Your newest role';
  const newestOption = document.querySelector('#jobOptions [data-job="current"]');
  if (newestOption) newestOption.textContent = currentJobTitle;
  candidates.forEach((candidate) => {
    const roleName = candidate.dataset.job === 'current' ? currentJobTitle : candidate.dataset.role;
    const years = candidate.dataset.experience.match(/\d+/)?.[0] || candidate.dataset.experience;
    candidate.dataset.experience = `${years} years relevant experience`;
    candidate.querySelector('.candidate-identity small').textContent = `${roleName} · ${years} years relevant`;
  });

  function candidateStatusKey(candidate) {
    return `sava-candidate-status:${candidate.dataset.job}:${candidate.dataset.name}`;
  }

  function candidateStatus(candidate) {
    return candidate.dataset.applicationId ? candidate.dataset.status || 'new' : localStorage.getItem(candidateStatusKey(candidate)) || candidate.dataset.status || 'new';
  }

  async function setCandidateStatus(candidate, status) {
    if (candidate.dataset.applicationId && window.savaPlatform) {
      await window.savaPlatform.employerRequest('updateApplication', { applicationId: candidate.dataset.applicationId, status });
      candidate.dataset.status = status;
      return;
    }
    localStorage.setItem(candidateStatusKey(candidate), status);
  }

  function matchesJobSearch(candidate) {
    return selectedJob === 'all' || candidate.dataset.job === selectedJob;
  }

  function selectedJobKey() {
    return selectedJob;
  }

  function setJobDropdown(open) {
    jobDropdown.hidden = !open;
    jobDropdownButton.setAttribute('aria-expanded', String(open));
    if (open) {
      filter.value = '';
      jobOptions.forEach((option) => { option.hidden = false; });
      $('#jobSearchEmpty').hidden = true;
      filter.focus();
    }
  }

  function chooseJob(option) {
    selectedJob = option.dataset.job;
    selectedJobLabel.textContent = option.textContent;
    jobOptions.forEach((item) => {
      const selected = item === option;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-selected', String(selected));
    });
    setJobDropdown(false);
    refreshQuestionPicker();
    applyFilter();
  }

  function refreshQuestionPicker() {
    const job = selectedJobKey();
    const questions = job && job !== 'all' ? questionsForCandidate(job) : [];
    const previous = questionSort.value;
    questionSort.innerHTML = questions.length
      ? questions.map((question, index) => `<option value="${index}">${escapeHtml(question)}</option>`).join('')
      : '<option value="">Choose a specific job first</option>';
    questionSort.disabled = !questions.length;
    if (questions.some((_, index) => String(index) === previous)) questionSort.value = previous;
    questionSortControl.hidden = applicantSort.value !== 'question';
  }

  function sortValue(candidate) {
    if (applicantSort.value === 'experience') return Number(candidate.dataset.experience.match(/\d+/)?.[0] || 0);
    if (applicantSort.value === 'question' && questionSort.value !== '') {
      return questionScores[candidate.dataset.name]?.[Number(questionSort.value)] || Number(candidate.dataset.match) || 0;
    }
    return Number(candidate.dataset.match);
  }

  function candidateAnswers(candidate) {
    try {
      const answers = JSON.parse(candidate.dataset.answers || '[]');
      if (Array.isArray(answers) && answers.length) return answers;
    } catch { /* Use the legacy preview answers below. */ }
    return [1, 2, 3].map((number) => ({ question: questionsForCandidate(candidate.dataset.job)[number - 1] || `Question ${number}`, answer: candidate.dataset[`answer${number}`] || '' })).filter((answer) => answer.answer);
  }

  function sortAndPreviewCandidates() {
    const sortMode = applicantSort.value;
    const questionReady = sortMode === 'question' && questionSort.value !== '';
    const questionNumber = Number(questionSort.value || 0) + 1;
    candidateList.dataset.sort = questionReady ? 'question' : sortMode === 'question' ? 'match' : sortMode;
    candidates.forEach((candidate) => {
      const overview = candidate.querySelector('.candidate-overview');
      const badge = candidate.querySelector('.match-badge');
      if (questionReady) {
        overview.textContent = candidateAnswers(candidate)[questionNumber - 1]?.answer || 'No answer submitted.';
        badge.textContent = `${sortValue(candidate)}% answer fit`;
      } else if (sortMode === 'experience') {
        overview.textContent = candidate.dataset.summary;
        badge.textContent = `${sortValue(candidate)} yrs`;
      } else {
        overview.textContent = candidate.dataset.summary;
        badge.textContent = `${candidate.dataset.match}% match`;
      }
    });
    [...candidates]
      .sort((a, b) => sortValue(b) - sortValue(a) || Number(b.dataset.match) - Number(a.dataset.match))
      .forEach((candidate) => candidateList.insertBefore(candidate, $('#candidateEmpty')));
  }

  function messagingIdentity() {
    try {
      const saved = JSON.parse(localStorage.getItem(messagingIdentityKey) || 'null');
      if (saved?.employerId && saved?.editToken) return saved;
    } catch { /* Create a fresh identity below. */ }
    const randomId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const identity = { employerId: randomId(), editToken: `${randomId()}${randomId()}` };
    localStorage.setItem(messagingIdentityKey, JSON.stringify(identity));
    return identity;
  }

  const employerIdentity = messagingIdentity();

  function candidateMessageKey(candidate) {
    if (candidate.dataset.applicationId) return `application:${candidate.dataset.applicationId}`;
    return `${candidate.dataset.job}:${candidate.dataset.name}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
  }

  async function messageRequest(action, candidate, extra = {}) {
    const response = await fetch(candidateMessagesEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        employerId: employerIdentity.employerId,
        editToken: employerIdentity.editToken,
        candidateKey: candidateMessageKey(candidate),
        candidateName: candidate.dataset.name,
        roleName: candidate.dataset.role,
        ...extra,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Messages could not connect.');
    return payload;
  }

  function renderMessages(messages) {
    if (!messages.length) {
      messageThread.innerHTML = '<p class="message-empty">No messages yet. Start the conversation below.</p>';
      return;
    }
    messageThread.innerHTML = messages.map((message) => `<article class="message-bubble ${message.sender === 'candidate' ? 'candidate' : 'employer'}"><p>${escapeHtml(message.body)}</p><time>${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.createdAt))}</time></article>`).join('');
    messageThread.scrollTop = messageThread.scrollHeight;
  }

  function renderConversationList() {
    const query = conversationSearch.value.trim().toLowerCase();
    const visibleCandidates = candidates.filter((candidate) => `${candidate.dataset.name} ${candidate.dataset.role}`.toLowerCase().includes(query));
    conversationList.innerHTML = visibleCandidates.map((candidate) => {
      const index = candidates.indexOf(candidate);
      const roleName = candidate.dataset.job === 'current' ? currentJobTitle : candidate.dataset.role;
      return `<button class="conversation-item${candidate === selectedCandidate ? ' active' : ''}" type="button" data-candidate-index="${index}"><img src="${escapeHtml(candidate.dataset.photo)}" alt="" /><span><b>${escapeHtml(candidate.dataset.name)}</b><small>${escapeHtml(roleName)}</small></span></button>`;
    }).join('');
    $('#conversationEmpty').hidden = visibleCandidates.length > 0;
  }

  async function openMessages(candidate, draft = '') {
    if (!candidate) return;
    selectedCandidate = candidate;
    renderConversationList();
    $('#messagePanelTitle').textContent = candidate.dataset.name;
    $('#messagePanelRole').textContent = candidate.dataset.job === 'current' ? currentJobTitle : candidate.dataset.role;
    messagePanel.hidden = false;
    document.body.classList.add('messages-open');
    messageThread.innerHTML = '<p class="message-empty">Loading conversation…</p>';
    messageStatus.textContent = '';
    messageBody.value = draft;
    try {
      const { messages } = await messageRequest('list', candidate);
      renderMessages(messages || []);
      messageBody.focus();
    } catch (error) {
      messageThread.innerHTML = `<p class="message-empty error">${escapeHtml(error.message)}</p>`;
    }
  }

  function closeMessages() {
    messagePanel.hidden = true;
    document.body.classList.remove('messages-open');
    messageStatus.textContent = '';
    pendingInterviewCandidate = null;
  }

  function schedulerLink(candidate) {
    const defaults = { eventName: 'Intro interview', duration: '30', timezone: 'America/New_York', location: 'Google Meet link sent after booking', calendlyUrl: '', availability: [{ day: 1, start: '09:00', end: '17:00' }, { day: 2, start: '09:00', end: '17:00' }, { day: 3, start: '09:00', end: '17:00' }, { day: 4, start: '09:00', end: '17:00' }, { day: 5, start: '09:00', end: '15:00' }] };
    let config = defaults;
    let identity = null;
    try { config = { ...defaults, ...JSON.parse(localStorage.getItem('sava-scheduler-config') || '{}') }; } catch { /* Use defaults. */ }
    try { identity = JSON.parse(localStorage.getItem('sava-scheduler-identity') || 'null'); } catch { /* The settings page will create an identity. */ }
    if (/^https:\/\/(?:www\.)?calendly\.com\//i.test(config.calendlyUrl || '')) return config.calendlyUrl;
    if (!identity?.schedulerId || !identity.saved) return '';
    const origin = window.location.protocol === 'file:' ? 'https://www.hirefromsa.com' : window.location.origin;
    const url = new URL('/schedule-interview.html', origin);
    url.searchParams.set('scheduler', identity.schedulerId);
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

  function updateProfileActions(candidate) {
    const status = candidateStatus(candidate);
    const shortlistButton = $('#shortlist');
    const inviteButton = $('#inviteInterview');
    shortlistButton.hidden = status === 'interviewing';
    shortlistButton.disabled = status === 'shortlisted';
    shortlistButton.textContent = status === 'shortlisted' ? 'Shortlisted ✓' : 'Shortlist candidate';
    inviteButton.hidden = status === 'new';
    inviteButton.disabled = status === 'interviewing';
    inviteButton.textContent = status === 'interviewing' ? 'Interview invited ✓' : 'Invite to interview';
  }

  function openProfile(candidate) {
    selectedCandidate = candidate;
    const roleName = candidate.dataset.job === 'current' && read().published ? read().title : candidate.dataset.role;
    const questions = questionsForCandidate(candidate.dataset.job);
    $('#profilePhoto').src = candidate.dataset.photo;
    $('#profilePhoto').alt = candidate.dataset.name;
    $('#profileName').textContent = candidate.dataset.name;
    $('#profileRole').textContent = roleName;
    $('#profileExperience').textContent = candidate.dataset.experience;
    $('#profileMatch').textContent = `${candidate.dataset.match}% match`;
    $('#profileSummary').textContent = candidate.dataset.summary;
    const resumeSection = $('#profileResumeSection');
    const hasResume = Boolean(candidate.dataset.resume);
    resumeSection.hidden = !hasResume;
    if (hasResume) {
      $('#profileResume').href = candidate.dataset.resume;
      $('#profileResumeName').textContent = candidate.dataset.resumeName || 'Candidate resume';
    }
    const answers = candidateAnswers(candidate);
    const answersSection = $('#profileAnswersSection');
    answersSection.hidden = !answers.length;
    $('#profileAnswers').innerHTML = questions.map((question, index) => `<article class="answer-card"><b>${escapeHtml(question)}</b><p>${escapeHtml(answers[index]?.answer || 'No answer submitted.')}</p></article>`).join('');
    updateProfileActions(candidate);
    profilePanel.hidden = false;
    document.body.classList.add('profile-open');
    profilePanel.querySelector('[data-close-profile]').focus();
  }

  function closeProfile() {
    profilePanel.hidden = true;
    document.body.classList.remove('profile-open');
  }

  function updateCounts() {
    const statuses = candidates
      .filter(matchesJobSearch)
      .map(candidateStatus);
    $('#allCandidateCount').textContent = statuses.filter((status) => status !== 'rejected').length;
    $('#newCandidateCount').textContent = statuses.filter((status) => status === 'new').length;
    $('#shortlistedCandidateCount').textContent = statuses.filter((status) => status === 'shortlisted').length;
    $('#interviewingCandidateCount').textContent = statuses.filter((status) => status === 'interviewing').length;
  }

  function applyFilter() {
    sortAndPreviewCandidates();
    let visibleCount = 0;
    candidates.forEach((candidate) => {
      const status = candidateStatus(candidate);
      const matchesStatus = activeStatus === 'all' ? status !== 'rejected' : status === activeStatus;
      const visible = matchesJobSearch(candidate) && matchesStatus;
      candidate.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    $('#candidateEmpty').hidden = visibleCount > 0;
    const needsQuestion = applicantSort.value === 'question' && questionSort.value === '';
    const sortLabel = applicantSort.value === 'experience' ? 'most experience' : applicantSort.value === 'question' ? 'strongest answer' : 'best match';
    $('#applicantResultSummary').textContent = needsQuestion
      ? `${visibleCount} applicant${visibleCount === 1 ? '' : 's'} · choose a specific job`
      : `${visibleCount} applicant${visibleCount === 1 ? '' : 's'} · ${sortLabel} first`;
    updateCounts();
  }

  candidates.forEach((candidate) => candidate.addEventListener('click', () => openProfile(candidate)));
  conversationSearch.addEventListener('input', renderConversationList);
  conversationList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-candidate-index]');
    if (!button) return;
    openMessages(candidates[Number(button.dataset.candidateIndex)]);
  });
  jobDropdownButton.addEventListener('click', () => setJobDropdown(jobDropdown.hidden));
  filter.addEventListener('input', () => {
    const query = filter.value.trim().toLowerCase();
    let visibleCount = 0;
    jobOptions.forEach((option) => {
      const visible = option.textContent.toLowerCase().includes(query);
      option.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    $('#jobSearchEmpty').hidden = visibleCount > 0;
  });
  jobOptions.forEach((option) => option.addEventListener('click', () => chooseJob(option)));
  document.addEventListener('click', (event) => {
    if (!jobCombobox.contains(event.target)) setJobDropdown(false);
  });
  jobCombobox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !jobDropdown.hidden) {
      setJobDropdown(false);
      jobDropdownButton.focus();
    }
  });
  applicantSort.addEventListener('change', () => {
    refreshQuestionPicker();
    applyFilter();
  });
  questionSort.addEventListener('change', applyFilter);
  pipelineButtons.forEach((button) => button.addEventListener('click', () => {
    activeStatus = button.dataset.status;
    pipelineButtons.forEach((item) => item.classList.toggle('selected', item === button));
    closeProfile();
    applyFilter();
  }));
  $('#headerMessages').addEventListener('click', () => openMessages(selectedCandidate || candidates.find((candidate) => !candidate.hidden) || candidates[0]));
  $('#messageCandidate').addEventListener('click', () => openMessages(selectedCandidate));
  $('#inviteInterview').addEventListener('click', () => {
    if (!selectedCandidate || candidateStatus(selectedCandidate) !== 'shortlisted') return;
    const link = schedulerLink(selectedCandidate);
    const isCalendly = /^https:\/\/(?:www\.)?calendly\.com\//i.test(link);
    const schedulingPrompt = link
      ? `Please choose a time here:\n${link}`
      : 'Please reply with a few times that work well for you, and we will confirm the interview time.';
    pendingInterviewCandidate = selectedCandidate;
    openMessages(selectedCandidate, `Hi ${selectedCandidate.dataset.name.split(' ')[0]},\n\nWe'd like to invite you to an interview for the ${selectedCandidate.dataset.role} role. ${schedulingPrompt}\n\nLooking forward to speaking with you.`);
    toast(`${link ? (isCalendly ? 'Calendly' : 'Booking') : 'Interview'} invitation ready to send`);
  });
  messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedCandidate || !messageForm.reportValidity()) return;
    const body = messageBody.value.trim();
    if (!body) return;
    const button = messageForm.querySelector('button[type="submit"]');
    button.disabled = true;
    messageStatus.textContent = 'Sending…';
    try {
      const { messages } = await messageRequest('send', selectedCandidate, { body });
      renderMessages(messages || []);
      messageBody.value = '';
      messageStatus.textContent = 'Sent just now.';
      if (pendingInterviewCandidate === selectedCandidate) {
        await setCandidateStatus(selectedCandidate, 'interviewing');
        pendingInterviewCandidate = null;
        updateProfileActions(selectedCandidate);
        applyFilter();
        toast('Interview invitation sent');
      }
    } catch (error) {
      messageStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  messagePanel.querySelectorAll('[data-close-messages]').forEach((button) => button.addEventListener('click', closeMessages));
  profilePanel.querySelectorAll('[data-close-profile]').forEach((button) => button.addEventListener('click', closeProfile));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!messagePanel.hidden) closeMessages();
    else if (!profilePanel.hidden) closeProfile();
  });
  $('#shortlist').addEventListener('click', async () => {
    if (!selectedCandidate || candidateStatus(selectedCandidate) !== 'new') return;
    try {
      await setCandidateStatus(selectedCandidate, 'shortlisted');
      updateProfileActions(selectedCandidate);
      applyFilter();
      toast('Candidate moved to Shortlisted');
    } catch (error) {
      toast(error.message || 'Candidate status could not be updated');
    }
  });
  $('#rejectCandidate').addEventListener('click', async () => {
    if (!selectedCandidate) return;
    try {
      await setCandidateStatus(selectedCandidate, 'rejected');
      closeProfile();
      applyFilter();
      toast('Candidate removed from the inbox');
    } catch (error) {
      toast(error.message || 'Candidate status could not be updated');
    }
  });
  const requestedJobOption = requestedJob ? jobOptions.find((option) => option.dataset.job === requestedJob) : null;
  if (requestedJobOption) chooseJob(requestedJobOption);
  else {
    refreshQuestionPicker();
    applyFilter();
  }
  if (new URLSearchParams(window.location.search).get('view') === 'messages') $('#headerMessages').click();
}

hydrateRoleContent();
bindPostJob();
bindCompensation();
bindPublish();
bindApplicants();
bindJobs();
bindJobDetail();

window.savaJobBoard = jobBoard;
window.savaLoadJobs = loadServerJobs;
window.savaEscapeHtml = escapeHtml;
window.savaNormalizeQuestion = normalizeQuestion;
