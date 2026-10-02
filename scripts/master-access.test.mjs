import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as access from '../supabase/functions/_shared/master-access.mjs';
const account = { id: 'master-id', username: 'master', employer_id: 'workspace-id', can_review: true, disabled: false, password_salt: 'test-salt', password_hash: '0'.repeat(64) };
const validToken = 'hfm_' + 'a'.repeat(64);
function database({ expires = Date.now() + 10000, disabled = false, missing = false, error = null } = {}) {
  return { from(table) {
    const result = { data: missing ? null : table === 'master_sessions' ? { account_id: account.id, expires_at: new Date(expires).toISOString() }
      : table === 'hirer_workspaces' ? { edit_token_hash: 'stable-hash' } : { ...account, disabled }, error };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => result, single: async () => result }; return q;
  } };
}
test('master token is opaque, formatted and hashed', async () => {
  assert.equal(await access.masterAccount({ from() { throw Error('must not query'); } }, 'candidate-jwt'), null);
  assert.equal((await access.masterHash(validToken)).length, 64);
});
test('valid master session yields only employer and review permissions, with no email', async () => {
  const principal = await access.masterAccount(database(), validToken);
  const user = access.masterUser(principal);
  assert.equal(user.app_metadata.account_role, 'employer');
  assert.equal(user.app_metadata.can_review, true);
  assert.equal(user.email, undefined);
  assert.equal(user.email_confirmed_at, undefined);
});
test('expired, revoked and disabled master sessions fail closed', async () => {
  for (const config of [{ expires: Date.now() - 1 }, { missing: true }, { disabled: true }]) {
    assert.equal(await access.masterAccount(database(config), validToken), null);
  }
  await assert.rejects(access.masterAccount(database({ error: Error('offline') }), validToken), /offline/);
});
test('master workspace access is bound to session and exact workspace', async () => {
  assert.equal(await access.masterWorkspaceHash(database(), validToken, 'workspace-id'), 'stable-hash');
  assert.equal(await access.masterWorkspaceHash(database(), validToken, 'other-workspace'), null);
  assert.equal(await access.masterWorkspaceHash(database({ expires: 0 }), validToken, 'workspace-id'), null);
});
function endpoint(admin) {
  let handler;
  const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/master-auth/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export async function', 'async function'));
  vm.runInNewContext(source, { ...access, createClient: () => admin, crypto, TextEncoder, Response,
    Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } } });
  return (body, origin = 'https://www.hirefromsa.com') => handler(new Request('https://test', {
    method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
test('master login rejects foreign origins and anonymous status', async () => {
  const call = endpoint({});
  assert.equal((await call({ action: 'login' }, 'https://evil.invalid')).status, 403);
  assert.equal((await call({ action: 'status' })).status, 401);
});
test('rate limit fails closed before credentials are read', async () => {
  const call = endpoint({ rpc: async () => ({ data: false }), from() { throw Error('must not query'); } });
  assert.equal((await call({ action: 'login', username: 'master', password: 'bad' })).status, 429);
});
test('incorrect password cannot issue a session', async () => {
  const db = database();
  db.rpc = async () => ({ data: true });
  assert.equal((await endpoint(db)({ action: 'login', username: 'master', password: 'bad' })).status, 401);
});
