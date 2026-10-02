import { createVirtualBackground } from './virtual-background.mjs';

const $ = selector => document.querySelector(selector);
const preview = $('#livePreview');
const source = $('#sourcePreview');
source.muted = true;
source.playsInline = true;
let sourceType = '';
let sourceStream;
let previewStream;
let effect;
let recorder;
let recordTimer;
let recordedUrl;
let preparing = false;
let discardTake = false;

function status(text, error = false) {
  const node = $('#testStatus');
  node.textContent = text;
  node.classList.toggle('error', error);
}

function controls() {
  const recording = recorder?.state === 'recording';
  $('#useCamera').disabled = preparing || recording;
  $('#useDemo').disabled = preparing || recording;
  $('#backgroundMode').disabled = preparing || recording;
  $('#customImage').disabled = preparing || recording;
  $('#applyBackground').disabled = preparing || recording || !sourceType;
  $('#startRecording').disabled = preparing || recording || !previewStream;
  $('#stopRecording').disabled = !recording;
  $('#stopSource').disabled = preparing || recording || !sourceType;
  $('#useCamera').setAttribute('aria-pressed', String(sourceType === 'camera'));
  $('#useDemo').setAttribute('aria-pressed', String(sourceType === 'demo'));
}

function stopSource() {
  effect?.stop(); effect = null;
  if (previewStream && previewStream !== sourceStream) previewStream.getTracks().forEach(track => track.stop());
  previewStream = null;
  sourceStream?.getTracks().forEach(track => track.stop()); sourceStream = null;
  source.pause(); source.srcObject = null; source.removeAttribute('src'); source.load();
  preview.pause(); preview.srcObject = null;
  $('#sourceComparison').hidden = true;
  $('#previewPlaceholder').hidden = false;
  $('#backgroundBadge').hidden = true;
  sourceType = '';
  controls();
}

function effectError(error) {
  discardTake = true;
  if (recorder?.state === 'recording') stopRecording();
  preview.pause(); preview.srcObject = null;
  previewStream = null;
  $('#previewPlaceholder').hidden = false;
  $('#backgroundBadge').hidden = true;
  status(`The background effect stopped: ${error.message}. Choose another effect or No effect, then apply it again.`, true);
  controls();
}

async function applyBackground() {
  if (!sourceType || preparing || recorder?.state === 'recording') return;
  preparing = true; controls();
  const mode = $('#backgroundMode').value;
  let nextEffect;
  try {
    if (mode === 'custom' && !$('#customImage').files?.[0]) throw new Error('Choose a background image first.');
    status(mode === 'none' ? 'Opening the camera view…' : 'Preparing the virtual background…');
    if (effect && mode !== 'none') {
      await effect.setBackground(mode, $('#customImage').files?.[0]);
      $('#backgroundBadge').textContent = $('#backgroundMode').selectedOptions[0].textContent;
      status('Preview ready. Record a sample to check the finished video. Nothing is uploaded.');
      return;
    }
    const previousEffect = effect;
    const previousStream = previewStream;
    effect = null;
    previewStream = null;
    previousEffect?.stop();
    if (!previousEffect && previousStream && previousStream !== sourceStream) previousStream.getTracks().forEach(track => track.stop());
    if (mode !== 'none') {
      nextEffect = await createVirtualBackground({
        video: source,
        cameraStream: sourceStream || new MediaStream(),
        mode,
        imageFile: $('#customImage').files?.[0],
        onError: effectError,
      });
    } else if (sourceType === 'demo' && !source.captureStream) {
      throw new Error('This browser cannot record the demo clip without a background effect.');
    }
    const nextStream = nextEffect?.stream || (sourceType === 'camera' ? sourceStream : source.captureStream());
    preview.srcObject = nextStream;
    preview.muted = true;
    await preview.play();
    effect = nextEffect;
    previewStream = nextStream;
    preview.dataset.processingDelegate = nextEffect?.delegate || 'none';
    $('#previewPlaceholder').hidden = true;
    $('#backgroundBadge').hidden = false;
    $('#backgroundBadge').textContent = $('#backgroundMode').selectedOptions[0].textContent;
    status('Preview ready. Record a sample to check the finished video. Nothing is uploaded.');
  } catch (error) {
    nextEffect?.stop();
    if (!effect && !previewStream) {
      preview.pause(); preview.srcObject = null;
      $('#previewPlaceholder').hidden = false;
      $('#backgroundBadge').hidden = true;
    }
    status(error.message || 'The background could not be applied.', true);
  } finally { preparing = false; controls(); }
}

async function startSource(type) {
  if (preparing || recorder?.state === 'recording') return;
  preparing = true; controls();
  try {
    let nextStream;
    if (type === 'camera') {
      status('Waiting for camera and microphone permission…');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera recording.');
      nextStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 720 }, height: { ideal: 405 }, facingMode: 'user' }, audio: true });
    }
    stopSource();
    sourceType = type;
    sourceStream = nextStream;
    if (type === 'camera') source.srcObject = nextStream;
    else { source.src = '/videos/video-intro-v2.mp4'; source.loop = true; }
    await source.play();
    $('#sourceComparison').hidden = false;
    preparing = false;
    await applyBackground();
  } catch (error) {
    stopSource();
    status(error.name === 'NotAllowedError' ? 'Camera or microphone permission was blocked. Allow access and try again, or use the demo clip.' : (error.message || 'The video source could not start.'), true);
  } finally { preparing = false; controls(); }
}

function stopRecording() {
  if (recorder?.state === 'recording') { preparing = true; recorder.stop(); }
  clearInterval(recordTimer);
  controls();
}

function startRecording() {
  if (!previewStream || recorder?.state === 'recording') return;
  try {
    const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    const chunks = [];
    discardTake = false;
    recorder = new MediaRecorder(previewStream, mimeType ? { mimeType } : {});
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      clearInterval(recordTimer);
      preparing = false;
      controls();
      if (discardTake) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      if (!blob.size) { status('The recording was empty. Try again.', true); return; }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      recordedUrl = URL.createObjectURL(blob);
      $('#recordedPreview').src = recordedUrl;
      $('#recordedCard').hidden = false;
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      $('#downloadRecording').href = recordedUrl;
      $('#downloadRecording').download = `virtual-background-test.${extension}`;
      status('Sample ready. Play it back below to review the saved effect.');
    };
    recorder.start();
    let seconds = 0;
    $('#recordTimer').textContent = 'Recording · 0:00 / 0:30';
    recordTimer = setInterval(() => {
      seconds++;
      $('#recordTimer').textContent = `Recording · 0:${String(seconds).padStart(2, '0')} / 0:30`;
      if (seconds >= 30) stopRecording();
    }, 1000);
    status('Recording your sample. Stop when you are ready.');
    controls();
  } catch (error) { status(error.message || 'This browser could not record the preview.', true); controls(); }
}

$('#useCamera').addEventListener('click', () => startSource('camera'));
$('#useDemo').addEventListener('click', () => startSource('demo'));
$('#backgroundMode').addEventListener('change', event => { $('#customImageLabel').hidden = event.target.value !== 'custom'; });
$('#applyBackground').addEventListener('click', applyBackground);
$('#startRecording').addEventListener('click', startRecording);
$('#stopRecording').addEventListener('click', stopRecording);
$('#stopSource').addEventListener('click', () => { stopSource(); status('Source turned off. Your sample remains available below.'); });
window.addEventListener('pagehide', () => {
  if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); }
  clearInterval(recordTimer);
  stopSource();
  if (recordedUrl) URL.revokeObjectURL(recordedUrl);
});
controls();
