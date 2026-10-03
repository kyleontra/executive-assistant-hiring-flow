const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL = '/models/selfie_multiclass_256x256.tflite';
const BRAND_BACKGROUND_URL = '/assets/hire-from-sa-intro-background.png';

export const backgroundOptions = new Set(['brand', 'none', 'blur', 'blue', 'warm', 'custom']);

function drawBackground(context, video, mode, image, width, height) {
  if (mode === 'blur') {
    context.save();
    context.filter = 'blur(18px)';
    context.drawImage(video, -24, -24, width + 48, height + 48);
    context.restore();
  } else if (mode === 'custom' || mode === 'brand') {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    context.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
  } else {
    const gradient = context.createLinearGradient(0, 0, width, height);
    if (mode === 'blue') {
      gradient.addColorStop(0, '#163b70'); gradient.addColorStop(1, '#5b9ac8');
    } else {
      gradient.addColorStop(0, '#ded4c6'); gradient.addColorStop(1, '#aaa596');
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
}

async function loadCustomImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG, or WebP background image under 5 MB.');
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The background image could not be opened.');
    return image;
  } finally { URL.revokeObjectURL(url); }
}

async function loadBrandImage() {
  const image = new Image();
  image.src = BRAND_BACKGROUND_URL;
  try { await image.decode(); }
  catch { throw new Error('The Hire From SA background could not load. Try again.'); }
  return image;
}

export async function createVirtualBackground({ video, cameraStream, mode, imageFile, onError }) {
  if (!backgroundOptions.has(mode) || mode === 'none') throw new Error('Choose a virtual background first.');
  if (!HTMLCanvasElement.prototype.captureStream) throw new Error('This browser cannot record a virtual background. Retry in a supported browser or upload a video.');

  let backgroundMode = mode;
  let backgroundImage = mode === 'custom' ? await loadCustomImage(imageFile) : mode === 'brand' ? await loadBrandImage() : null;
  const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const modelAssetPath = new URL(MODEL_URL, location.origin).href;
  const options = delegate => ({
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO', outputConfidenceMasks: false, outputCategoryMask: true,
  });
  let segmenter;
  let delegate = 'GPU';
  try { segmenter = await ImageSegmenter.createFromOptions(vision, options(delegate)); }
  catch { delegate = 'CPU'; segmenter = await ImageSegmenter.createFromOptions(vision, options(delegate)); }
  const width = Math.min(video.videoWidth || 720, 720);
  const height = Math.round(width * (video.videoHeight || 405) / (video.videoWidth || 720));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const foreground = document.createElement('canvas');
  foreground.width = width; foreground.height = height;
  const maskCanvas = document.createElement('canvas');
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = Math.min(width, 512);
  analysisCanvas.height = Math.round(height * analysisCanvas.width / width);
  const context = canvas.getContext('2d');
  const foregroundContext = foreground.getContext('2d');
  const maskContext = maskCanvas.getContext('2d');
  const analysisContext = analysisCanvas.getContext('2d');
  if (!context || !foregroundContext || !maskContext || !analysisContext) { segmenter.close(); throw new Error('This browser cannot apply virtual backgrounds.'); }

  let stopped = false;
  let closed = false;
  let canvasStream;
  let frame = 0;
  let lastFrame = 0;
  let maskPixels;
  let visited;
  let queue;
  const stop = () => {
    if (closed) return;
    closed = true;
    stopped = true;
    cancelAnimationFrame(frame);
    canvasStream?.getTracks().forEach(track => track.stop());
    segmenter.close();
  };
  const render = (now) => {
    if (stopped) return;
    try {
      if (now - lastFrame >= 50 && video.readyState >= 2) {
        lastFrame = now;
        analysisContext.filter = 'brightness(2.2) contrast(1.05)';
        analysisContext.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
        analysisContext.filter = 'none';
        const result = segmenter.segmentForVideo(analysisCanvas, now);
        try {
          const person = result.categoryMask;
          if (!person) throw new Error('The person mask is unavailable.');
          const confidence = person.getAsUint8Array();
          if (!maskPixels || maskCanvas.width !== person.width || maskCanvas.height !== person.height) {
            maskCanvas.width = person.width; maskCanvas.height = person.height;
            maskPixels = maskContext.createImageData(person.width, person.height);
            visited = new Uint8Array(confidence.length);
            queue = new Int32Array(confidence.length);
          }
          for (let index = 0; index < confidence.length; index++) {
            const offset = index * 4;
            maskPixels.data[offset] = maskPixels.data[offset + 1] = maskPixels.data[offset + 2] = 255;
            maskPixels.data[offset + 3] = confidence[index] === 0 ? 0 : 255;
          }
          // Clear small, detached regions that show up as specks on solid backgrounds.
          visited.fill(0);
          const minArea = Math.round(confidence.length * 0.006);
          for (let index = 0; index < confidence.length; index++) {
            if (visited[index] || !maskPixels.data[index * 4 + 3]) continue;
            let head = 0; let tail = 0;
            queue[tail++] = index;
            visited[index] = 1;
            while (head < tail) {
              const current = queue[head++];
              const x = current % person.width;
              let neighbor = current - 1;
              if (x && !visited[neighbor] && maskPixels.data[neighbor * 4 + 3]) { visited[neighbor] = 1; queue[tail++] = neighbor; }
              neighbor = current + 1;
              if (x < person.width - 1 && !visited[neighbor] && maskPixels.data[neighbor * 4 + 3]) { visited[neighbor] = 1; queue[tail++] = neighbor; }
              neighbor = current - person.width;
              if (neighbor >= 0 && !visited[neighbor] && maskPixels.data[neighbor * 4 + 3]) { visited[neighbor] = 1; queue[tail++] = neighbor; }
              neighbor = current + person.width;
              if (neighbor < confidence.length && !visited[neighbor] && maskPixels.data[neighbor * 4 + 3]) { visited[neighbor] = 1; queue[tail++] = neighbor; }
            }
            if (tail < minArea) for (let member = 0; member < tail; member++) maskPixels.data[queue[member] * 4 + 3] = 0;
          }
          maskContext.putImageData(maskPixels, 0, 0);
          foregroundContext.clearRect(0, 0, width, height);
          foregroundContext.drawImage(video, 0, 0, width, height);
          foregroundContext.globalCompositeOperation = 'destination-in';
          foregroundContext.filter = 'blur(1.5px)';
          foregroundContext.drawImage(maskCanvas, 0, 0, width, height);
          foregroundContext.filter = 'none';
          foregroundContext.globalCompositeOperation = 'source-over';
          drawBackground(context, video, backgroundMode, backgroundImage, width, height);
          context.drawImage(foreground, 0, 0);
        } finally { result.close(); }
      }
      frame = requestAnimationFrame(render);
    } catch (error) {
      stop();
      onError?.(error);
    }
  };
  // Paint a composited frame before MediaRecorder starts so the video cannot begin with a raw frame.
  render(performance.now());
  if (stopped) throw new Error('The virtual background could not start. Retry the camera or upload a video.');
  canvasStream = canvas.captureStream(24);
  const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...cameraStream.getAudioTracks()]);
  return {
    canvas,
    delegate,
    stream: outputStream,
    async setBackground(nextMode, nextImageFile) {
      if (!backgroundOptions.has(nextMode) || nextMode === 'none') throw new Error('Choose a virtual background first.');
      const nextImage = nextMode === 'custom' ? await loadCustomImage(nextImageFile) : nextMode === 'brand' ? await loadBrandImage() : null;
      backgroundMode = nextMode;
      backgroundImage = nextImage;
    },
    stop,
  };
}
