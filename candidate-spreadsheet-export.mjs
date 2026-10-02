export const candidateColumns = ['Name', 'Status', 'Rate', 'Country', 'Resume Text', 'Notes', 'Skills', 'Tools', 'industries'];
export function candidateCells(row) {
  const join = value => Array.isArray(value) ? value.join(', ') : '';
  return [row.name, row.status, row.rate, row.country, row.resumeError ? `[Unavailable] ${row.resumeError}` : row.resumeText, row.error ? `[Not processed] ${row.error}` : row.notes, join(row.skills), join(row.tools), join(row.industries)];
}
function csvCell(value) {
  let text = String(value ?? '');
  // CSV quoting alone does not stop spreadsheet programs from executing formulas.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function candidateCsv(rows) {
  return '\uFEFF' + [candidateColumns, ...rows.map(candidateCells)].map(cells => cells.map(csvCell).join(',')).join('\r\n');
}
