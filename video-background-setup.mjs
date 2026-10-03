import { createVirtualBackground } from './virtual-background.mjs';

export async function prepareVideoBackground(options, { create = createVirtualBackground, timeoutMs = 30000 } = {}) {
  let expired = false;
  let timer;
  const timeoutError = () => new Error('The background took too long to start. Retry the camera or upload your video.');
  const setup = Promise.resolve().then(() => create({
    ...options,
    onError(error) { if (!expired) options.onError?.(error); },
  })).then(effect => {
    // A timed-out setup can finish after the candidate has started another take.
    if (expired) { effect.stop(); throw timeoutError(); }
    return effect;
  });
  try {
    return await Promise.race([
      setup,
      new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(timeoutError()); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
