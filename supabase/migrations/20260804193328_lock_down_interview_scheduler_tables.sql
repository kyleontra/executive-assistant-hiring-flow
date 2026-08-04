create policy "Block direct scheduler access"
  on public.interview_schedulers
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "Block direct booking access"
  on public.interview_bookings
  for all
  to anon, authenticated
  using (false)
  with check (false);
