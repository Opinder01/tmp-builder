-- Link each contractor (client company) to a QuickBooks customer once, so
-- admin doesn't re-search for the same customer on every dispatch — the
-- Contractor picker alone now drives invoicing.
alter table client_companies
  add column qbo_customer_id text,
  add column qbo_customer_name text;
