// Billing. Example build: pretend charges and cards match the My Employees demo (Thandi and Jaco).
// Billing details save to this browser (localStorage) until the backend has fields for them.
// Add ?failed to the URL to see the declined-card banner.
const BL_KEY = 'hirefromsa:billing-details';
const BL_TODAY = new Date('2026-10-03T12:00:00');

const blNext = [
  { name: 'Thandi Mokoena', detail: '40 hrs × $8/hr', hours: 40, amount: 320 },
  { name: 'Jaco van der Merwe', detail: '19 hrs × $7/hr', hours: 19, amount: 133 },
];

const blCards = [
  { id: 'visa', brand: 'Visa', last4: '4242', expires: '08/28', role: 'default' },
  { id: 'mc', brand: 'Mastercard', last4: '5555', expires: '02/27', role: 'backup' },
];

const blCharges = [
  { date: '2026-09-28', desc: 'Weekly pay: Sep 21 - 27', sub: 'Thandi Mokoena, Jaco van der Merwe', type: 'pay', card: 'Visa 4242', status: 'paid', amount: 446 },
  { date: '2026-09-24', desc: 'Bonus: Thandi Mokoena', sub: '"Thank you for the Patel teaser rush"', type: 'bonus', card: 'Visa 4242', status: 'paid', amount: 25 },
  { date: '2026-09-21', desc: 'Weekly pay: Sep 14 - 20', sub: 'Thandi Mokoena, Jaco van der Merwe', type: 'pay', card: 'Visa 4242', status: 'paid', amount: 444 },
  { date: '2026-09-14', desc: 'Weekly pay: Sep 7 - 13', sub: 'Thandi Mokoena', type: 'pay', card: 'Visa 4242', status: 'paid', amount: 320 },
  { date: '2026-09-10', desc: 'Job promotion: Social Media Video Editor', sub: '$5 boost', type: 'promo', card: 'Visa 4242', status: 'paid', amount: 5 },
  { date: '2026-09-07', desc: 'Weekly pay: Aug 31 - Sep 6', sub: 'Declined, so your backup card was charged', type: 'pay', card: 'Visa 4242', status: 'failed', amount: 312 },
  { date: '2026-09-07', desc: 'Weekly pay: Aug 31 - Sep 6', sub: 'Thandi Mokoena', type: 'pay', card: 'Mastercard 5555', status: 'paid', amount: 312 },
  { date: '2026-08-28', desc: 'Job promotion: Bookkeeper (job closed)', sub: 'Refunded, promotion never started', type: 'promo', card: 'Visa 4242', status: 'refunded', amount: 10 },
  { date: '2026-08-24', desc: 'Job promotion: Wedding Video Editor', sub: '$10 boost', type: 'promo', card: 'Visa 4242', status: 'paid', amount: 10 },
];

const $ = (selector) => document.querySelector(selector);
const blMoney = (value) => `$${Number(value).toLocaleString('en-US')}`;
const blDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const blEscape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const blPaid = (filter) => blCharges.filter((charge) => charge.status === 'paid' && filter(charge)).reduce((sum, charge) => sum + charge.amount, 0);

