// Hiring inbox v2: applicants on the left, the conversation and job match on the right.
const ibx = document.querySelector('#ibx');
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const ibxDemo = isLocalhost && new URLSearchParams(window.location.search).has('demo');
const ibxState = { applicants: [], jobs: [], activeId: '', job: 'all', sort: 'match', search: '' };

function ibxEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
// The applicant's profile picture, or their initials when there is none (or it fails to load).
function ibxAvatar(applicant) {
  const initials = ibxEscape(ibxInitials(applicant.name));
  return applicant.photo ? `<img src="${ibxEscape(applicant.photo)}" alt="" data-initials="${initials}" />` : initials;
}
document.addEventListener('error', (event) => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.closest('.ibx-avatar')) image.replaceWith(image.dataset.initials || '');
}, true);
function ibxInitials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SA';
}
function ibxPillClass(match) { return match >= 80 ? '' : match >= 65 ? 'mid' : 'low'; }

function ibxDemoData() {
  const job = { id: 'demo-wedding', title: 'Wedding Video Editor' };
  const socialJob = { id: 'demo-social', title: 'Social Media Video Editor' };
  const people = [
    ['Lerato Mokoena', 6, 94, 'new', '9:42 AM', ['Wedding films', 'Premiere Pro', 'Color grading', 'Audio sync', 'Highlight reels', 'Fast turnaround'], 'Six years editing wedding films for a Cape Town studio, about 40 weddings a season from full ceremony cuts to 3-minute highlight reels.', 'I have edited over 200 weddings in Premiere Pro, including color and audio. I usually deliver a highlight reel within 5 days.'],
    ['Sipho Dlamini', 5, 90, 'shortlisted', 'Yesterday', ['Wedding films', 'DaVinci Resolve', 'Color grading', 'Highlight reels', 'Audio sync'], 'Five years as a freelance wedding and event editor, strongest on cinematic color in DaVinci Resolve.', 'Most of my work is weddings for US and UK videographers. I can share three recent highlight films.'],
    ['Ayanda Khumalo', 4, 86, 'new', 'Yesterday', ['Wedding films', 'Premiere Pro', 'Highlight reels', 'Fast turnaround'], 'Four years editing wedding and engagement videos for a US-based videography team, mostly social-ready highlight edits.', 'I edit 4 to 6 weddings a month for an Atlanta studio and work US Eastern hours.'],
    ['Thandi Jacobs', 7, 82, 'interviewing', 'Oct 1', ['Premiere Pro', 'DaVinci Resolve', 'Color grading', 'Audio sync'], 'Seven years in commercial and corporate video editing; has edited a handful of weddings for friends and family.', 'My background is brand videos, but I have cut a few weddings and love the storytelling side.'],
    ['Nomvula Zulu', 3, 78, 'new', 'Oct 1', ['Wedding films', 'Premiere Pro', 'Audio sync'], 'Three years editing ceremony and reception footage for a Durban wedding photographer who added video.', 'I handle full ceremony edits with multi-camera audio sync. Still building my color grading skills.'],
    ['Kagiso Molefe', 4, 72, 'new', 'Sep 30', ['Premiere Pro', 'Highlight reels', 'Fast turnaround'], 'Four years editing short-form social content and event recaps for agencies.', 'I edit fast-turnaround event recaps every week, so 48-hour highlight reels are normal for me.'],
    ['Zinhle Ndlovu', 2, 68, 'shortlisted', 'Sep 30', ['Wedding films', 'Premiere Pro'], 'Two years assisting a wedding videographer with logging, rough cuts and music selection.', 'I have done rough cuts for about 30 weddings and want to move into full edits.'],
    ['Bongani Mthembu', 5, 61, 'new', 'Sep 29', ['DaVinci Resolve', 'Color grading'], 'Five years as a colorist on music videos and short films; no wedding editing yet.', 'Color is my specialty. I have not edited weddings but can grade a full film quickly.'],
    ['Palesa Naidoo', 3, 55, 'new', 'Sep 29', ['Premiere Pro'], 'Three years editing YouTube talking-head videos and podcasts.', 'I edit YouTube videos daily and am a quick learner on new styles.'],
    ['Andile Botha', 1, 42, 'new', 'Sep 28', ['Highlight reels'], 'One year making TikTok and Reels edits for a local restaurant group.', 'I make short highlight edits for social media and would love to learn wedding editing.'],
  ];
  const socialPeople = [
    ['Naledi Sithole', 4, 89, 'Sep 30', 'Four years editing Reels and TikToks for beauty and fashion brands.', 'I cut 20 to 30 short-form videos a week with captions and trending audio.'],
    ['Musa Ngcobo', 2, 71, 'Sep 29', 'Two years running a YouTube channel and editing Shorts for small businesses.', 'I can turn one long video into 10 Shorts in a day.'],
    ['Refilwe Mahlangu', 1, 58, 'Sep 28', 'One year of Canva and CapCut edits for a local gym.', 'I am newer to editing but very consistent with daily posting.'],
  ];
  const profileUrl = './candidate-public-profile.html?profile=0183ee4b22e341c3993b9eee1f8d3860&draft=nicola';
  const social = socialPeople.map(([name, years, match, time, summary, answer], index) => ({
    id: `demo-social-${index + 1}`, jobId: socialJob.id, jobTitle: socialJob.title, name, years, match, time, summary,
    unread: index === 0, profileUrl, messages: [{ from: 'candidate', label: 'Application', text: answer, time }],
  }));
  return {
    jobs: [job, socialJob],
    applicants: [...people.map(([name, years, match, status, time, has, summary, answer], index) => ({
      id: `demo-${index + 1}`,
      jobId: job.id,
      jobTitle: job.title,
      name, years, match, time,
      summary,
      unread: status === 'new' && index < 6,
      profileUrl,
      bid: { rate: [14, 13, 12, 11, 12, 10, 10, 11, 9, 9][index], min: [12, 11, 10, 10, 10, 9, 8, 9, 8, 8][index], max: 15, period: 'hour' },
      messages: [
        { from: 'candidate', label: 'Introduction', text: `Hi, my name is ${name.split(' ')[0]}, and I think I would be a good fit for your role because ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`, time },
        { from: 'candidate', label: 'How many weddings have you edited?', text: answer, time },
      ],
    })), ...social],
  };
}

