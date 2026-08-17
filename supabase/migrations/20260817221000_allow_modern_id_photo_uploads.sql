update storage.buckets
set
  file_size_limit = 8388608,
  allowed_mime_types = array[
    'video/webm',
    'video/mp4',
    'application/json',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
where id = 'sava-id-review-videos';
