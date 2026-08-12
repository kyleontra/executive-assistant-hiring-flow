const form = document.querySelector('#questionsForm');
const questionRoot = document.querySelector('#applicationQuestions');
const result = document.querySelector('#applicationResult');
const submitButton = document.querySelector('#submitApplication');
let candidate = null;
let job = null;

function showResult(message, type) {
  result.textContent = message;
  result.hidden = false;
  result.className = `status-box ${type}`;
}

async function initialize() {
  candidate = await window.getVerifiedCandidate();
  if (!candidate) {
    document.querySelector('#authStatus').textContent = 'Your verified candidate session is missing. Verify your email before applying.';
    document.querySelector('#authStatus').className = 'status-box error';
    submitButton.disabled = true;
    return;
  }
  let savedProfile = null;
  try {
    ({ profile: savedProfile } = await window.savaPlatform.candidateRequest('getProfile'));
    if (savedProfile?.photoPath) sessionStorage.setItem(`sava:profile-photo:${candidate.id}`, savedProfile.photoPath);
    if (savedProfile?.experience?.length) sessionStorage.setItem(`sava:experience:${candidate.id}`, JSON.stringify(savedProfile.experience));
  } catch { /* The submit request below will show a server error if the profile cannot be loaded. */ }
  if (!sessionStorage.getItem(`sava:profile-photo:${candidate.id}`)) {
    window.location.replace('./candidate-profile.html');
    return;
  }
  const requestedJob = new URLSearchParams(window.location.search).get('job') || sessionStorage.getItem('sava-applying-job');
  await window.savaLoadJobs?.();
  const jobs = window.savaJobBoard?.() || [];
  job = jobs.find((item) => item.id === requestedJob) || jobs[0];
  if (!job) {
    showResult('This job is no longer available.', 'error');
    submitButton.disabled = true;
    return;
  }
  document.querySelector('#applicationRole').textContent = job.title;
  document.querySelector('#applicationCompany').textContent = job.company;
  document.querySelector('#authStatus').textContent = `Profile ready for ${candidate.email}.`;
  document.querySelector('#authStatus').className = 'status-box success';
  questionRoot.innerHTML = job.questions.map((question, index) => {
    const normalized = window.savaNormalizeQuestion(question);
    if (normalized.type === 'multiple-choice') {
      const options = normalized.options.map((option, optionIndex) => `<label class="choice-option"><input type="radio" name="answer${index + 1}" value="${window.savaEscapeHtml(option)}" ${optionIndex === 0 ? 'required' : ''} /><span>${window.savaEscapeHtml(option)}</span></label>`).join('');
      return `<fieldset class="question-field choice-question"><legend>${window.savaEscapeHtml(normalized.text)}</legend><small>Choose one answer</small><div class="choice-options">${options}</div></fieldset>`;
    }
    return `<label class="question-field">${window.savaEscapeHtml(normalized.text)}<textarea name="answer${index + 1}" maxlength="1000" required></textarea><small><span>0</span> / 1,000 characters</small></label>`;
  }).join('');
  questionRoot.querySelectorAll('textarea').forEach((textarea) => textarea.addEventListener('input', () => { textarea.nextElementSibling.querySelector('span').textContent = textarea.value.length; }));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!candidate || !job || !form.reportValidity()) {
    showResult('Answer every question before submitting your application.', 'error');
    return;
  }
  const answerDetails = job.questions.map((question, index) => {
    const normalized = window.savaNormalizeQuestion(question);
    const fieldName = `answer${index + 1}`;
    const answer = normalized.type === 'multiple-choice'
      ? form.querySelector(`input[name="${fieldName}"]:checked`)?.value || ''
      : form.elements[fieldName].value.trim();
    return { question: normalized.text, type: normalized.type, answer };
  });
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting application…';
  try {
    const experience = JSON.parse(sessionStorage.getItem(`sava:experience:${candidate.id}`) || '[]');
    await window.savaPlatform.candidateRequest('submitApplication', {
      jobId: job.id,
      answers: answerDetails,
      experience,
      photoPath: sessionStorage.getItem(`sava:profile-photo:${candidate.id}`) || '',
      fullName: `${candidate.user_metadata?.first_name || ''} ${candidate.user_metadata?.last_name || ''}`.trim(),
      calendarLink: candidate.user_metadata?.calendar_link || '',
    });
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
