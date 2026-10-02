import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const owner = 'b9a61fa6-a2e7-449c-8d4f-e5baaf3aaf21';
const user = { id: owner, email_confirmed_at: 'now', app_metadata: { account_role: 'candidate' }, user_metadata: {} };
const folder = `candidate-profiles/${owner}`;
function harness(overrides = {}) {
  const state = { user, profile: { resume_path: `${owner}/resume.txt`, profile_photo_path: '' }, identityComplete: true, objects: new Map(), writes: [], checks: [], profileError: null, storageError: null, failUpload: '', progress: {}, progressError: null, ...overrides };
  const storage = {
    async list(path, options) {
      state.checks.push({ path, options });
      if (state.storageError) return { data: null, error: state.storageError };
      return { data: [...state.objects.keys()].filter(key => key.startsWith(path + '/')).map(key => ({ name: key.slice(path.length + 1) })).filter(file => file.name.includes(options.search || '')).slice(0, options.limit), error: null };
    },
    async upload(path, file) {
      state.writes.push(path);
      if (state.failUpload && path.includes(state.failUpload)) return { error: new Error('Upload failed') };
      state.objects.set(path, file); return { error: null };
    },
    async download(path) { return { data: state.objects.get(path) || null, error: null }; },
    async remove(paths) { paths.forEach(path => state.objects.delete(path)); return { error: null }; },
  };
  const admin = {
    auth: { getUser: async token => ({ data: { user: token ? state.user : null }, error: null }) },
    storage: { from(bucket) { assert.equal(bucket, 'sava-id-review-videos'); return storage; } },
    from(table) {
      let updating = false;
      return {
        select() { return this; },
        eq(key, value) { assert.equal(key, 'user_id'); assert.equal(value, owner); return this; },
        update(values) { Object.assign(state.profile, values); updating = true; return this; },
        async upsert(values) { assert.equal(table, 'candidate_onboarding'); assert.equal(values.user_id, owner); if (state.progressError) return { error: state.progressError }; Object.assign(state.progress, values); return { error: null }; },
        async maybeSingle() { return { data: table === 'candidate_profiles' ? updating ? { user_id: owner } : state.profile : { ...state.progress, identity_completed_at: state.identityComplete ? 'now' : null }, error: table === 'candidate_profiles' ? state.profileError : null }; },
      };
    },
  };
  function handlerFor(name) {
    let handler;
    const source = stripTypeScriptTypes(readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), { mode: 'strip' });
    vm.runInNewContext(source, { createClient: () => admin, Deno: { env: { get: () => 'test' }, serve: fn => handler = fn }, Response, File, Blob, crypto, console: { error() {} } });
    return handler;
  }
  const ids = handlerFor('submit-id-photos');
  const headshot = handlerFor('submit-profile-photo');
  const video = handlerFor('submit-id-video');
  async function request(handler, form, token = true) {
    const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { origin: 'https://www.hirefromsa.com', ...(token ? { authorization: 'Bearer test' } : {}) }, body: form }));
    return { status: response.status, body: await response.json() };
  }
  return {
    state,
    async submitVideo(reference) { const form = new FormData(); form.append('video', new File(['video fixture'], 'video.webm', { type: 'video/webm' })); form.append('reviewReference', reference); return request(video, form); },
    async saveHeadshot(type) { const form = new FormData(); form.append('photo', new File(['headshot fixture'], 'photo', { type })); return request(headshot, form); },
    async submit({ hint, token = true, badFile = false } = {}) {
      const form = new FormData();
      form.append('front', new File(['front fixture'], 'front.jpg', { type: badFile ? 'text/plain' : 'image/jpeg' }));
      form.append('back', new File(['back fixture'], 'back.png', { type: 'image/png' }));
      if (hint !== undefined) form.append('profilePhotoPath', hint);
      return request(ids, form, token);
    },
  };
}

