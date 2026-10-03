// Read one frame without changing the visible player's playback or sending media elsewhere.
const pending = new Map();
export async function applyVideoThumbnail(player, { fallback = '' } = {}) {
  if (!player) return '';
  const src = player.currentSrc || player.getAttribute('src');
  if (!src) return '';
  if (fallback) player.poster = fallback;
  if (!pending.has(src)) {
    const work = new Promise(resolve => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto';
      let done = false;
      const finish = result => {
        if (done) return;
        done = true; clearTimeout(timeout); video.pause(); video.removeAttribute('src'); video.load(); resolve(result);
      };
      const capture = () => {
        if (!video.videoWidth || video.readyState < 2) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(640, video.videoWidth); canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL('image/webp', .8));
        } catch { finish(''); }
      };
      const timeout = setTimeout(() => finish(''), 12000);
      video.onloadeddata = () => {
        if (Number.isFinite(video.duration) && video.duration > .2) video.currentTime = Math.min(1, video.duration / 4);
        else capture();
      };
      video.onseeked = capture;
      video.onerror = () => finish('');
      video.src = src; video.load();
    });
    pending.set(src, work);
    if (pending.size > 24) pending.delete(pending.keys().next().value);
    work.then(result => { if (!result) pending.delete(src); });
  }
  const image = await pending.get(src);
  if (image && player.isConnected && (player.currentSrc || player.getAttribute('src')) === src) player.poster = image;
  return image;
}