function blToast(message) {
  const toast = $('#blToast');
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(blToast.timer);
  blToast.timer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function blRenderNext() {
  // Every hour a VA works is an hour the hirer did not have to spend themselves.
  const hours = blNext.reduce((sum, row) => sum + row.hours, 0);
  $('#blSavedHours').textContent = `${hours.toLocaleString('en-US')} hour${hours === 1 ? '' : 's'}`;
  $('#blSavedPeople').textContent = blNext.length === 1 ? 'Your VA' : `Your ${blNext.length} VAs`;
  $('#blNextAmount').textContent = blMoney(blNext.reduce((sum, row) => sum + row.amount, 0));
  $('#blNextRows').innerHTML = blNext.map((row) => `<li><span>${row.name} <small>${row.detail}</small></span><b>${blMoney(row.amount)}</b></li>`).join('');
  const on = $('#blAutopay').checked;
  $('#blAutopayText').textContent = on
    ? 'On. Approved hours are paid automatically every Monday, so your employees are never paid late.'
    : 'Off. You need to click Pay on My Employees every Monday. Late payments pause your employees after 3 days.';
}

function blRenderCards() {
  const def = blCards.find((card) => card.role === 'default');
  document.querySelector('.bl-next-main > span').textContent = `Mon, Oct 5 · ${def.brand} ending ${def.last4}`;
  $('#blMethods').innerHTML = blCards.map((card) => `
    <li data-id="${card.id}">
      <span class="bl-brand ${card.brand.toLowerCase()}">${{ Visa: 'VISA', Mastercard: 'MC', Amex: 'AMEX' }[card.brand] || 'CARD'}</span>
      <div><b>${card.brand} ending ${card.last4}</b><p>Expires ${card.expires}</p></div>
      ${card.role ? `<span class="bl-tag ${card.role}">${card.role === 'default' ? 'Default' : 'Backup'}</span>` : ''}
      <div class="bl-method-actions">
        ${card.role === 'default' ? '' : '<button class="bl-link" type="button" data-card="default">Make default</button>'}
        ${card.role ? '' : '<button class="bl-link" type="button" data-card="backup">Make backup</button>'}
        ${card.role === 'default' ? '' : '<button class="bl-link danger" type="button" data-card="remove">Remove</button>'}
      </div>
    </li>`).join('');
}

function blRenderSpending() {
  const sep = (charge) => charge.date.startsWith('2026-09');
  $('#blMonth').textContent = blMoney(blPaid(sep));
  $('#blYear').textContent = blMoney(blPaid((charge) => charge.date.startsWith('2026')));
  $('#blToVas').textContent = blMoney(blPaid((charge) => charge.type !== 'promo'));
  const parts = [
    ['pay', 'Employee pay', blPaid((charge) => charge.type === 'pay')],
    ['bonus', 'Bonuses', blPaid((charge) => charge.type === 'bonus')],
    ['promo', 'Job promotions', blPaid((charge) => charge.type === 'promo')],
  ];
  const total = parts.reduce((sum, part) => sum + part[2], 0) || 1;
  $('#blSplit').innerHTML = parts.map(([key, , value]) => `<span class="${key}" style="width:${Math.max(value ? 1.2 : 0, (value / total) * 100)}%"></span>`).join('');
  $('#blLegend').innerHTML = parts.map(([key, label, value]) => `<li><i class="${key}"></i>${label}<b>${blMoney(value)}</b></li>`).join('');
}

function blFiltered() {
  const type = $('#blType').value;
  const range = $('#blRange').value;
  const since = new Date(BL_TODAY.getTime() - 30 * 864e5);
  return blCharges.filter((charge) => {
    if (type !== 'all' && charge.type !== type) return false;
    if (range === '30') return new Date(`${charge.date}T12:00:00`) >= since;
    if (range === 'sep') return charge.date.startsWith('2026-09');
    if (range === 'aug') return charge.date.startsWith('2026-08');
    return true;
  });
}

function blRenderHistory() {
  const rows = blFiltered();
  const labels = { paid: 'Paid', failed: 'Failed', refunded: 'Refunded' };
  $('#blHistory').innerHTML = rows.map((charge) => `
    <tr class="${charge.status}">
      <td>${blDate(charge.date)}</td>
      <td><b>${blEscape(charge.desc)}</b><small>${blEscape(charge.sub)}</small></td>
      <td>${charge.card}</td>
      <td><span class="bl-status ${charge.status}">${labels[charge.status]}</span></td>
      <td class="num">${charge.status === 'refunded' ? '-' : ''}${blMoney(charge.amount)}</td>
      <td class="num">${charge.status === 'failed' ? '' : '<button class="bl-link" type="button" data-toast="Example build: this downloads the receipt as a PDF.">PDF</button>'}</td>
    </tr>`).join('');
  $('#blNone').hidden = rows.length > 0;
}

function blDownloadCsv() {
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [['Date', 'Description', 'Details', 'Card', 'Status', 'Amount (USD)']]
    .concat(blFiltered().map((charge) => [charge.date, charge.desc, charge.sub, charge.card, charge.status, charge.status === 'refunded' ? -charge.amount : charge.amount]))
    .map((row) => row.map(quote).join(','));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  link.download = 'hirefromsa-billing-history.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function blInitDetails() {
  const form = $('#blDetails');
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(BL_KEY) || '{}') || {}; } catch { /* Start empty. */ }
  if (!saved.company) {
    try { saved.company = JSON.parse(localStorage.getItem('hirefromsa:employer-profile') || '{}').companyName || ''; } catch { /* Leave blank. */ }
  }
  [...form.elements].forEach((field) => { if (field.name && saved[field.name]) field.value = saved[field.name]; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = {};
    [...form.elements].forEach((field) => { if (field.name) next[field.name] = field.value.trim(); });
    try { localStorage.setItem(BL_KEY, JSON.stringify(next)); } catch { /* Storage blocked: keep the page usable. */ }
    const status = form.querySelector('.bl-saved');
    status.textContent = 'Saved';
    window.setTimeout(() => { status.textContent = ''; }, 2400);
  });
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-open],[data-close],[data-toast],[data-card]');
  if (!target) return;
  if (target.dataset.open) { $(`#${target.dataset.open}`).showModal(); return; }
  if (target.matches('[data-close]')) { target.closest('dialog').close(); return; }
  if (target.dataset.toast) { blToast(target.dataset.toast); return; }
  const card = blCards.find((item) => item.id === target.closest('li').dataset.id);
  const action = target.dataset.card;
  if (action === 'remove') {
    blCards.splice(blCards.indexOf(card), 1);
    blToast(`${card.brand} ending ${card.last4} removed.`);
  } else {
    blCards.forEach((item) => { if (item.role === action) item.role = card.role || ''; });
    card.role = action;
    blToast(`${card.brand} ending ${card.last4} is now your ${action} card.`);
  }
  blRenderCards();
});

$('#blAddDemo').addEventListener('click', () => {
  blCards.push({ id: `amex${blCards.length}`, brand: 'Amex', last4: '0005', expires: '11/29', role: blCards.some((card) => card.role === 'backup') ? '' : 'backup' });
  $('#blCardDialog').close();
  blRenderCards();
  blToast('Demo card added. (Example only, no real card was saved.)');
});
$('#blCardDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$('#blAutopay').addEventListener('change', () => {
  blRenderNext();
  blToast($('#blAutopay').checked ? 'Auto-pay is on.' : 'Auto-pay is off. Remember to pay every Monday.');
});
$('#blType').addEventListener('change', blRenderHistory);
$('#blRange').addEventListener('change', blRenderHistory);
$('#blCsv').addEventListener('click', blDownloadCsv);

$('#blFailed').hidden = !new URLSearchParams(window.location.search).has('failed');
blRenderNext();
blRenderCards();
blRenderSpending();
blRenderHistory();
blInitDetails();
