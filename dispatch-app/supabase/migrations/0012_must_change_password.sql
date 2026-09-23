-- Forces a password reset on next login. Set true for all existing workers
-- (they were created with an admin-chosen, possibly shared, password) and
-- false for existing admins (who don't go through this flow). New workers
-- get true explicitly at creation time in api/workers.js.
alter table profiles add column must_change_password boolean not null default true;
update profiles set must_change_password = false where role = 'admin';
