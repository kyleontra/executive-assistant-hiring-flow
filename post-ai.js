// "Write with AI" job post chat. The hirer types or talks; the job-writer function replies and returns the post so far.
// Past chats are kept in this browser (per account) and listed on the left with the hirer's posted jobs.
// "Use this post" copies the post into the normal job draft and opens the Review step.
(() => {
  const thread = $('#aiThread');
  if (!thread) return;
  const ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/job-writer';
  const PENDING_KEY = 'sava-ai-pending-message';
  const GREETING = "Hi! Tell me about the job you're hiring for: the role and what they'll do, how many hours a week, the hourly pay, and how soon you need someone.";
  const preview = ['localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).get('preview') === '1';
  const input = $('#aiInput');
  const send = $('#aiSend');
  const mic = $('#aiMic');
  const hero = thread.querySelector('.ai-hero');
  let storeKey = 'sava-ai-job-chats:guest';
  let chats = [];
  let chat = null;
  let busy = false;

  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  function descriptionHtml(value) {
    const inline = (line) => escape(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    let html = '';
    let list = '';
    String(value || '').split('\n').forEach((line) => {
      const bullet = line.match(/^\s*(?:•|-|\d+\.)\s+(.*)$/);
      if (bullet) { list += `<li>${inline(bullet[1])}</li>`; return; }
      if (list) { html += `<ul>${list}</ul>`; list = ''; }
      if (line.trim()) html += `<p>${inline(line)}</p>`;
    });
    return html + (list ? `<ul>${list}</ul>` : '');
  }
  const when = (time) => {
    const days = Math.floor((Date.now() - time) / 86400000);
    if (days < 1) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(time));
  };
  const newChat = () => ({ id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, updatedAt: Date.now(), messages: [], job: null, ready: false, used: false });
  const started = (item) => item.messages.some((message) => message.role === 'user');
  function save() {
    if (preview) return;
    try { localStorage.setItem(storeKey, JSON.stringify(chats.filter(started).slice(0, 30))); } catch { /* storage unavailable */ }
  }
  function load() {
    try { chats = JSON.parse(localStorage.getItem(storeKey) || '[]').filter((item) => item?.id && Array.isArray(item.messages)); } catch { chats = []; }
    if (preview && !chats.length) chats = sampleChats();
    chat = newChat();
    chats.unshift(chat);
  }

  // What the AI still needs. Mirrors the checklist above the chat box; the server's answer wins when it sent one.
  function needs(item) {
    const job = item?.job;
    if (item?.have) return item.have;
    return {
      role: Boolean(job?.title && (job?.roleSummary || job?.description)),
      hours: Boolean(job && (job.hoursPerWeek > 0 || job.employmentType === 'Contract')),
      pay: Boolean(job && job.minRate >= 4 && job.maxRate >= 6 && job.maxRate > job.minRate),
      timeline: Boolean(job?.hiringTimeline),
    };
  }
  const complete = (item) => Object.values(needs(item)).every(Boolean);

  // The post only appears once the AI has everything and has written it.
  function postCard() {
    const job = chat.job;
    if (!chat.ready || !job?.description || !complete(chat)) return '';
    const hours = job.employmentType === 'Contract' ? 'Contract' : `${job.hoursPerWeek} hrs/week · ${job.employmentType}`;
    const facts = [`$${job.minRate} to $${job.maxRate} / hour`, hours, `Hiring ${job.hiringTimeline === 'ASAP' ? 'ASAP' : job.hiringTimeline.toLowerCase()}`]
      .map((fact) => `<span>${escape(fact)}</span>`).join('');
    const extras = [
      job.responsibilities?.length ? `<h3>What they'll do</h3><ul>${job.responsibilities.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : '',
      job.skills?.length ? `<h3>Skills</h3><p>${job.skills.map(escape).join(', ')}</p>` : '',
      job.questions?.length ? `<h3>Screening questions</h3><ul>${job.questions.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : '',
    ].join('');
    return `<article class="ai-post">
      <div class="ai-post-head"><span>Your job post</span><span>Ready</span></div>
      <div class="ai-post-body">
        <h2>${escape(job.title)}</h2>
        <div class="ai-post-facts">${facts}</div>
        <div class="ai-post-text">${descriptionHtml(job.description)}${extras}</div>
        <button class="ai-post-more" type="button">Show full post</button>
      </div>
      <div class="ai-post-foot">
        <small>Want changes? Just tell the AI below.</small>
        <button class="ai-use" type="button">Use this post <span aria-hidden="true">→</span></button>
      </div>
    </article>`;
  }

  function renderSidebar() {
    const list = chats.filter((item) => started(item) || item === chat);
    $('#aiChats').innerHTML = list.map((item) => {
      const title = item.job?.title || item.messages.find((message) => message.role === 'user')?.text || 'New job post';
      const status = item.used ? 'Sent to review' : item.ready ? 'Ready to use' : started(item) ? 'In progress' : 'Just started';
      return `<li><button type="button" data-chat="${escape(item.id)}" class="${item === chat ? 'active' : ''}"><b>${escape(title)}</b><small>${escape(status)} · ${escape(when(item.updatedAt))}</small></button></li>`;
    }).join('') || '<li class="ai-list-empty">Your chats will show here.</li>';
    $('#aiChats').querySelectorAll('[data-chat]').forEach((button) => button.addEventListener('click', () => {
      const picked = chats.find((item) => item.id === button.dataset.chat);
      if (!picked || picked === chat || busy) return;
      // Drop the empty chat we were on when switching away from it.
      if (!started(chat)) chats = chats.filter((item) => item !== chat);
      chat = picked;
      closeSide();
      render();
    }));
  }

  function render(extra = '') {
    const isStarted = started(chat);
    hero.hidden = isStarted;
    thread.querySelectorAll('.ai-msg, .ai-typing, .ai-post').forEach((element) => element.remove());
    const html = (isStarted ? chat.messages : []).map((message) => `<div class="ai-msg ${message.role}">${escape(message.text)}</div>`).join('') + postCard() + extra;
    hero.insertAdjacentHTML('afterend', html);
    thread.querySelector('.ai-use')?.addEventListener('click', usePost);
    thread.querySelector('.ai-post-more')?.addEventListener('click', (event) => {
      const text = thread.querySelector('.ai-post-text');
      text.classList.toggle('open');
      event.target.textContent = text.classList.contains('open') ? 'Show less' : 'Show full post';
    });
    const have = needs(chat);
    document.querySelectorAll('[data-need]').forEach((element) => element.classList.toggle('done', have[element.dataset.need]));
    renderSidebar();
    if (isStarted) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  // Not signed in (or the sign-in expired): keep what they wrote, sign in, and come straight back.
  function signInFirst(message) {
    try { sessionStorage.setItem(PENDING_KEY, message); } catch { /* storage unavailable */ }
    window.location.href = `./employer-login.html?next=${encodeURIComponent('./post-ai.html')}`;
  }

  async function ask(textValue) {
    const message = textValue.trim();
    if (!message || busy) return;
    const token = await window.getAccessToken?.().catch(() => null);
    if (!token) { signInFirst(message); return; }
    stopListening();
    busy = true;
    if (!chat.messages.length) chat.messages.push({ role: 'assistant', text: GREETING });
    chat.messages.push({ role: 'user', text: message });
    chat.updatedAt = Date.now();
    chats = [chat, ...chats.filter((item) => item !== chat)];
    input.value = '';
    resize();
    save();
    render('<div class="ai-typing" aria-label="The AI is writing"><i></i><i></i><i></i></div>');
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: chat.messages }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        chat.messages.pop();
        if (chat.messages.length === 1) chat.messages = [];
        save();
        signInFirst(message);
        return;
      }
      if (!response.ok) throw new Error(result.error || 'The AI could not reply just now. Please try again.');
      chat.messages.push({ role: 'assistant', text: result.reply || 'Got it.' });
      chat.job = result.job || chat.job;
      chat.have = result.have || null;
      chat.ready = Boolean(result.ready);
      chat.updatedAt = Date.now();
      save();
      render();
    } catch (error) {
      // Put the message back so nothing they typed or said is lost.
      chat.messages.pop();
      if (chat.messages.length === 1) chat.messages = [];
      input.value = message;
      resize();
      save();
      render(`<div class="ai-msg error">${escape(error.name === 'TimeoutError' ? 'The AI took too long to reply. Please try again.' : error.message)}</div>`);
    } finally {
      busy = false;
      updateSend();
      input.focus();
    }
  }

  function usePost() {
    const job = chat.job;
    if (!job?.description || !complete(chat)) return;
    const role = read();
    chat.used = true;
    save();
    write({
      title: job.title, company: '', employmentType: job.employmentType, commitment: job.employmentType, type: job.employmentType,
      hours: job.hoursPerWeek > 0 ? `${job.hoursPerWeek} hours / week` : role.hours,
      hiringTimeline: job.hiringTimeline, minRate: String(job.minRate), maxRate: String(job.maxRate), payPeriod: 'hour', currency: 'USD', showPay: true,
      description: job.description, responsibilities: job.responsibilities || [], skills: job.skills || [],
      questions: (job.questions || []).map((question) => ({ text: question, type: 'text', options: [] })),
      writeMode: 'ai', published: false, ...(role.published ? { serverJobId: '' } : {}),
    });
    window.location.href = `./review.html${preview ? '?preview=1' : ''}`;
  }

  async function loadJobs() {
    const list = $('#aiJobs');
    try {
      const jobs = preview
        ? [{ id: 'demo-wedding', title: 'Wedding Video Editor', status: 'active', createdAt: Date.now() - 3 * 86400000 }, { id: 'demo-ea', title: 'Executive Assistant', status: 'closed', createdAt: Date.now() - 20 * 86400000 }]
        : (await window.savaPlatform.employerRequest('employerDashboard')).jobs || [];
      list.innerHTML = jobs.map((job) => {
        const status = job.status === 'active' ? '<span class="live">Active</span>' : job.status === 'closed' ? 'Closed' : 'Draft';
        const href = `./employer-job.html?job=${encodeURIComponent(job.id)}${preview ? '&preview=1' : ''}`;
        return `<li><a href="${href}"><b>${escape(job.title || 'Untitled job')}</b><small>${status} · Posted ${escape(when(new Date(job.createdAt).getTime()))}</small></a></li>`;
      }).join('') || '<li class="ai-list-empty">Jobs you post will show here.</li>';
    } catch {
      list.innerHTML = '<li class="ai-list-empty">Your jobs could not load. <a href="./posted-jobs.html">See posted jobs</a></li>';
    }
  }

  function sampleChats() {
    const day = 86400000;
    return [
      { id: 'sample-1', updatedAt: Date.now() - day, used: true, ready: true, messages: [{ role: 'assistant', text: GREETING }, { role: 'user', text: 'I need a wedding video editor, about 20 hours a week, $8 to $15 an hour, ASAP.' }, { role: 'assistant', text: 'Your post is written! Tap "Use this post" when you\'re happy, or tell me what to change.' }], job: { title: 'Wedding Video Editor', roleSummary: 'Edit wedding highlight films.', employmentType: 'Part-time', hoursPerWeek: 20, hiringTimeline: 'ASAP', minRate: 8, maxRate: 15, description: 'We film 60+ weddings a year and need an editor who can turn raw footage into highlight films couples love.', responsibilities: ['Edit 3 to 5 minute highlight films', 'Color grade and sync multi-camera footage'], skills: ['Premiere Pro', 'DaVinci Resolve'], questions: ['Share a link to a wedding video you edited.'] } },
      { id: 'sample-2', updatedAt: Date.now() - 4 * day, used: false, ready: false, messages: [{ role: 'assistant', text: GREETING }, { role: 'user', text: 'Looking for a bookkeeper who knows QuickBooks.' }, { role: 'assistant', text: "Got it, a bookkeeper who knows QuickBooks.\n\nBefore I write your post, I need to know:\n• How many hours a week\n• Your hourly pay range (from and to)\n• Your hiring timeline: ASAP, within 2 weeks, or more than 2 weeks" }], job: { title: 'Bookkeeper (QuickBooks)', roleSummary: 'Keep the books up to date in QuickBooks.', employmentType: '', hoursPerWeek: 0, hiringTimeline: '', minRate: 0, maxRate: 0, description: '', responsibilities: [], skills: [], questions: [] } },
    ];
  }

  function resize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  }
  const updateSend = () => { send.disabled = busy || !input.value.trim(); };
  input.addEventListener('input', () => { resize(); updateSend(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); ask(input.value); }
  });
  $('#aiComposer').addEventListener('submit', (event) => { event.preventDefault(); ask(input.value); });
  thread.querySelectorAll('[data-starter]').forEach((button) => button.addEventListener('click', () => {
    input.value = button.dataset.starter;
    resize();
    updateSend();
    input.focus();
  }));
  $('#aiNew').addEventListener('click', () => {
    if (busy) return;
    if (started(chat)) { chat = newChat(); chats.unshift(chat); }
    input.value = '';
    resize();
    updateSend();
    closeSide();
    render();
    input.focus();
  });
  const side = $('#aiSide');
  const scrim = $('#aiSideClose');
  function closeSide() { side.classList.remove('open'); scrim.hidden = true; }
  $('#aiSideOpen').addEventListener('click', () => { side.classList.add('open'); scrim.hidden = false; });
  scrim.addEventListener('click', closeSide);

  // Talk instead of typing: the browser's speech recognition fills the box as they speak.
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let spokenBase = '';
  function stopListening() {
    if (!recognition) return;
    const active = recognition;
    recognition = null;
    active.stop();
    mic.classList.remove('on');
    mic.setAttribute('aria-label', 'Speak instead of typing');
    $('#aiListening').hidden = true;
  }
  if (Recognition) {
    mic.hidden = false;
    mic.addEventListener('click', () => {
      if (recognition) { stopListening(); input.focus(); return; }
      recognition = new Recognition();
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      spokenBase = input.value.trim() ? `${input.value.trim()} ` : '';
      recognition.onresult = (event) => {
        const heard = Array.from(event.results).map((result) => result[0].transcript).join('');
        input.value = spokenBase + heard.trim();
        resize();
        updateSend();
      };
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') render('<div class="ai-msg error">Your browser blocked the microphone. Allow it in the address bar, or type instead.</div>');
        stopListening();
      };
      recognition.onend = () => { if (recognition) stopListening(); };
      recognition.start();
      mic.classList.add('on');
      mic.setAttribute('aria-label', 'Stop listening');
      $('#aiListening').hidden = false;
    });
  }

  async function start() {
    // Keep each account's chats separate on shared computers.
    try {
      const { data } = await window.savaAuth.auth.getSession();
      const id = window.masterSessionToken?.() ? 'master' : data?.session?.user?.id;
      if (id) storeKey = `sava-ai-job-chats:${id}`;
    } catch { /* fall back to the guest key */ }
    load();
    render();
    try {
      const pending = sessionStorage.getItem(PENDING_KEY);
      if (pending) { input.value = pending; sessionStorage.removeItem(PENDING_KEY); }
    } catch { /* storage unavailable */ }
    resize();
    updateSend();
    loadJobs();
  }
  start();
})();
