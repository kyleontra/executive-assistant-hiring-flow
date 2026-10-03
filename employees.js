// My Employees. Example build: two demo employees live in memory (reload resets them) until the
// backend has hires, timesheets and payments. Add ?empty to the URL to see the no-employees state.
// Pay model shown here: the VA logs hours daily, the employer approves (auto-approved after 48 hours),
// and the employer pays weekly every Monday for the week before.
const EM_PERIOD = { label: 'Mon, Sep 28 - Sun, Oct 4', due: 'Mon, Oct 5' };

const emEmployees = [
  {
    id: 'thandi', name: 'Thandi Mokoena', job: 'Wedding Video Editor', commitment: 'Full-time',
    rate: 8, hoursPerWeek: 40, start: 'Aug 31, 2026', timeZone: 'South Africa (SAST)', status: 'active', lastPaid: 'Sep 28', bonus: 0,
    days: [
      { day: 'Mon, Sep 28', hours: 8, note: 'Cut the Johnson wedding highlight reel, first pass.', approved: true },
      { day: 'Tue, Sep 29', hours: 8, note: 'Color grade and audio sync on the Johnson ceremony.', approved: true },
      { day: 'Wed, Sep 30', hours: 8, note: 'Client revisions on the Patel teaser, exported 4K.', approved: true },
      { day: 'Thu, Oct 1', hours: 8, note: 'Started the Rivera full-length edit, organized footage.', approved: false },
      { day: 'Fri, Oct 2', hours: 8, note: 'Rivera edit through the reception, music licensing.', approved: false },
    ],
  },
  {
    id: 'jaco', name: 'Jaco van der Merwe', job: 'Social Media Video Editor', commitment: 'Part-time',
    rate: 7, hoursPerWeek: 20, start: 'Sep 14, 2026', timeZone: 'South Africa (SAST)', status: 'active', lastPaid: 'Sep 28', bonus: 0,
    days: [
      { day: 'Mon, Sep 28', hours: 4, note: '6 Instagram reels from the Johnson wedding.', approved: true },
      { day: 'Tue, Sep 29', hours: 4, note: 'TikTok captions and thumbnails for the week.', approved: true },
      { day: 'Wed, Sep 30', hours: 3, note: 'Behind-the-scenes cutdown for Facebook.', approved: true },
      { day: 'Thu, Oct 1', hours: 4, note: 'Scheduled posts, 3 new reels from the Patel teaser.', approved: true },
      { day: 'Fri, Oct 2', hours: 4, note: 'Weekly recap video and story highlights.', approved: true },
    ],
  },
];

const emHistory = [
  { date: 'Sep 28, 2026', name: 'Thandi Mokoena', period: 'Sep 21 - 27', hours: 40, amount: 320 },
  { date: 'Sep 28, 2026', name: 'Jaco van der Merwe', period: 'Sep 21 - 27', hours: 18, amount: 126 },
  { date: 'Sep 21, 2026', name: 'Thandi Mokoena', period: 'Sep 14 - 20', hours: 38, amount: 304 },
  { date: 'Sep 21, 2026', name: 'Jaco van der Merwe', period: 'Sep 14 - 20', hours: 20, amount: 140 },
  { date: 'Sep 14, 2026', name: 'Thandi Mokoena', period: 'Sep 7 - 13', hours: 40, amount: 320 },
];

