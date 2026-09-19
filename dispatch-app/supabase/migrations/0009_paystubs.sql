-- Admin-uploaded paystub documents (e.g. exported from QuickBooks after
-- running payroll), shown to each employee in their own portal.
create table paystubs (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references profiles(id),
  label text not null,
  storage_path text not null,
  file_name text,
  uploaded_by uuid not null references profiles(id),
  uploaded_at timestamptz not null default now()
);

alter table paystubs enable row level security;

-- Defense-in-depth only -- the API always uses the service-role key and
-- enforces admin-only writes / own-paystubs-only reads in code, same as
-- every other table in this schema.
create policy "workers can view their own paystubs"
  on paystubs for select
  using (worker_id = auth.uid());

-- Private storage bucket, same pattern as the existing buckets: no public
-- access, every read/write goes through a short-lived signed URL minted
-- server-side with the service-role key.
insert into storage.buckets (id, name, public)
values ('paystubs', 'paystubs', false)
on conflict (id) do nothing;