async function ibxLiveData() {
  const dashboard = await window.savaPlatform.employerRequest('employerDashboard', {});
  const jobs = new Map((dashboard?.jobs || []).map((job) => [String(job.id), job]));
  const applicants = (dashboard?.applications || []).map((application) => {
    const candidate = application.candidate || {};
    const job = jobs.get(String(application.jobId)) || application.job || {};
    const answers = (application.answers || []).filter((item) => item && item.answer);
    return {
      id: String(application.id),
      name: candidate.name || 'Candidate',
      photo: candidate.photoUrl || '',
      years: Math.floor(Number(candidate.relevantYears || 0)),
      match: Number(application.match || 0),
      jobId: String(application.jobId || ''),
      time: application.submittedAt ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(application.submittedAt)) : '',
      summary: candidate.summary || '',
      jobTitle: job.title || '',
      unread: (application.status || 'new') === 'new',
      profileUrl: /^[0-9a-f]{32}$/.test(candidate.shareSlug || '') ? `./candidate-public-profile.html?profile=${candidate.shareSlug}` : '',
      bid: application.bid || null,
      messages: [
        ...(application.introMessage ? [{ from: 'candidate', label: 'Introduction', text: application.introMessage, time: '' }] : []),
        ...answers.map((item) => ({ from: 'candidate', label: item.question || 'Application', text: item.answer, time: '' })),
      ].concat(application.introMessage || answers.length ? [] : [{ from: 'candidate', label: 'Application', text: 'Applied with their resume.', time: '' }]),
    };
  });
  return { jobs: [...jobs.values()].map((job) => ({ id: String(job.id), title: job.title })), applicants };
}

function ibxVisible() {
  const term = ibxState.search.toLowerCase();
  return ibxState.applicants
    .filter((applicant) => ibxState.job === 'all' || applicant.jobId === ibxState.job)
    .filter((applicant) => !term || `${applicant.name} ${applicant.summary}`.toLowerCase().includes(term))
    .sort((a, b) => (ibxState.sort === 'az' ? a.name.localeCompare(b.name) : ibxState.sort === 'za' ? b.name.localeCompare(a.name) : b.match - a.match));
}

function ibxRenderList() {
  const list = document.querySelector('#ibxList');
  const visible = ibxVisible();
  document.querySelector('#ibxEmpty').hidden = visible.length > 0;
  list.innerHTML = visible.map((applicant) => {
    const last = applicant.messages[applicant.messages.length - 1];
    const preview = last.from === 'you' ? `You: ${last.text}` : last.text;
    return `<button class="ibx-item${applicant.id === ibxState.activeId ? ' active' : ''}${applicant.unread ? ' unread' : ''}" type="button" role="listitem" data-id="${ibxEscape(applicant.id)}">
      <span class="ibx-avatar" aria-hidden="true">${ibxAvatar(applicant)}</span>
      <b>${ibxEscape(applicant.name)}</b><time>${ibxEscape(last.time || applicant.time)}</time>
      <p><strong class="ibx-pill ${ibxPillClass(applicant.match)}" title="What's the match %? We compare this VA&#39;s work experience to the job you posted. The higher the number, the more experience they have doing this kind of work.">${applicant.match}% match</strong>${applicant.unread ? '<i class="ibx-dot" aria-label="Unread"></i>' : ''}<span>${ibxEscape(preview)}</span></p>
    </button>`;
  }).join('');
}