const $ = (selector) => document.querySelector(selector);
const emMoney = (value) => `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const emInitials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const emLogged = (person) => person.days.reduce((sum, day) => sum + day.hours, 0);
const emPending = (person) => person.days.filter((day) => !day.approved).reduce((sum, day) => sum + day.hours, 0);
const emDueFor = (person) => (person.paidThisPeriod ? 0 : emLogged(person) * person.rate) + person.bonus;
const emEscape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const emFind = (id) => emEmployees.find((person) => person.id === id);

function emToast(message) {
  const toast = $('#emToast');
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(emToast.timer);
  emToast.timer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function emCard(person) {
  const logged = emLogged(person);
  const pending = emPending(person);
  const due = emDueFor(person);
  const percent = Math.min(100, Math.round((logged / person.hoursPerWeek) * 100));
  const statusLabel = { active: 'Active', paused: 'Paused', ended: 'Ended' }[person.status];
  const flag = person.status === 'active' && pending && !person.paidThisPeriod
    ? `<button class="em-flag" type="button" data-action="hours">${pending} hrs need your approval</button>` : '';
  return `
    <article class="em-card ${person.status}" data-id="${person.id}">
      <header class="em-card-head">
        <span class="em-avatar" aria-hidden="true">${emInitials(person.name)}</span>
        <div class="em-who">
          <h3>${emEscape(person.name)}</h3>
          <p>${emEscape(person.job)} <span>·</span> ${person.commitment}</p>
        </div>
        <span class="em-status ${person.status}">${statusLabel}</span>
        <div class="em-more">
          <button class="em-more-btn" type="button" data-action="menu" aria-label="More actions for ${emEscape(person.name)}" aria-expanded="false">•••</button>
          <div class="em-menu" hidden>
            ${person.status === 'ended' ? '' : `
            <button type="button" data-action="edit">Change rate or hours</button>
            <button type="button" data-action="bonus">Give a bonus</button>
            <button type="button" data-action="pause">${person.status === 'paused' ? 'Resume contract' : 'Pause contract'}</button>
            <button type="button" class="danger" data-action="end">End contract</button>`}
            ${person.status === 'ended' ? '<button type="button" data-action="rehire">Rehire</button>' : ''}
          </div>
        </div>
      </header>

      <dl class="em-facts">
        <div><dt>Pay rate</dt><dd>${emMoney(person.rate)}/hr</dd></div>
        <div><dt>Scheduled</dt><dd>${person.hoursPerWeek} hrs/week</dd></div>
        <div><dt>Started</dt><dd>${person.start}</dd></div>
        <div><dt>Time zone</dt><dd>${person.timeZone}</dd></div>
      </dl>

      <div class="em-period">
        <div class="em-period-hours">
          <div class="em-period-top"><small>Hours this week</small><b>${logged} <span>of ${person.hoursPerWeek}</span></b></div>
          <div class="em-bar" role="progressbar" aria-valuenow="${logged}" aria-valuemin="0" aria-valuemax="${person.hoursPerWeek}"><span style="width:${percent}%"></span></div>
          ${flag}
        </div>
        <div class="em-period-due">
          <small>Amount due</small>
          <b>${emMoney(due)}</b>
          <span>${person.paidThisPeriod && !person.bonus ? 'Paid this week' : person.bonus ? `Includes ${emMoney(person.bonus)} bonus` : `Due ${EM_PERIOD.due}`}</span>
        </div>
        <div class="em-period-paid"><small>Last paid</small><b>${person.lastPaid}</b><span>Next: ${person.status === 'active' ? EM_PERIOD.due : '-'}</span></div>
      </div>

      <footer class="em-actions">
        <a class="em-button" href="./inbox.html?demo">Message</a>
        <button class="em-button" type="button" data-action="hours">View hours</button>
        <button class="post-continue" type="button" data-action="pay" ${due && person.status !== 'paused' ? '' : 'disabled'}>Pay ${due ? emMoney(due) : ''}</button>
      </footer>
    </article>`;
}

function emRender() {
  const active = emEmployees.filter((person) => person.status === 'active');
  const dueTotal = emEmployees.filter((person) => person.status !== 'paused').reduce((sum, person) => sum + emDueFor(person), 0);
  $('#emPeriod').textContent = `Pay week: ${EM_PERIOD.label}`;
  $('#emActive').textContent = active.length;
  $('#emHours').innerHTML = `${active.reduce((sum, person) => sum + emLogged(person), 0)} <span>of ${active.reduce((sum, person) => sum + person.hoursPerWeek, 0)} scheduled</span>`;
  $('#emDue').textContent = emMoney(dueTotal);
  $('#emDueDate').textContent = dueTotal ? `Due ${EM_PERIOD.due}` : 'All paid up';
  $('#emPayAll').disabled = !dueTotal;
  $('#emList').innerHTML = emEmployees.map(emCard).join('');
  $('#emHistory').innerHTML = emHistory.map((row) => `
    <tr><td>${row.date}</td><td>${emEscape(row.name)}</td><td>${row.period}</td><td>${row.hours ?? '-'}</td><td><b>${emMoney(row.amount)}</b></td><td><button class="em-receipt" type="button" data-receipt>Receipt</button></td></tr>`).join('');
}

function emOpenHours(person) {
  $('#emHoursTitle').textContent = `${person.name}'s hours`;
  $('#emHoursSub').textContent = `${EM_PERIOD.label} · ${emMoney(person.rate)}/hr`;
  $('#emHoursBody').innerHTML = `
    <ul class="em-days">${person.days.map((day) => `
      <li>
        <div><b>${day.day}</b><p>${emEscape(day.note)}</p></div>
        <span class="em-day-hours">${day.hours} hrs</span>
        <span class="em-day-state ${day.approved ? 'ok' : ''}">${day.approved ? 'Approved' : 'Needs approval'}</span>
      </li>`).join('')}
    </ul>
    <div class="em-days-total"><span>Total</span><b>${emLogged(person)} hrs · ${emMoney(emLogged(person) * person.rate)}</b></div>
    <button class="em-link" type="button" data-dispute>Something look wrong? Dispute hours</button>`;
  const pending = emPending(person);
  $('#emHoursNote').textContent = pending ? 'Hours you do not review are approved automatically after 48 hours.' : 'All hours approved.';
  $('#emApprove').hidden = !pending;
  $('#emApprove').textContent = `Approve ${pending} hrs`;
  $('#emApprove').onclick = () => {
    person.days.forEach((day) => { day.approved = true; });
    $('#emHoursDialog').close();
    emRender();
    emToast(`Approved ${pending} hrs for ${person.name}.`);
  };
  $('#emHoursBody [data-dispute]').onclick = () => emToast('Example build: this opens a dispute form that goes to Hire From SA support.');
  $('#emHoursDialog').showModal();
}

