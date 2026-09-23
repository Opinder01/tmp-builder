-- Per-shift role (e.g. TCP, LCT, TCS) for the worker on that dispatch --
-- distinct from a worker's general job_title on their profile, since the
-- same person can work different roles on different jobs. Shown on the
-- dashboard/schedules and helps pick the right QuickBooks billing item at
-- invoicing time.
alter table dispatches add column title text;
