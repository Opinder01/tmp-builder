-- Job number is no longer required when creating a dispatch.
alter table dispatches alter column job_number drop not null;
