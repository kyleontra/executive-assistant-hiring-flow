export const MAX_HEADSHOT_BYTES = 4 * 1024 * 1024;
export const MAX_HEADSHOT_SOURCE_BYTES = 20 * 1024 * 1024;
export const HEADSHOT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function prepareHeadshot(file) {
  if (!file || !HEADSHOT_TYPES.has(file.type) || file.size === 0 || file.size > MAX_HEADSHOT_SOURCE_BYTES) {
    throw new Error('Choose a JPG, PNG, or WebP image no larger than 20 MB.');
  }
  if (file.size <= MAX_HEADSHOT_BYTES) return file;
  let image;
  try { image = await createImageBitmap(file); }
  catch { throw new Error('This image could not be opened. Try saving it as a JPG or PNG first.'); }
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare your image. Try a smaller JPG.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.56]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size > 0 && blob.size <= MAX_HEADSHOT_BYTES) {
        return new File([blob], 'headshot.jpg', { type: 'image/jpeg' });
      }
    }
    throw new Error('This image is too large to prepare. Try a smaller JPG or PNG.');
  } finally { image.close?.(); }
}
