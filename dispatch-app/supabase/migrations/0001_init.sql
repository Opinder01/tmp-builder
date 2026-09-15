-- dispatch-app initial schema
-- Run against a NEW, dedicated Supabase project (do not reuse tmpbuilder.ca's project/tables).

create extension if not exists "pgcrypto";

create type worker_type as enum ('employee', 'contractor');
create type user_role as enum ('admin', 'worker');
create type timesheet_status as enum ('pending', 'approved', 'rejected');
create type sync_target as enum ('invoice', 'vendor_bill', 'payroll_time_activity');
create type sync_status as enum ('pending', 'success', 'failed');

-- Mirrors auth.users 1:1
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'worker',
  worker_type worker_type,
  full_name text not null,
  phone text,
  email text not null,
  qbo_employee_id text,
  qbo_vendor_id text,
  contracted_hours_per_period numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table dispatches (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  customer_qbo_id text,
  location text not null,
  start_time timestamptz not null,
  notes text,
  worker_id uuid not null references profiles(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  status text not null default 'assigned'
);

create table dispatch_attachments (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references dispatches(id) on delete cascade,
  storage_path text not null,
  file_name text,
  content_type text,
  uploaded_at timestamptz not null default now()
);

create table timesheets (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references dispatches(id) unique,
  worker_id uuid not null references profiles(id),
  slip_photo_path text not null,
  typed_start_time timestamptz not null,
  typed_end_time timestamptz not null,
  break_minutes integer not null default 0,
  calculated_hours numeric generated always as (
    round(extract(epoch from (typed_end_time - typed_start_time)) / 3600.0 - break_minutes / 60.0, 2)
  ) stored,
  status timesheet_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  rejection_reason text
);

create table hour_bank_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references profiles(id),
  timesheet_id uuid references timesheets(id),
  delta_hours numeric not null,
  reason text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table quickbooks_connection (
  id int primary key default 1 check (id = 1),
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  connected_by uuid references profiles(id),
  connected_at timestamptz not null default now(),
  environment text not null default 'production'
);

create table qbo_sync_log (
  id uuid primary key default gen_random_uuid(),
  target sync_target not null,
  timesheet_id uuid references timesheets(id),
  job_number text,
  worker_id uuid references profiles(id),
  qbo_entity_type text,
  qbo_entity_id text,
  request_payload jsonb,
  response_payload jsonb,
  status sync_status not null default 'pending',
  error_message text,
  created_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references profiles(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table reminder_log (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references dispatches(id),
  worker_id uuid not null references profiles(id),
  sent_at timestamptz not null default now()
);

-- Row Level Security: workers can only read their own rows.
-- API functions use the service-role key (bypasses RLS) and enforce admin/worker
-- authorization in code — this is defense in depth, not the primary gate.
alter table profiles enable row level security;
alter table dispatches enable row level security;
alter table dispatch_attachments enable row level security;
alter table timesheets enable row level security;
alter table hour_bank_entries enable row level security;

create policy "workers read own profile" on profiles
  for select using (id = auth.uid());

create policy "workers read own dispatches" on dispatches
  for select using (worker_id = auth.uid());

create policy "workers read own dispatch attachments" on dispatch_attachments
  for select using (
    dispatch_id in (select id from dispatches where worker_id = auth.uid())
  );

create policy "workers read own timesheets" on timesheets
  for select using (worker_id = auth.uid());

create policy "workers read own hour bank entries" on hour_bank_entries
  for select using (worker_id = auth.uid());
