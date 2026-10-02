import { candidateColumns, candidateCells, candidateCsv } from './candidate-spreadsheet-export.mjs';

const root = document.querySelector('#candidateExport');
const form = root.querySelector('#candidateExportForm');
const prompt = root.querySelector('#candidateExportPrompt');
const status = root.querySelector('#candidateExportStatus');
const preview = root.querySelector('#candidateExportPreview');
const generate = root.querySelector('#generateCandidateExport');
const stop = root.querySelector('#stopCandidateExport');
const download = root.querySelector('#downloadCandidateExport');
const configStatus = root.querySelector('#candidateExportConfig');
const spreadsheetSearch = root.querySelector('#candidateSpreadsheetSearch');
const refreshSpreadsheet = root.querySelector('#refreshCandidateSpreadsheet');
const keyDialog = root.querySelector('#candidateAiKeyDialog');
const keyForm = root.querySelector('#candidateAiKeyForm');
const keyInput = root.querySelector('#candidateAiKeyInput');
const keyStatus = root.querySelector('#candidateAiKeyStatus');
const keyOpen = root.querySelector('#openCandidateAiKey');
let canConfigure = false, setupOpened = false;
let rows = [], busy = false, loadingSaved = false, stopping = false, configured = false, requestAdmin;
let viewVersion = 0;
const escape = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);

function render() {
  download.disabled = busy || loadingSaved || !rows.length;
  if (!rows.length) { preview.innerHTML = '<p>No candidate accounts yet. New candidates will appear here.</p>'; return; }
  const query = spreadsheetSearch.value.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => !query || candidateCells(row).join(' ').toLocaleLowerCase().includes(query));
  preview.innerHTML = `<p>${filtered.length} of ${rows.length} candidate${rows.length === 1 ? '' : 's'}. ${rows.filter(row => row.generated).length} with saved AI information. CSV includes every candidate.</p>${filtered.length ? `<div class="candidate-export-table-wrap" tabindex="0" role="region" aria-label="Saved candidate spreadsheet"><table><thead><tr>${candidateColumns.map(c => `<th scope="col">${escape(c)}</th>`).join('')}</tr></thead><tbody>${filtered.map(row => `<tr>${candidateCells(row).map((value,index) => `<td${index === 0 && row.generatedAt ? ` title="Last generated ${escape(new Date(row.generatedAt).toLocaleString())}"` : ''}>${candidateColumns[index] === 'Resume Text' && row.resumeText ? `<details class="candidate-resume-text"><summary>Read resume</summary><pre>${escape(row.resumeText)}</pre></details>` : escape(value || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p>No candidates match this search.</p>'}`;
}

export async function loadSavedCandidateSpreadsheet() {
  if (!requestAdmin || busy || loadingSaved) return;
  const request = requestAdmin, version = viewVersion;
  loadingSaved = true; refreshSpreadsheet.disabled = true; generate.disabled = true; download.disabled = true;
  status.textContent = 'Loading the saved candidate spreadsheet…';
  try {
    const savedRows = [], seen = new Set(); let cursor = '';
    do {
      const page = await request('candidateSpreadsheetPage', { cursor, includeSaved: true });
      if (version !== viewVersion || request !== requestAdmin) return;
      for (const row of page.rows || []) if (!seen.has(row.candidateId)) { seen.add(row.candidateId); savedRows.push(row); }
      if (page.nextCursor && page.nextCursor === cursor) throw new Error('Candidate pagination did not advance. Please retry.');
      cursor = page.nextCursor;
    } while (cursor);
    rows = savedRows;
    status.textContent = 'Saved information loaded from the resume database. No AI generation is needed to view it.';
    render();
  } catch (error) { if (version === viewVersion) status.textContent = error.message || 'Could not load the saved spreadsheet.'; }
  finally { if (version === viewVersion) { loadingSaved = false; refreshSpreadsheet.disabled = false; generate.disabled = !configured; render(); } }
}
spreadsheetSearch.addEventListener('input', render);
refreshSpreadsheet.addEventListener('click', loadSavedCandidateSpreadsheet);

export async function enableCandidateExport(request) {
  requestAdmin = request;
  try {
    const config = await request('candidateSpreadsheetConfig');
    configured = config.configured;
    canConfigure = config.canConfigure;
    keyOpen.disabled = !canConfigure || busy;
    if (!prompt.value) prompt.value = config.prompt;
    configStatus.textContent = configured ? `AI is connected${config.model ? ' · ' + config.model : ''}. Resumes and onboarding answers are processed with OpenAI.` : canConfigure ? 'Connect your OpenAI key securely to generate spreadsheet rows.' : 'Sign in with the master account to connect the AI key securely.';
    generate.disabled = !configured;
    if (canConfigure && !setupOpened && new URLSearchParams(location.search).get('ai') === 'setup') { setupOpened = true; openKeyDialog(); }
  } catch (error) { configStatus.textContent = error.message; generate.disabled = true; }
  await loadSavedCandidateSpreadsheet();
}

export function lockCandidateExport() {
  viewVersion++; loadingSaved = false;
  stopping = true;
  rows = []; render();
  spreadsheetSearch.value = ''; preview.innerHTML = ''; refreshSpreadsheet.disabled = false;
  prompt.value = '';
  configured = false;
  requestAdmin = null;
  canConfigure = false;
  keyForm.reset(); if (keyDialog.open) keyDialog.close(); keyOpen.disabled = true;
  configStatus.textContent = '';
  status.textContent = '';
  generate.disabled = true;
}

function openKeyDialog() {
  if (!canConfigure || busy) return;
  root.open = true;
  keyStatus.textContent = '';
  keyForm.reset();
  keyDialog.showModal();
  keyInput.focus();
}
keyOpen.addEventListener('click', openKeyDialog);
root.querySelector('#closeCandidateAiKey').addEventListener('click', () => keyDialog.close());
keyDialog.addEventListener('close', () => { keyForm.reset(); keyStatus.textContent = ''; });
keyForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!canConfigure || !requestAdmin || !keyForm.reportValidity()) return;
  const button = root.querySelector('#saveCandidateAiKey');
  button.disabled = true; keyInput.disabled = true;
  keyStatus.textContent = 'Verifying and saving to Supabase Vault…';
  try {
    await requestAdmin('saveCandidateAiKey', { apiKey: keyInput.value.trim() });
    keyForm.reset(); keyDialog.close();
    await enableCandidateExport(requestAdmin);
    status.textContent = 'Key saved securely. You can now generate the candidate spreadsheet.';
  } catch (error) { keyStatus.textContent = error.message || 'Could not save the key. Please retry.'; }
  finally { button.disabled = false; keyInput.disabled = false; }
});

