import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareVideoBackground } from '../video-background-setup.mjs';

test('a stalled background returns a retryable error and cleans up a late result', async () => {
  let finish;
  let callback;
  let stopped = 0;
  let errors = 0;
  const pending = prepareVideoBackground({ onError() { errors++; } }, {
    timeoutMs: 10,
    create(options) { callback = options.onError; return new Promise(resolve => { finish = resolve; }); },
  });
  await assert.rejects(pending, /took too long.*Retry/);
  callback(new Error('old take'));
  finish({ stop() { stopped++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, 1);
  assert.equal(errors, 0);
});

test('a working background remains usable and forwards its recording errors', async () => {
  let callback;
  let errors = 0;
  const effect = { stop() {} };
  assert.equal(await prepareVideoBackground({ onError() { errors++; } }, {
    create(options) { callback = options.onError; return Promise.resolve(effect); },
  }), effect);
  callback(new Error('recording failed'));
  assert.equal(errors, 1);
});

test('an unavailable model returns its setup error without waiting for the deadline', async () => {
  await assert.rejects(prepareVideoBackground({}, {
    create() { throw new Error('Model unavailable'); },
  }), /Model unavailable/);
});
