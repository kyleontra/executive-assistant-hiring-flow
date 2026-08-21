insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-redacted-resumes',
  'candidate-redacted-resumes',
  false,
  2097152,
  array['text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
