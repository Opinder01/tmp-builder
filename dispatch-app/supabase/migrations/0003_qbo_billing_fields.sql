-- Fields needed to turn an approved timesheet into a QuickBooks invoice line
-- (admin picks these per-dispatch, since real rates vary by job/classification
-- in ways this app has no way to infer automatically) and a contractor bill.

alter table dispatches
  add column qbo_customer_name text,
  add column qbo_item_id text,
  add column qbo_item_name text,
  add column rate numeric;

-- Default pay rate used to compute a contractor's Bill amount on approval.
-- Not used for employees (payroll pay rates live in QuickBooks Payroll itself;
-- employees only get an hours push via TimeActivity, no rate needed here).
alter table profiles
  add column contractor_bill_rate numeric;
