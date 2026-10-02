// Portfolio links are optional, public profile fields. Never accept executable URLs.
export function parsePortfolioLinks(value) {
  if (value == null || value === '') return [];
  if (typeof value !== 'string' && !Array.isArray(value)) throw new Error('Add portfolio links one per line.');
  const entries = typeof value === 'string' ? value.split(/\r?\n/) : value;
  const links = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') throw new Error('Add portfolio links one per line.');
    const text = entry.trim();
    if (!text) continue;
    if (text.length > 2048 || /\s/.test(text) || !/^https?:\/\//i.test(text)) throw new Error('Use complete portfolio links starting with https:// or http://, one per line.');
    let url;
    try { url = new URL(text); } catch { throw new Error('Enter a valid website URL for each portfolio link.'); }
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Enter a valid website URL without login details.');
    if (!links.includes(url.href)) links.push(url.href);
    if (links.length > 5) throw new Error('Add up to five portfolio links.');
  }
  return links;
}

export function publicPortfolioLinks(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(entry => {
    try { return parsePortfolioLinks([entry]); } catch { return []; }
  }))].slice(0, 5);
}
