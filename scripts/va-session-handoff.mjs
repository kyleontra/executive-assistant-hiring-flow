// Private local handoff of an existing QA browser session into the user's tab.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const state = JSON.parse(readFileSync('/tmp/hirefromsa-va-live-state.json', 'utf8'));
const origin = state.origins.find(item => item.origin === 'https://www.hirefromsa.com');
const saved = origin?.localStorage?.find(item => item.name === 'sb-jyxamdvvnoylaxolhlht-auth-token');
const session = JSON.parse(saved?.value || '{}');
if (!session.access_token || !session.refresh_token) throw new Error('QA session is unavailable.');
const fragment = new URLSearchParams({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: String(session.expires_in || 3600),
  token_type: 'bearer',
  type: 'signup',
});
const server = createServer((request, response) => {
  if (request.url !== '/open-va-dashboard') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(302, {
    Location: `https://www.hirefromsa.com/candidate-dashboard.html?tab=applications#${fragment}`,
    'Cache-Control': 'no-store',
  }).end();
  server.close();
});
server.listen(4179, '127.0.0.1', () => console.log('QA dashboard handoff ready.'));
setTimeout(() => server.close(), 60_000).unref();
