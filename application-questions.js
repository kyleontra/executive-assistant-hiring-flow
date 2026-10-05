// Apply v2: the candidate confirms the job, bids a rate (preferred + accepted range), writes a one-sentence intro
// (sent to the hirer as the first message) and answers any hirer questions. Every rate here is what the candidate is paid.
const form = document.querySelector('#questionsForm');
const result = document.querySelector('#applicationResult');
const submitButton = document.querySelector('#submitApplication');
const bidRate = document.querySelector('#bidRate');
const bidMin = document.querySelector('#bidMin');
const bidMax = document.querySelector('#bidMax');
const intro = document.querySelector('#introMessage');
let candidate = null;
let job = null;
let profile = null;
let introPrefix = '';

// Localhost-only preview (?demo): a sample job, no sign-in, and submitting sends nothing.
const applicationDemo = ['localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).has('demo');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function money(value) {
  const number = Number(value);
  return `$${Number.isInteger(number) ? number.toLocaleString('en-US') : number.toFixed(2)}`;
}

function period() { return job?.payPeriod === 'month' ? 'month' : 'hour'; }

function normalizedQuestions() {
  return (Array.isArray(job?.questions) ? job.questions : []).map((question) => {
    const normalized = typeof question === 'string' ? { text: question, type: 'text', options: [] } : question;
    return {
      text: String(normalized?.text || '').trim(),
      type: normalized?.type === 'multiple-choice' ? 'multiple-choice' : 'text',
      options: Array.isArray(normalized?.options) ? normalized.options.map((option) => String(option).trim()).filter(Boolean) : [],
    };
  }).filter((question) => question.text);
}

function renderQuestions() {
  const questions = normalizedQuestions();
  document.querySelector('#applicationQuestions').hidden = !questions.length;
  // Number the visible steps: Introduce yourself, (questions), Bid on the job.
  [...document.querySelectorAll('.ab-section')].filter((section) => !section.hidden).forEach((section, index) => {
    section.querySelector('[data-step-number]').textContent = String(index + 1);
  });
  document.querySelector('#applicationQuestionList').innerHTML = questions.map((question, index) => {
    const prompt = `<span class="ab-q-number">${index + 1}</span>${escapeHtml(question.text)}`;
    if (question.type === 'multiple-choice') {
      const options = question.options.map((option, optionIndex) => `<label class="ab-option"><input type="radio" name="answer-${index}" value="${escapeHtml(option)}" ${optionIndex === 0 ? 'required' : ''} /><span>${escapeHtml(option)}</span></label>`).join('');
      return `<div class="ab-question"><fieldset><legend>${prompt}</legend><div class="ab-options">${options}</div></fieldset></div>`;
    }
    return `<div class="ab-question"><label for="answer-${index}">${prompt}</label><textarea id="answer-${index}" name="answer-${index}" maxlength="2000" required placeholder="Write your answer"></textarea></div>`;
  }).join('');
}

function collectAnswers() {
  return normalizedQuestions().map((question, index) => {
    const selected = form.elements.namedItem(`answer-${index}`);
    const answer = selected instanceof RadioNodeList ? selected.value : selected?.value || '';
    return { question: question.text, answer: String(answer).trim() };
  });
}

function showResult(message, type) {
  result.textContent = message;
  result.hidden = false;
  result.className = `ab-status ${type}`;
}

function renderJob() {
  const typeHours = { 'Full-time': 'Full-time · 40 hrs/week', 'Part-time': 'Part-time · 20+ hrs/week', Contract: 'Contract · per project' };
  const timelineLabels = { ASAP: 'ASAP', 'Within 2 weeks': 'Within 2 weeks', 'More than 2 weeks': '2+ weeks', 'Within 1-2 weeks': 'In 1-2 weeks', 'Within the month': 'This month', 'Not urgently': 'Flexible' };
  document.title = `Apply: ${job.title} | Hire From SA`;
  document.querySelector('#applicationRole').textContent = job.title;
  document.querySelector('#applicationCompany').textContent = job.company || '';
  document.querySelector('#applicationPay').textContent = job.pay || 'Not listed';
  document.querySelector('#applicationType').textContent = typeHours[job.type] || job.type || 'Not listed';
  document.querySelector('#applicationTimeline').textContent = timelineLabels[job.hiringTimeline] || job.hiringTimeline || 'Open';
  document.querySelector('#rateRange').textContent = job.pay || 'the listed rate';
  document.querySelectorAll('.ab-period').forEach((element) => { element.textContent = `/ ${period()}`; });
  // Start the bid at the job's own range; the candidate adjusts from there.
  if (Number(job.payMin) > 0) bidMin.value = job.payMin;
  if (Number(job.payMax) > 0) { bidMax.value = job.payMax; bidRate.value = job.payMax; }
  const firstName = String(profile?.fullName || candidate?.user_metadata?.first_name || '').trim().split(/\s+/)[0] || 'Name';
  introPrefix = `Hi, my name is ${firstName}, and I think I would be a good fit for your role because `;
  intro.value = introPrefix;
  renderQuestions();
  updateSummary();
}

function readBid() {
  return { rate: Number(bidRate.value), min: Number(bidMin.value), max: Number(bidMax.value) };
}

