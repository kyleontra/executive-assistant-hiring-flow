import { onboardingFunnel } from './onboarding-funnel.mjs';
const ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/onboarding-tracking';
const rowsNode = document.querySelector('#trackingRows');
const notice = document.querySelector('#trackingNotice');
const refresh = document.querySelector('#refreshTracking');
const search = document.querySelector('#trackingSearch');
const filter = document.querySelector('#trackingFilter');
const labels = { email:'Confirm email',resume:'Add resume',verification:'Upload ID',identity:'Verification guide',platform:'Platform guide',contract:'Sign contract',waiting:'Awaiting approval',preferences:'Job preferences',intro:'Intro guide',recording:'Intro recording',complete:'Onboarding complete' };
const statuses = { complete:'Complete',started:'Started',not_started:'Not started',skipped:'Skipped',needs_update:'Needs update' };
const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : '—';
let rows = [], loading = false;
function renderFunnel() {
  const days = document.querySelector('#funnelCohort').value;
  const idleHours = Number(document.querySelector('#funnelIdle').value);
  const funnel = onboardingFunnel(rows, { idleHours, since: days === 'all' ? null : Date.now() - Number(days) * 86400000 });
  const percent = value => value === null ? '—' : `${Math.round(value * 100)}%`;
  document.querySelector('#funnelSummary').textContent = `${funnel.total} candidates in this signup cohort · Updated with the candidate data above. Inactive is an estimate, not confirmed abandonment.`;
  document.querySelector('#funnelRows').innerHTML = funnel.steps.length ? funnel.steps.map(step => `<tr><td>${escape(step.label)}<div class="funnel-bar"><span style="width:${funnel.total ? Math.round(step.reached / funnel.total * 100) : 0}%"></span></div></td><td>${step.reached}</td><td>${step.completed}</td><td>${percent(step.conversion)}</td><td>${step.active}</td><td>${step.waiting}</td><td>${step.stalled}</td><td><span class="${step.stalled ? 'tracking-error' : ''}">${percent(step.churn)}</span></td></tr>`).join('') : '<tr><td colspan="8">No candidates in this cohort.</td></tr>';
}
function render() {
  renderFunnel();
  const query = search.value.trim().toLowerCase();
  const visible = rows.filter(row => (!query || `${row.name} ${row.email}`.toLowerCase().includes(query)) && (filter.value === 'all' || (filter.value === 'errors' ? row.errors > 0 : filter.value === 'waiting' ? row.currentStage === 'waiting' : filter.value === 'complete' ? row.currentStage === 'complete' : row.currentStage !== 'complete')));
  rowsNode.innerHTML = visible.length ? visible.map(row => `<details class="tracking-candidate"><summary><div><b>${escape(row.name)}</b><small>${escape(row.email)}</small></div><span class="tracking-stage">${escape(labels[row.currentStage] || row.currentStage)}${row.errors ? `<small class="tracking-error">${row.errors} reported errors</small>` : ''}</span><div>${row.completed}/${row.steps.length}<div class="tracking-progress"><span style="width:${Math.round(row.completed / row.steps.length * 100)}%"></span></div></div><div><small>Last activity</small>${escape(date(row.lastActivityAt))}</div></summary><div class="tracking-table-wrap"><table class="tracking-table"><thead><tr><th>Step</th><th>Status</th><th>First opened</th><th>Last opened</th><th>Completed</th><th>Errors</th></tr></thead><tbody>${row.steps.map(step => `<tr><td>${escape(step.label)}</td><td><span class="step-status ${escape(step.status)}">${statuses[step.status]}</span></td><td>${escape(date(step.firstSeenAt))}</td><td>${escape(date(step.lastSeenAt))}</td><td>${escape(date(step.completedAt))}</td><td>${step.errors || '—'}</td></tr>`).join('')}</tbody></table></div></details>`).join('') : '<p class="empty-state">No candidates in this view.</p>';
  document.querySelector('#trackingStats').innerHTML = [['Candidates',rows.length],['Still onboarding',rows.filter(row => row.currentStage !== 'complete').length],['Awaiting approval',rows.filter(row => row.currentStage === 'waiting').length],['Complete',rows.filter(row => row.currentStage === 'complete').length]].map(([label,count]) => `<div class="tracking-stat"><strong>${count}</strong><span>${label}</span></div>`).join('');
}
async function load() {
  if (loading) return;
  loading = true; refresh.disabled = true; notice.textContent = 'Loading onboarding progress…';
  try {
    const token = window.masterSessionToken?.();
    if (!token) { document.querySelector('#masterSignIn').hidden = false; throw new Error('Sign in with a master reviewer account to view onboarding progress.'); }
    const loaded = []; let page = 1;
    while (page) {
      const response = await fetch(ENDPOINT,{ method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify({action:'list',page}),signal:AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load onboarding progress.');
      loaded.push(...result.rows); page = result.nextPage;
    }
    rows = loaded.sort((a,b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));
    document.querySelector('#trackingContent').hidden = false;
    document.querySelector('#masterSignIn').hidden = true;
    notice.textContent = `Updated ${new Date().toLocaleTimeString()} · ${rows.length} candidates`;
    render();
  } catch(error) { notice.textContent = error.message || 'Could not load progress. Click Refresh to try again.'; }
  finally { loading = false; refresh.disabled = false; }
}
search.addEventListener('input',render); filter.addEventListener('change',render); refresh.addEventListener('click',load);
load();

for (const id of ['funnelCohort','funnelIdle']) document.querySelector(`#${id}`).addEventListener('change',renderFunnel);