function ibxRenderThread() {
  const applicant = ibxState.applicants.find((item) => item.id === ibxState.activeId);
  const pane = document.querySelector('#ibxThread');
  pane.hidden = !applicant;
  if (!applicant) return;
  document.querySelector('#ibxAvatar').innerHTML = ibxAvatar(applicant);
  const name = document.querySelector('#ibxName');
  name.textContent = applicant.name;
  if (applicant.profileUrl) name.href = applicant.profileUrl; else name.removeAttribute('href');
  const viewProfile = document.querySelector('#ibxViewProfile');
  viewProfile.hidden = !applicant.profileUrl;
  if (applicant.profileUrl) viewProfile.href = applicant.profileUrl;
  document.querySelector('#ibxHeadline').textContent = `Applied to ${applicant.jobTitle || 'your job'}`;
  const score = document.querySelector('#ibxMatchScore');
  score.textContent = `${applicant.match}% match`;
  score.className = `ibx-pill ${ibxPillClass(applicant.match)}`;
  document.querySelector('#ibxYears').textContent = `${applicant.years} ${applicant.years === 1 ? 'year' : 'years'} relevant experience`;
  const bidLine = document.querySelector('#ibxBid');
  const money = (value) => `$${Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(2)}`;
  bidLine.hidden = !applicant.bid;
  if (applicant.bid) bidLine.innerHTML = `Bid <b>${money(applicant.bid.rate)} / ${applicant.bid.period}</b> <span>· would accept ${money(applicant.bid.min)}–${money(applicant.bid.max)}</span>`;
  document.querySelector('#ibxMatchSummary').textContent = applicant.summary;
  document.querySelector('#ibxMessages').innerHTML = applicant.messages.map((message) => `<div class="ibx-msg ${message.from === 'you' ? 'you' : ''}">${message.label ? `<span class="ibx-msg-label">${ibxEscape(message.label)}</span>` : ''}${ibxEscape(message.text)}${message.time ? `<small>${ibxEscape(message.time)}</small>` : ''}</div>`).join('');
  const messages = document.querySelector('#ibxMessages');
  messages.scrollTop = messages.scrollHeight;
}

function ibxSelect(id) {
  ibxState.activeId = id;
  const applicant = ibxState.applicants.find((item) => item.id === id);
  if (applicant) applicant.unread = false;
  ibx.classList.add('show-thread');
  ibxRenderList();
  ibxRenderThread();
}

async function ibxInit() {
  if (!ibx) return;
  let data;
  try {
    data = ibxDemo ? ibxDemoData() : await ibxLiveData();
  } catch (error) {
    data = { jobs: [], applicants: [] };
    document.querySelector('#ibxEmpty').textContent = error.message || 'The hiring inbox could not load.';
  }
  ibxState.applicants = data.applicants;
  ibxState.jobs = data.jobs || [];
  const counts = (jobId) => data.applicants.filter((applicant) => jobId === 'all' || applicant.jobId === jobId).length;
  document.querySelector('#ibxJob').innerHTML = `<option value="all">All active jobs (${counts('all')})</option>${ibxState.jobs.map((job) => `<option value="${ibxEscape(job.id)}">${ibxEscape(job.title)} (${counts(job.id)})</option>`).join('')}`;
  if (!ibxDemo) {
    const draft = document.querySelector('#ibxDraft');
    draft.disabled = true;
    draft.placeholder = 'Messaging from the inbox is coming soon.';
    document.querySelector('#ibxCompose button').disabled = true;
  }
  // Arriving from a published job (?job=<id>) opens Messages filtered to that job.
  const requestedJob = new URLSearchParams(window.location.search).get('job');
  if (requestedJob && ibxState.jobs.some((job) => job.id === requestedJob)) {
    ibxState.job = requestedJob;
    document.querySelector('#ibxJob').value = requestedJob;
  }
  ibxState.activeId = ibxVisible()[0]?.id || '';
  ibxRenderList();
  ibxRenderThread();
}

document.querySelector('#ibxList')?.addEventListener('click', (event) => {
  const item = event.target.closest('.ibx-item');
  if (item) ibxSelect(item.dataset.id);
});
document.querySelector('#ibxJob')?.addEventListener('change', (event) => {
  ibxState.job = event.target.value;
  if (!ibxVisible().some((applicant) => applicant.id === ibxState.activeId)) ibxState.activeId = ibxVisible()[0]?.id || '';
  ibxRenderList();
  ibxRenderThread();
});
document.querySelector('#ibxSort')?.addEventListener('change', (event) => { ibxState.sort = event.target.value; ibxRenderList(); });
document.querySelector('#ibxSearch')?.addEventListener('input', (event) => { ibxState.search = event.target.value; ibxRenderList(); });
document.querySelector('#ibxBack')?.addEventListener('click', () => ibx.classList.remove('show-thread'));
document.querySelector('#ibxCompose')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const draft = document.querySelector('#ibxDraft');
  const applicant = ibxState.applicants.find((item) => item.id === ibxState.activeId);
  if (!applicant || !draft.value.trim() || !ibxDemo) return;
  applicant.messages.push({ from: 'you', text: draft.value.trim(), time: 'Just now' });
  draft.value = '';
  ibxRenderList();
  ibxRenderThread();
});
document.querySelector('#ibxDraft')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.querySelector('#ibxCompose').requestSubmit(); }
});

ibxInit();
