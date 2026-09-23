-- Ties together dispatches created in the same "New Dispatch" submission
-- (one job sent to multiple workers) so the app can reliably show a worker
-- who their colleagues are on a shift, instead of guessing from matching
-- job_number/location/time. Existing rows each get their own random group
-- (a "group of one"), since there's no way to reconstruct true historical
-- groupings for dispatches created before this column existed.
alter table dispatches add column group_id uuid not null default gen_random_uuid();
