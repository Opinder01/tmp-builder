-- Let the admin pre-select flaggers on an advance booking, and choose whether
-- those flaggers also get the day-before reminder (the admin always does).
-- Run once in the Supabase SQL editor.
alter table bookings
  add column if not exists worker_ids uuid[] not null default '{}',
  add column if not exists notify_flaggers boolean not null default false;