test('a headshot upload can continue into ID uploads for every supported headshot format', async () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const h = harness();
    const uploaded = await h.saveHeadshot(type);
    assert.equal(uploaded.status, 201);
    assert.equal(h.state.profile.profile_photo_path, uploaded.body.path);
    const result = await h.submit(); // No browser photo cache is needed.
    assert.equal(result.status, 201);
    const record = JSON.parse(await h.state.objects.get(`pending/${result.body.reference}/candidate.json`).text());
    assert.equal(record.profilePhotoPath, uploaded.body.path);
    assert.equal(record.userId, owner);
    assert.equal(h.state.progress.review_reference, result.body.reference);
    assert.ok(h.state.progress.identity_photos_uploaded_at);
    assert.equal(h.state.checks[0].options.search, uploaded.body.path.slice(folder.length + 1));
  }
});
test('legacy headshots still work and stale or forged browser paths cannot override the saved photo', async () => {
  const h = harness({ profile: { profile_photo_path: `${folder}/profile` } });
  h.state.objects.set(`${folder}/profile`, new Blob(['legacy']));
  for (const hint of ['', 'candidate-profiles/someone-else/profile', `${folder}/profile-old.jpg`]) {
    const result = await h.submit({ hint });
    assert.equal(result.status, 201);
    const record = JSON.parse(await h.state.objects.get(`pending/${result.body.reference}/candidate.json`).text());
    assert.equal(record.profilePhotoPath, `${folder}/profile`);
  }
});
test('replacement headshot is checked even after many earlier uploads', async () => {
  const h = harness();
  for (let i = 0; i < 15; i++) await h.saveHeadshot('image/jpeg');
  const latest = await h.saveHeadshot('image/png');
  assert.equal((await h.submit({ hint: `${folder}/profile` })).status, 201);
  assert.equal(h.state.checks[0].options.search, latest.body.path.slice(folder.length + 1));
});
test('missing, foreign or invalid saved photos cannot authorize ID uploads', async () => {
  for (const path of ['', 'candidate-profiles/someone-else/profile', `${folder}/../profile`, `${folder}/profile-other.jpg`]) {
    const h = harness({ profile: { profile_photo_path: path } });
    h.state.objects.set(path || `${folder}/profile`, new Blob(['fixture']));
    assert.equal((await h.submit({ hint: `${folder}/profile` })).status, 400);
    assert.equal(h.state.writes.length, 0);
  }
  const missing = harness({ profile: { profile_photo_path: `${folder}/profile` } });
  assert.equal((await missing.submit()).status, 400);
  assert.equal(missing.state.writes.length, 0);
});
test('account verification, candidate role and image validation remain required', async () => {
  for (const [overrides, submission, status] of [
    [{}, { token: false }, 401],
    [{ user: { ...user, email_confirmed_at: null } }, {}, 401],
    [{ user: { ...user, app_metadata: { account_role: 'employer' } } }, {}, 403],
    [{}, { badFile: true }, 400],
  ]) {
    const h = harness({ profile: { profile_photo_path: `${folder}/profile` }, ...overrides });
    h.state.objects.set(`${folder}/profile`, new Blob(['fixture']));
    assert.equal((await h.submit(submission)).status, status);
    assert.equal(h.state.writes.length, 0);
  }
});
test('profile and storage lookup errors permit retry without claiming the headshot is missing', async () => {
  for (const failure of ['profileError', 'storageError']) {
    const h = harness({ profile: { profile_photo_path: `${folder}/profile` }, [failure]: new Error('Temporary outage') });
    assert.equal((await h.submit()).status, 500);
    assert.equal(h.state.writes.length, 0);
  }
});
test('a failed ID upload removes partial files and leaves the saved headshot intact', async () => {
  const h = harness({ failUpload: 'id-back' });
  const photo = await h.saveHeadshot('image/jpeg');
  assert.equal((await h.submit()).status, 500);
  assert.deepEqual([...h.state.objects.keys()], [photo.body.path]);
});

test('photo success requires account progress to save; failed saves clean up the review folder', async () => {
  const h = harness({ progressError: new Error('Progress save failed') });
  const photo = await h.saveHeadshot('image/jpeg');
  assert.equal((await h.submit()).status, 500);
  assert.deepEqual([...h.state.objects.keys()], [photo.body.path]);
  assert.equal(h.state.progress.review_reference, undefined);
});

test('new photos reset the old video/contract and only the latest photo set can receive a video', async () => {
  const h = harness({ progress: { identity_video_uploaded_at: 'old', contract_accepted_at: 'old', contract_name: 'Name', contract_version: 'old' } });
  await h.saveHeadshot('image/jpeg');
  const first = await h.submit();
  assert.equal(h.state.progress.identity_video_uploaded_at, null);
  assert.equal(h.state.progress.contract_accepted_at, null);
  assert.equal(h.state.progress.identity_completed_at, null);
  assert.equal(h.state.progress.platform_completed_at, null);
  const latest = await h.submit();
  assert.equal((await h.submitVideo(first.body.reference)).status, 409);
  assert.equal((await h.submitVideo(latest.body.reference)).status, 202);
  assert.ok(h.state.progress.identity_video_uploaded_at);
  assert.equal(h.state.progress.review_reference, latest.body.reference);
});
test('ID photos and private video can be submitted before the post-submission review guide', async () => {
  const h = harness({ identityComplete: false });
  await h.saveHeadshot('image/jpeg');
  const photos = await h.submit();
  assert.equal(photos.status, 201);
  assert.equal((await h.submitVideo(photos.body.reference)).status, 202);
  assert.ok(h.state.progress.identity_video_uploaded_at);
  assert.equal(h.state.progress.identity_completed_at, null);
});
test('approved identity cannot be reset by an old ID upload page', async () => {
  const h = harness({ profile: { profile_photo_path: `${folder}/profile`, verification_status: 'verified' } });
  h.state.objects.set(`${folder}/profile`, new Blob(['fixture']));
  assert.equal((await h.submit()).status, 409);
  assert.equal((await h.submitVideo('SA-ABCDEF12')).status, 409);
  assert.equal(h.state.writes.length, 0);
});
