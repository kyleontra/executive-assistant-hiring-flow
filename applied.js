// "You've successfully applied" page shown right after a candidate applies.
// When the next-steps video is ready, put its URL here and it replaces the placeholder automatically.
const APPLIED_VIDEO_URL = '';

(function appliedPage() {
  try {
    const applied = JSON.parse(sessionStorage.getItem('hfsa-last-application') || 'null');
    if (applied?.title) {
      const line = document.querySelector('#appliedJob');
      line.textContent = applied.company ? `${applied.title} at ${applied.company}` : applied.title;
      line.hidden = false;
    }
  } catch { /* nothing to show */ }

  if (APPLIED_VIDEO_URL) {
    const video = document.createElement('video');
    video.src = APPLIED_VIDEO_URL;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='16' height='9' fill='%23000'/%3E%3C/svg%3E";
    video.setAttribute('aria-label', 'Next steps video');
    document.querySelector('#appliedVideo').replaceChildren(video);
  }
}());
