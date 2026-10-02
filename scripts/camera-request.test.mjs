import test from 'node:test';
import assert from 'node:assert/strict';
import { requestCameraStream } from '../camera-request.mjs';
test('a pending camera prompt times out and releases any stream arriving later', async () => {
  let resolve, stopped = 0;
  const mediaDevices = { getUserMedia: () => new Promise(done => { resolve = done; }) };
  await assert.rejects(requestCameraStream({video:true}, {mediaDevices,timeoutMs:10}), /timed out/);
  resolve({getTracks:()=>[{stop(){stopped++}}]});
  await new Promise(done=>setImmediate(done));
  assert.equal(stopped, 1);
});
test('camera approval returns the stream and denied permission returns promptly', async () => {
  const stream = {getTracks:()=>[]};
  assert.equal(await requestCameraStream({video:true}, {mediaDevices:{getUserMedia:async()=>stream},timeoutMs:100}),stream);
  await assert.rejects(requestCameraStream({video:true}, {mediaDevices:{getUserMedia:async()=>{throw new Error('Permission denied')}},timeoutMs:100}),/Permission denied/);
});
