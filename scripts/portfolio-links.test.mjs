import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePortfolioLinks, publicPortfolioLinks } from '../supabase/functions/_shared/portfolio-links.mjs';

test('blank portfolios are optional; links normalize and deduplicate', () => {
  for (const blank of [undefined, null, '', ' \n ', []]) assert.deepEqual(parsePortfolioLinks(blank), []);
  assert.deepEqual(parsePortfolioLinks(' HTTPS://EXAMPLE.COM\r\nhttps://example.com/\nhttps://example.com/work '), ['https://example.com/', 'https://example.com/work']);
});
test('portfolio validation rejects malformed, executable, credential and oversized URLs', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/a', 'example.com', 'https://', 'https://example.com/a b', 'https://u:p@example.com', 'https://example.com/'+'a'.repeat(2049), 42, [null], Array.from({length:6}, (_,i)=>`https://example.com/${i}`)]) assert.throws(() => parsePortfolioLinks(bad));
  assert.deepEqual(publicPortfolioLinks(['javascript:alert(1)', 'https://example.com/work']), ['https://example.com/work']);
});