function emOpenPay(people) {
  const rows = people.filter((person) => person.status !== 'paused' && emDueFor(person) > 0);
  const total = rows.reduce((sum, person) => sum + emDueFor(person), 0);
  const pending = rows.reduce((sum, person) => sum + emPending(person), 0);
  $('#emPaySub').textContent = `Pay week ${EM_PERIOD.label}`;
  $('#emPayBody').innerHTML = `
    <ul class="em-pay-rows">${rows.map((person) => `
      <li><span class="em-avatar sm" aria-hidden="true">${emInitials(person.name)}</span>
        <div><b>${emEscape(person.name)}</b><p>${person.paidThisPeriod ? 'Bonus only' : `${emLogged(person)} hrs × ${emMoney(person.rate)}/hr`}${person.bonus && !person.paidThisPeriod ? ` + ${emMoney(person.bonus)} bonus` : ''}</p></div>
        <strong>${emMoney(emDueFor(person))}</strong></li>`).join('')}
    </ul>
    <div class="em-days-total"><span>Total</span><b>${emMoney(total)}</b></div>
    ${pending ? `<p class="em-warn">Paying now also approves ${pending} hrs that are waiting for your approval.</p>` : ''}
    <div class="em-method"><small>Pay with</small><b>Visa ending 4242</b><a href="#" data-billing>Change</a></div>`;
  $('#emPayBody [data-billing]').onclick = (event) => { event.preventDefault(); emToast('Payment methods will live on the Billing page.'); };
  $('#emPayConfirm').textContent = `Pay ${emMoney(total)}`;
  $('#emPayConfirm').onclick = () => {
    rows.forEach((person) => {
      emHistory.unshift({ date: 'Oct 3, 2026', name: person.name, period: 'Sep 28 - Oct 4', hours: emLogged(person), amount: emDueFor(person) });
      person.days.forEach((day) => { day.approved = true; });
      person.paidThisPeriod = true;
      person.bonus = 0;
      person.lastPaid = 'Oct 3';
    });
    $('#emPayDialog').close();
    emRender();
    emToast(`Paid ${emMoney(total)}. Your employees get it within 24 hours. (Example only, nothing was charged.)`);
  };
  $('#emPayDialog').showModal();
}

