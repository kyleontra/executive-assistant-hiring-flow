// Employer view of one of their own job listings. VAs use job-detail.html instead.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(window.location.search);
  const demo = ['localhost', '127.0.0.1'].includes(window.location.hostname) && params.get('preview') === '1';
  const jobId = params.get('job');
  const TYPE_HOURS = { 'Full-time': 'Full-time · 40 hrs/week', 'Part-time': 'Part-time · 20+ hrs/week', Contract: 'Contract · per project' };
  const TIMELINES = { ASAP: 'ASAP', 'Within 2 weeks': 'Within 2 weeks', 'More than 2 weeks': '2+ weeks', 'Within 1-2 weeks': 'In 1-2 weeks', 'Within the month': 'This month', 'Not urgently': 'Flexible' };

  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  // Same light formatting the description editor produces (**bold**, _italic_, bullet lines).
  function descriptionHtml(value) {
    const inline = (line) => escape(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<i>$2</i>');
    let html = '';
    let list = '';
    String(value || '').split('\n').forEach((line) => {
      const bullet = line.match(/^\s*(?:•|-|\d+\.)\s+(.*)$/);
      if (bullet) { list += `<li>${inline(bullet[1])}</li>`; return; }
      if (list) { html += `<ul>${list}</ul>`; list = ''; }
      if (line.trim()) html += `<p>${inline(line)}</p>`;
    });
    if (list) html += `<ul>${list}</ul>`;
    return html || '<p>You have not added a description yet.</p>';
  }
  const questionText = (question) => (typeof question === 'string' ? question : question?.text || '').trim();
  const postedDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : `Posted ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)}`;
  };
  const promotion = (job) => {
    const budget = Number(job.promotionBudget);
    if (!job.promoted || !(budget > 0)) return 'Not promoted';
    return `${budget === 5 ? 'Standard' : budget === 10 ? 'Premium' : 'Custom'} · $${budget}/day`;
  };

  function demoData() {
    const job = {
      id: 'demo-wedding', title: 'Wedding Video Editor', status: 'active', type: 'Contract', arrangement: 'Remote',
      pay: '$8–$15 / hour', hiringTimeline: 'ASAP', promoted: true, promotionBudget: 10, createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      description: 'We film 60+ weddings a year and need an editor who can turn raw footage into highlight films couples love.\n\n**What we offer**\n- Steady weekly work\n- Clear style guides and examples\n- Fast feedback from our lead editor',
      responsibilities: ['Edit 3 to 5 minute wedding highlight films', 'Color grade and sync multi-camera footage', 'Deliver final files within 7 days of receiving footage'],
      skills: ['Premiere Pro', 'DaVinci Resolve', 'Color grading', 'Audio sync'],
      questions: [{ text: 'Share a link to a wedding or event video you edited.' }, { text: 'How many hours a week can you work?' }],
    };
    const statuses = ['new', 'new', 'new', 'shortlisted', 'new', 'new', 'new', 'interviewing', 'new', 'shortlisted'];
    return { jobs: [job], applications: statuses.map((status, index) => ({ id: `a${index}`, jobId: job.id, status })) };
  }

  function render(job, applications) {
    const questions = (job.questions || []).map(questionText).filter(Boolean);
    const responsibilities = (job.responsibilities || []).filter(Boolean);
    const skills = (job.skills || []).filter(Boolean);
    const fresh = applications.filter((application) => (application.status || 'new') === 'new').length;
    const status = job.status === 'active' ? 'Active' : job.status === 'closed' ? 'Closed' : 'Draft';
    document.title = `${job.title} | Your job listing | Hire From SA`;
    $('#ejStatus').textContent = status;
    $('#ejStatus').className = `ej-pill ${escape(job.status || 'draft')}`;
    $('#ejPosted').textContent = postedDate(job.createdAt);
    $('#ejTitle').textContent = job.title;
    $('#ejPay').textContent = job.pay || 'Not listed';
    $('#ejType').textContent = TYPE_HOURS[job.type] || job.type || 'Not listed';
    $('#ejLocation').textContent = job.arrangement === 'Remote' || !job.arrangement ? 'Remote' : `${job.arrangement} · ${job.location}`;
    $('#ejTimeline').textContent = TIMELINES[job.hiringTimeline] || job.hiringTimeline || 'Open';
    $('#ejDescription').innerHTML = descriptionHtml(job.description);
    $('#ejResponsibilitiesSection').hidden = !responsibilities.length;
    $('#ejResponsibilities').innerHTML = responsibilities.map((item) => `<li>${escape(item)}</li>`).join('');
    $('#ejSkillsSection').hidden = !skills.length;
    $('#ejSkills').innerHTML = skills.map((item) => `<span>${escape(item)}</span>`).join('');
    $('#ejQuestionsSection').hidden = !questions.length;
    $('#ejQuestions').innerHTML = questions.map((question) => `<li>${escape(question)}</li>`).join('');
    $('#ejApplicants').textContent = String(applications.length);
    $('#ejNew').textContent = applications.length ? `applicant${applications.length === 1 ? '' : 's'}${fresh ? ` · ${fresh} new` : ''}` : 'No applicants yet';
    $('#ejViewApplicants').href = `./inbox.html?job=${encodeURIComponent(job.id)}${demo ? '&demo' : ''}`;
    $('#ejStatusText').textContent = status;
    $('#ejPromotion').textContent = promotion(job);
    $('#ejQuestionCount').textContent = questions.length ? `${questions.length} question${questions.length === 1 ? '' : 's'}` : 'None';
    $('#ejStatusLine').hidden = true;
    $('#ejContent').hidden = false;
  }

  async function load() {
    try {
      let dashboard;
      if (demo) dashboard = demoData();
      else {
        if (!window.savaPlatform) throw new Error('The hiring service did not load.');
        dashboard = await window.savaPlatform.employerRequest('employerDashboard');
      }
      const jobs = dashboard.jobs || [];
      const job = demo ? jobs[0] : jobs.find((item) => String(item.id) === String(jobId));
      if (!job) {
        $('#ejStatusLine').textContent = 'We couldn\'t find this job in your account. Go back to Posted jobs to pick one.';
        return;
      }
      render(job, (dashboard.applications || []).filter((application) => String(application.jobId) === String(job.id)));
    } catch (error) {
      $('#ejStatusLine').textContent = error.message || 'Your job could not be loaded. Refresh to try again.';
      $('#ejStatusLine').classList.add('error');
    }
  }

  load();
})();
