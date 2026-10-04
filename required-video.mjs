export function mountRequiredVideo(root, { src, title, completed = false, unpausable = false, autoplay = false, minimal = false, onComplete = () => {} }) {
  const doc = root.ownerDocument;
  const video = doc.createElement('video');
  video.src = src;
  video.preload = 'auto';
  video.autoplay = autoplay;
  video.muted = false;
  video.volume = 1;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.setAttribute('aria-label', title);
  video.style.cssText = 'display:block;width:100%;aspect-ratio:16/9;background:#12213a;border-radius:12px';
  // Use our own accessible control; required platform playback cannot be paused.
  const play = doc.createElement('button');
  play.type = 'button';
  play.className = 'onboarding-play';
  play.textContent = completed ? 'Replay video' : 'Play video';
  const progress = doc.createElement('progress');
  progress.max = 100;
  progress.value = completed ? 100 : 0;
  progress.setAttribute('aria-label', 'Video watched');
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = completed ? 'Video complete. You can continue.' : unpausable ? 'Watch the full video to continue.' : 'Watch the full video to continue. You can pause at any time.';
  root.replaceChildren(video, play, progress, status);
  // Minimal mode: no play button or status text, only the video and its progress line.
  // If the browser blocks autoplay, tapping the video itself starts it.
  if (minimal) { play.hidden = true; status.hidden = true; }
  const needsTap = () => { if (minimal) root.classList?.add('needs-tap'); else play.hidden = false; };

  const watch = new WatchProgress();
  let lastTime = 0;
  let lastClock = performance.now();
  let complete = completed;
  let destroyed = false;
  let failed = false;
  const resetSample = () => { lastTime = video.currentTime; lastClock = performance.now(); };
  // Browsers block autoplay with sound until the person clicks something. Minimal videos
  // then start muted, and the first tap or key press anywhere turns the sound on.
  const unmute = () => {
    video.muted = false;
    root.classList?.remove('needs-sound');
    doc.removeEventListener('pointerdown', unmute, true);
    doc.removeEventListener('keydown', unmute, true);
  };
  const startPlayback = async () => {
    if (!video.paused) { if (video.muted) unmute(); else if (!unpausable) video.pause(); return; }
    try { if (video.error || failed) { failed = false; video.load(); } await video.play(); }
    catch {
      if (minimal && !video.muted) {
        try {
          video.muted = true;
          await video.play();
          root.classList?.add('needs-sound');
          doc.addEventListener('pointerdown', unmute, true);
          doc.addEventListener('keydown', unmute, true);
          return;
        } catch { video.muted = false; }
      }
      needsTap(); play.textContent = 'Play video'; status.textContent = 'Tap Play video to start with sound.';
    }
  };
  play.addEventListener('click', startPlayback);
  video.addEventListener('click', startPlayback);
  video.addEventListener('play', () => { root.classList?.remove('needs-tap'); failed = false; if (!complete && video.currentTime > watch.frontier + 0.05) video.currentTime = watch.frontier; resetSample(); if (unpausable) play.hidden = true; else play.textContent = 'Pause video'; });
  video.addEventListener('pause', () => {
    if (unpausable && !complete && !destroyed && !failed && !doc.hidden && !video.ended) {
      video.play().catch(() => { needsTap(); status.textContent = 'The video could not resume. Please try again.'; });
      return;
    }
    play.textContent = complete ? 'Replay video' : 'Resume video';
  });
  video.addEventListener('ratechange', () => { if (video.playbackRate !== 1) video.playbackRate = 1; });
  video.addEventListener('seeking', () => {
    if (!complete && video.currentTime > watch.frontier + 0.1) {
      video.currentTime = watch.frontier;
      status.textContent = 'Please watch this section before continuing.';
    }
    resetSample();
  });
  const update = () => {
    const clock = performance.now();
    if (!video.seeking && !doc.hidden && video.playbackRate === 1) {
      watch.observe(lastTime, video.currentTime, (clock - lastClock) / 1000, video.duration);
    }
    lastTime = video.currentTime;
    lastClock = clock;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      progress.value = complete ? 100 : Math.min(100, watch.frontier / video.duration * 100);
    }
  };
  video.addEventListener('timeupdate', update);
  video.addEventListener('ended', () => {
    if (complete) { play.textContent = 'Replay video'; return; }
    update();
    if (!watch.finished(video.duration)) {
      video.currentTime = watch.frontier;
      // Never auto-replay: wait for one tap to finish the part that was missed.
      if (minimal) { needsTap(); return; }
      play.hidden = false;
      play.textContent = 'Finish video';
      status.textContent = 'Please finish watching the video to continue.';
      return;
    }
    if (!complete) {
      complete = true;
      progress.value = 100;
      status.textContent = 'Video complete. You can continue.';
      play.textContent = 'Replay video';
      onComplete();
    }
  });
  video.addEventListener('loadedmetadata', () => { if (!complete && watch.frontier > 0) video.currentTime = Math.min(watch.frontier, video.duration || watch.frontier); });
  video.addEventListener('waiting', () => { if (!complete) status.textContent = 'Loading video… Playback will resume when ready.'; });
  video.addEventListener('playing', () => { if (!complete) status.textContent = unpausable ? 'Watch the full video to continue.' : 'Watch the full video to continue. You can pause at any time.'; });
  video.addEventListener('error', () => {
    failed = true;
    video.pause();
    play.hidden = false;
    play.textContent = 'Retry video';
    status.hidden = false;
    status.textContent = 'The video could not load. Check your connection, then select Retry video.';
  });
  const visibility = () => {
    if (doc.hidden) video.pause();
    else if (unpausable && !complete && !failed && !destroyed && video.currentTime > 0) video.play().catch(needsTap);
    resetSample();
  };
  doc.addEventListener('visibilitychange', visibility);
  if (autoplay) startPlayback();
  return { video, destroy() { destroyed = true; video.pause(); unmute(); doc.removeEventListener('visibilitychange', visibility); video.removeAttribute('src'); video.load(); root.replaceChildren(); } };
}

export class WatchProgress {
  frontier = 0;
  observe(from, to, elapsed, duration) {
    if (![from, to, elapsed, duration].every(Number.isFinite) || duration <= 0) return;
    const advance = to - from;
    // Only contiguous, normal-speed playback earns progress. Waiting, replaying,
    // seeking forward, or firing ended alone cannot unlock the next step.
    if (from <= this.frontier + 0.05 && advance > 0 && advance <= elapsed + 0.12 && elapsed >= 0) {
      this.frontier = Math.min(duration, Math.max(this.frontier, to));
    }
  }
  finished(duration) {
    return Number.isFinite(duration) && duration > 0 && this.frontier >= duration - 0.05;
  }
}