function emOpenEdit(person, mode) {
  const form = $('#emEditForm');
  const titles = {
    edit: ['Change rate or hours', `${person.name} has to accept the change before it starts.`],
    bonus: ['Give a bonus', `Added to ${person.name}'s next payment. 100% goes to them.`],
    end: ['End contract', `${person.name} is paid for all hours logged up to the last day.`],
  };
  [$('#emEditTitle').textContent, $('#emEditSub').textContent] = titles[mode];
  form.innerHTML = {
    edit: `
      <div class="em-form-grid">
        <label class="post-field"><span>Pay rate (USD/hr)</span><input name="rate" type="number" min="4" step="1" value="${person.rate}" required /></label>
        <label class="post-field"><span>Hours per week</span><input name="hours" type="number" min="1" max="60" step="1" value="${person.hoursPerWeek}" required /></label>
      </div>
      <label class="post-field"><span>Starts</span><select name="when"><option>Next pay week (Oct 5)</option><option>Right away</option></select></label>`,
    bonus: `
      <label class="post-field"><span>Bonus amount (USD)</span><input name="bonus" type="number" min="1" step="1" placeholder="e.g. 50" required /></label>
      <label class="post-field"><span>Note to ${emEscape(person.name.split(' ')[0])} <small>Optional</small></span><input name="note" maxlength="140" placeholder="e.g. Great work on the Johnson wedding" /></label>`,
    end: `
      <label class="post-field"><span>Last working day</span><select name="last"><option>Today (Oct 3)</option><option>End of this week (Oct 4)</option><option>In 2 weeks (Oct 17)</option></select></label>
      <label class="post-field"><span>Reason <small>Private</small></span><select name="reason"><option>Project finished</option><option>No longer need the role</option><option>Performance</option><option>Other</option></select></label>`,
  }[mode] + `<footer><span class="em-note"></span><button class="post-continue ${mode === 'end' ? 'danger' : ''}" type="submit">${{ edit: 'Send change', bonus: 'Add bonus', end: 'End contract' }[mode]}</button></footer>`;
  form.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(form);
    if (mode === 'edit') {
      const rate = Math.round(Number(data.get('rate')));
      const hours = Math.round(Number(data.get('hours')));
      if (rate < 4 || !hours) { form.querySelector('.em-note').textContent = 'Rate must be at least $4/hr.'; return; }
      person.rate = rate;
      person.hoursPerWeek = hours;
      emToast(`Change sent to ${person.name}. (Example: applied right away.)`);
    } else if (mode === 'bonus') {
      const bonus = Math.round(Number(data.get('bonus')));
      if (!bonus || bonus < 1) { form.querySelector('.em-note').textContent = 'Enter a whole dollar amount.'; return; }
      person.bonus += bonus;
      emToast(`${emMoney(bonus)} bonus added to ${person.name}'s next payment.`);
    } else {
      person.status = 'ended';
      emToast(`Contract with ${person.name} ended. Their final hours are still due.`);
    }
    $('#emEditDialog').close();
    emRender();
  };
  $('#emEditDialog').showModal();
  form.querySelector('input,select')?.focus();
}

function emCloseMenus(except) {
  document.querySelectorAll('.em-menu').forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    menu.previousElementSibling.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action],[data-close],[data-receipt]');
  if (!target) { emCloseMenus(); return; }
  if (target.matches('[data-close]')) { target.closest('dialog').close(); return; }
  if (target.matches('[data-receipt]')) { emToast('Example build: receipts download as a PDF.'); return; }
  const person = emFind(target.closest('.em-card')?.dataset.id);
  const action = target.dataset.action;
  if (action === 'menu') {
    const menu = target.nextElementSibling;
    emCloseMenus(menu);
    menu.hidden = !menu.hidden;
    target.setAttribute('aria-expanded', String(!menu.hidden));
    return;
  }
  emCloseMenus();
  if (action === 'hours') emOpenHours(person);
  else if (action === 'pay') emOpenPay([person]);
  else if (action === 'edit' || action === 'bonus' || action === 'end') emOpenEdit(person, action);
  else if (action === 'pause') {
    person.status = person.status === 'paused' ? 'active' : 'paused';
    emRender();
    emToast(person.status === 'paused' ? `${person.name} is paused. No hours can be logged until you resume.` : `${person.name} is active again.`);
  } else if (action === 'rehire') {
    person.status = 'active';
    emRender();
    emToast(`${person.name} is active again.`);
  }
});

document.querySelectorAll('.em-dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
}));
$('#emPayAll').addEventListener('click', () => emOpenPay(emEmployees));

if (new URLSearchParams(window.location.search).has('empty')) {
  $('#emEmpty').hidden = false;
} else {
  $('#emContent').hidden = false;
  emRender();
}
