// A dismissed or unanswered permission prompt must not lock onboarding forever.
export async function requestCameraStream(constraints, { mediaDevices = navigator.mediaDevices, timeoutMs = 30000 } = {}) {
  let expired = false;
  let timer;
  const request = Promise.resolve().then(() => mediaDevices.getUserMedia(constraints)).then(stream => {
    if (expired) { stream.getTracks().forEach(track => track.stop()); throw new Error('Camera startup timed out. Retry, upload a file, or continue without an optional intro.'); }
    return stream;
  });
  try {
    return await Promise.race([request, new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('Camera startup timed out. Retry, upload a file, or continue without an optional intro.')); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