function updateSummary() {
  document.querySelector('#introCount').textContent = String(intro.value.length);
  if (!document.querySelector('#bidSummary')) return;
  const bid = readBid();
  const per = `/ ${period()}`;
  const questions = normalizedQuestions().length;
  const lines = [
    bid.rate > 0 ? `Preferred rate: <b>${money(bid.rate)} ${per}</b>` : 'Preferred rate: <b>not set</b>',
    bid.min > 0 && bid.max > 0 ? `You'd accept: <b>${money(bid.min)} to ${money(bid.max)} ${per}</b>` : "You'd accept: <b>not set</b>",
    'These are the amounts you would be paid.',
    questions ? `${questions} question${questions === 1 ? '' : 's'} answered for the hirer` : '',
  ].filter(Boolean);
  document.querySelector('#bidSummary').innerHTML = lines.map((line) => `<li>${line}</li>`).join('');
}

function validateBid() {
  const bid = readBid();
  if (!(bid.rate > 0)) return { field: bidRate, message: 'Add your preferred rate.' };
  if (!(bid.min > 0) || !(bid.max > 0)) return { field: bid.min > 0 ? bidMax : bidMin, message: "Add the range you'd accept." };
  if (bid.min > bid.max) return { field: bidMax, message: 'The top of your range must be higher than the bottom.' };
  if (bid.rate < bid.min || bid.rate > bid.max) return { field: bidRate, message: "Your preferred rate should sit inside the range you'd accept." };
  const sentence = intro.value.trim();
  if (sentence.length <= introPrefix.trim().length + 10) return { field: intro, message: 'Finish your introduction sentence.' };
  return null;
}

async function initialize() {
  if (applicationDemo) {
    candidate = { email: 'demo.candidate@example.com', user_metadata: { first_name: 'Thandi' } };
    profile = { fullName: 'Thandi Jacobs', resumePath: 'demo', applicationReady: true };
    job = { id: 'demo-wedding', title: 'Wedding Video Editor', company: 'Ever After Films', status: 'active', type: 'Full-time', hiringTimeline: 'ASAP',
      pay: '$6–$8 / hour', payMin: 6, payMax: 8, payPeriod: 'hour',
      questions: [{ text: 'How many weddings have you edited?', type: 'text', options: [] }, { text: 'Share a link to a highlight film you edited.', type: 'text', options: [] }] };
    renderJob();
    submitButton.disabled = false;
    return;
  }
  candidate = await window.getVerifiedCandidate();
  const requestedJob = new URLSearchParams(window.location.search).get('job') || sessionStorage.getItem('sava-applying-job');
  if (!candidate) {
    window.location.replace(`./candidate-signup.html${requestedJob ? `?job=${encodeURIComponent(requestedJob)}` : ''}`);
    return;
  }

  let jobs;
  try {
    ({ jobs = [] } = await window.savaPlatform.viewerRequest('listJobs'));
  } catch (error) {
    showResult(error.message || 'This job could not be loaded. Return to your dashboard and try again.', 'error');
    return;
  }
  job = jobs.find((item) => item.id === requestedJob && item.status === 'active');
  if (!job) {
    form.hidden = true;
    showResult('This job is no longer available.', 'error');
    return;
  }
  sessionStorage.setItem('sava-applying-job', job.id);

  try {
    ({ profile } = await window.savaPlatform.candidateRequest('getProfile'));
  } catch (error) {
    showResult(error.message || 'Your candidate account could not be loaded.', 'error');
    return;
  }
  if (!profile?.resumePath) {
    const destination = `./application-questions.html?job=${encodeURIComponent(job.id)}`;
    window.location.replace(`./candidate-resume.html?next=${encodeURIComponent(destination)}`);
    return;
  }
  if (!profile.applicationReady) {
    window.location.replace(`./candidate-next-steps.html?job=${encodeURIComponent(job.id)}`);
    return;
  }
  renderJob();
  submitButton.disabled = false;
}

[bidRate, bidMin, bidMax, intro].forEach((input) => input.addEventListener('input', updateSummary));
// Keep the opening words of the intro in place so every first message starts the same way.
intro.addEventListener('input', () => {
  if (!intro.value.startsWith(introPrefix)) intro.value = introPrefix + intro.value.slice(introPrefix.length).trimStart();
  updateSummary();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!candidate || !job || submitButton.disabled) return;
  const problem = validateBid();
  if (problem) {
    problem.field.focus();
    showResult(problem.message, 'error');
    return;
  }
  result.hidden = true;
  if (!form.reportValidity()) return;
  if (applicationDemo) {
    // Demo: go to the real "applied" page without sending anything.
    sessionStorage.setItem('hfsa-last-application', JSON.stringify({ title: job.title, company: job.company }));
    window.location.href = './applied.html?demo';
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = 'Sending your application…';
  const bid = readBid();
  try {
    await window.savaPlatform.candidateRequest('submitApplication', {
      jobId: job.id,
      fullName: profile.fullName || `${candidate.user_metadata?.first_name || ''} ${candidate.user_metadata?.last_name || ''}`.trim(),
      calendarLink: profile.calendarLink || candidate.user_metadata?.calendar_link || '',
      answers: collectAnswers(),
      bidRate: bid.rate,
      bidMin: bid.min,
      bidMax: bid.max,
      introMessage: intro.value.trim(),
    });
    sessionStorage.removeItem('sava-applying-job');
    sessionStorage.setItem('hfsa-last-application', JSON.stringify({ title: job.title, company: job.company || '' }));
    window.location.href = `./applied.html?job=${encodeURIComponent(job.id)}`;
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Apply <span aria-hidden="true">→</span>';
    showResult(error.message || 'Your application could not be sent.', 'error');
  }
});

initialize().catch((error) => {
  submitButton.disabled = true;
  showResult(error.message || 'Your account could not be loaded. Refresh the page and try again.', 'error');
});
