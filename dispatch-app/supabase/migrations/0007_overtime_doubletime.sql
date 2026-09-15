-- Optional overtime/doubletime rate items per dispatch, since real rate
-- cards aren't a clean 1.5x/2x multiplier of the regular rate (confirmed
-- against Crown's actual QuickBooks invoices) — admin sets these explicitly
-- per job when they apply, same as the existing regular item/rate.
alter table dispatches
  add column qbo_ot_item_id text,
  add column qbo_ot_item_name text,
  add column ot_rate numeric,
  add column qbo_dt_item_id text,
  add column qbo_dt_item_name text,
  add column dt_rate numeric;
