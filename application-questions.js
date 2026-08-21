const form = document.querySelector('#questionsForm');
const result = document.querySelector('#applicationResult');
const submitButton = document.querySelector('#submitApplication');
let candidate = null;
let job = null;
let profile = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

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
  const section = document.querySelector('#applicationQuestions');
  const list = document.querySelector('#applicationQuestionList');
  section.hidden = !questions.length;
  list.innerHTML = questions.map((question, index) => {
    const prompt = `<span class="application-question-number">${String(index + 1).padStart(2, '0')}</span>${escapeHtml(question.text)}`;
    if (question.type === 'multiple-choice') {
      const options = question.options.map((option, optionIndex) => `<label class="answer-option"><input type="radio" name="answer-${index}" value="${escapeHtml(option)}" ${optionIndex === 0 ? 'required' : ''} /><span>${escapeHtml(option)}</span></label>`).join('');
      return `<div class="application-question" data-question-index="${index}"><fieldset><legend>${prompt}</legend><div class="answer-options">${options}</div></fieldset></div>`;
    }
    return `<div class="application-question" data-question-index="${index}"><label for="answer-${index}">${prompt}</label><textarea id="answer-${index}" name="answer-${index}" maxlength="2000" required placeholder="Write your answer"></textarea></div>`;
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
  result.className = `status-box ${type}`;
}

async function initialize() {
  candidate = await window.getVerifiedCandidate();
  const requestedJob = new URLSearchParams(window.location.search).get('job') || sessionStorage.getItem('sava-applying-job');
  if (!candidate) {
    window.location.replace(`./candidate-signup.html${requestedJob ? `?job=${encodeURIComponent(requestedJob)}` : ''}`);
    return;
  }

  await window.savaLoadJobs?.();
  const jobs = window.savaJobBoard?.() || [];
  job = jobs.find((item) => item.id === requestedJob) || jobs[0];
  if (!job) {
    showResult('This job is no longer available.', 'error');
    submitButton.disabled = true;
    return;
  }

  sessionStorage.setItem('sava-applying-job', job.id);

  document.querySelector('#applicationRole').textContent = job.title;
  document.querySelector('#applicationCompany').textContent = job.company;
  renderQuestions();
  try {
    ({ profile } = await window.savaPlatform.candidateRequest('getProfile'));
  } catch (error) {
    showResult(error.message || 'Your candidate account could not be loaded.', 'error');
    submitButton.disabled = true;
    return;
  }

  if (!profile?.resumePath) {
    const destination = `./application-questions.html?job=${encodeURIComponent(job.id)}`;
    window.location.replace(`./candidate-resume.html?next=${encodeURIComponent(destination)}`);
    return;
  }

  document.querySelector('#authStatus').textContent = `Signed in as ${candidate.email}.`;
  document.querySelector('#authStatus').className = 'status-box success';
  document.querySelector('#applicationResumeName').textContent = profile.resumeFileName || 'Connected resume';
  const openResume = document.querySelector('#applicationOpenResume');
  openResume.hidden = !profile.resumeUrl;
  if (profile.resumeUrl) openResume.href = profile.resumeUrl;
  document.querySelector('#applicationResume').hidden = false;
  submitButton.disabled = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!candidate || !job || !profile?.resumePath || submitButton.disabled) return;
  if (!form.reportValidity()) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting application…';
  try {
    await window.savaPlatform.candidateRequest('submitApplication', {
      jobId: job.id,
      fullName: profile.fullName || `${candidate.user_metadata?.first_name || ''} ${candidate.user_metadata?.last_name || ''}`.trim(),
      calendarLink: profile.calendarLink || candidate.user_metadata?.calendar_link || '',
      answers: collectAnswers(),
    });
    sessionStorage.removeItem('sava-applying-job');
    form.hidden = true;
    document.querySelector('#authStatus').hidden = true;
    document.querySelector('#applicationComplete').hidden = false;
  } catch (error) {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit application <span>→</span>';
    showResult(error.message || 'Your application could not be submitted.', 'error');
  }
});

initialize();
