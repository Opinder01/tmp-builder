-- Job title + wage, shown on an employee's own Profile tab. Employees only
-- (per owner's direction) — contractors keep contractor_bill_rate, which is
-- used purely for QuickBooks billing, not shown as a "wage".
alter table profiles
  add column job_title text,
  add column wage numeric;