root.querySelector('#checkCandidateExportConnection').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try { if (requestAdmin) await enableCandidateExport(requestAdmin); } finally { button.disabled = false; }
});
root.querySelector('#copyCandidateExportPrompt').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(prompt.value); status.textContent = 'AI prompt copied.'; } catch { status.textContent = 'Select the prompt text to copy it.'; }
});
stop.addEventListener('click', () => { stopping = true; stop.disabled = true; status.textContent = 'Stopping after the current candidate…'; });

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || loadingSaved || !configured || !requestAdmin || !form.reportValidity()) return;
  const runPrompt = prompt.value.trim(), request = requestAdmin;
  busy = true; stopping = false; rows = [];
  generate.disabled = true; prompt.disabled = true; stop.hidden = false; stop.disabled = false; download.disabled = true;
  keyOpen.disabled = true;
  refreshSpreadsheet.disabled = true;
  root.querySelector('#checkCandidateExportConnection').disabled = true;
  try {
    status.textContent = 'Loading every candidate from the account database…';
    let cursor = '', seen = new Set();
    do {
      const page = await request('candidateSpreadsheetPage', { cursor });
      if (!requestAdmin) return;
      for (const row of page.rows || []) if (!seen.has(row.candidateId)) { seen.add(row.candidateId); rows.push(row); }
      if (page.nextCursor && page.nextCursor === cursor) throw new Error('Candidate pagination did not advance. Please retry.');
      cursor = page.nextCursor;
    } while (cursor && !stopping);
    if (stopping) { rows = []; status.textContent = 'Stopped while loading candidates. Generate again to include every account.'; return; }
    for (let index = 0; index < rows.length; index++) {
      if (stopping) break;
      const row = rows[index];
      if (!row.resumeAvailable) { row.error = 'No resume uploaded'; continue; }
      status.textContent = `Processing ${index + 1} of ${rows.length}: ${row.name}…`;
      try {
        const result = await request('generateCandidateSpreadsheetRow', { candidateId: row.candidateId, prompt: runPrompt });
        if (!requestAdmin) return;
        rows[index] = result.row;
      } catch (error) { row.error = error.message || 'Could not process resume'; }
      render();
    }
    for (const row of rows) if (!row.generated && !row.error) row.error = stopping ? 'Generation stopped before processing this resume' : 'Not processed';
    const completed = rows.filter(row => row.generated).length;
    status.textContent = rows.length ? `${completed} of ${rows.length} candidates processed.${completed < rows.length ? ' Unprocessed rows are marked in Notes. Generate again to retry; saved rows are reused.' : ' Ready to download.'}` : 'There are no candidate accounts to export yet.';
  } catch (error) { rows = []; status.textContent = error.message || 'Could not load candidates.'; }
  finally {
    busy = false; prompt.disabled = false; generate.disabled = !configured; stop.hidden = true;
    keyOpen.disabled = !canConfigure;
    root.querySelector('#checkCandidateExportConnection').disabled = false;
    refreshSpreadsheet.disabled = false;
    render();
  }
});

download.addEventListener('click', () => {
  if (busy || !rows.length) return;
  const url = URL.createObjectURL(new Blob([candidateCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = `hire-from-sa-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
