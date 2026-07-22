const { randomUUID } = require('node:crypto');
const Busboy = require('busboy');
const { put } = require('@vercel/blob');

const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['video/webm', 'video/mp4']);

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return response.status(503).json({ error: 'The private review store is not configured yet.' });
  }

  let video;
  let failed = false;
  const busboy = Busboy({ headers: request.headers, limits: { files: 1, fileSize: MAX_VIDEO_BYTES } });

  busboy.on('file', (field, stream, info) => {
    if (field !== 'video' || !ALLOWED_TYPES.has(info.mimeType)) {
      failed = true;
      stream.resume();
      return;
    }
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('limit', () => { failed = true; });
    stream.on('end', () => { video = { buffer: Buffer.concat(chunks), mimeType: info.mimeType }; });
  });

  busboy.on('error', () => response.status(400).json({ error: 'The review video could not be read.' }));
  busboy.on('finish', async () => {
    if (failed || !video?.buffer?.length) return response.status(400).json({ error: 'Send one video under 4 MB in WebM or MP4 format.' });
    try {
      const reference = `SA-${randomUUID().slice(0, 8).toUpperCase()}`;
      const extension = video.mimeType === 'video/mp4' ? 'mp4' : 'webm';
      const pathname = `manual-reviews/pending/${reference}/id-video.${extension}`;
      const uploaded = await put(pathname, video.buffer, { access: 'private', contentType: video.mimeType, addRandomSuffix: false });
      await put(`manual-reviews/pending/${reference}/review.json`, JSON.stringify({ reference, status: 'pending', submittedAt: new Date().toISOString(), videoPathname: uploaded.pathname }), { access: 'private', contentType: 'application/json', addRandomSuffix: false });
      return response.status(202).json({ reference, status: 'pending' });
    } catch (error) {
      return response.status(500).json({ error: 'The private review store could not save the video.' });
    }
  });

  request.pipe(busboy);
};

module.exports.config = { api: { bodyParser: false } };
