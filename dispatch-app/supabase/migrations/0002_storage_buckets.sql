-- Private storage buckets for timesheet slip photos and dispatch attachments.
-- No public access and no storage RLS policies are needed: every upload/read
-- goes through short-lived signed URLs minted server-side with the
-- service-role key (see api/uploads.js and api/timesheets.js's `pending`
-- action) — the buckets themselves stay fully private.

insert into storage.buckets (id, name, public)
values
  ('timesheet-photos', 'timesheet-photos', false),
  ('dispatch-attachments', 'dispatch-attachments', false)
on conflict (id) do nothing;
