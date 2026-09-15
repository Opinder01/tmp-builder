-- "Contractor" in the owner's terminology = the company that hired Crown
-- Traffic for a job (a general contractor / client), NOT a worker_type.
-- Kept separate from the QuickBooks customer field on dispatches (which only
-- matters once QuickBooks is connected) so this list is always usable.
create table client_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

alter table dispatches
  add column client_company_id uuid references client_companies(id),
  add column client_company_name text;
