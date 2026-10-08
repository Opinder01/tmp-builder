-- Advance bookings the admin logs for their own reference (however the
-- contractor booked: website, email, text, phone). A daily cron pushes the
-- admin a reminder the day before so they remember to dispatch flaggers.
-- Admin-only: RLS on with no policies, so only the service-role API reads it.
create table bookings (
  id uuid primary key default gen_random_uuid(),
  client_company_id uuid references client_companies(id) on delete set null,
  client_company_name text,
  start_time timestamptz not null,
  location text not null,
  flaggers_needed integer,
  source text not null default 'other' check (source in ('website', 'email', 'text', 'phone', 'other')),
  notes text,
  status text not null default 'booked' check (status in ('booked', 'dispatched')),
  created_at timestamptz not null default now()
);

alter table bookings enable row level security;
