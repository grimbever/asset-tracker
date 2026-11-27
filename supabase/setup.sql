-- Asset Tracker setup
-- Paste this whole file into the Supabase SQL Editor once.
-- Running it again is safe: it creates anything that is missing and does not erase equipment, people, or photos.
-- You do not need the Supabase CLI. You do not need to be a developer.

-- Asset Tracker schema.
-- Multi-tenant from the first row: every tenant table has organization_id and row level security.
-- Asset and event ids are supplied by the app (client-generated UUIDs) so a later sync engine can slot in.
-- The event log is append-only. Asset changes go through the functions below, which write the event in the same transaction.
--
-- This file is safe to run more than once. It does not delete equipment.
--
-- Built in this milestone: organizations, roles, invites, people, locations, assets, photos, events.
-- Designed now, not wired in the app yet: consumables, kiosk devices, approval policies,
-- supply requests, work requests, work orders, maintenance, disposal records, procedures,
-- onboarding kits, and offboarding checklists.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  -- A normal edit or delete is rejected. Deleting the whole organization is allowed,
  -- because that cascade runs after the organization row is already gone.
  if tg_op = 'DELETE' and not exists (
    select 1 from public.organizations o where o.id = old.organization_id
  ) then
    return old;
  end if;
  raise exception 'This record is append-only and cannot be changed.';
end;
$$;

-- is_org_member and has_org_permission are created after memberships and
-- role_permissions. They are LANGUAGE sql, and Postgres checks those tables
-- at create time. A plpgsql body would wait until the function is called.

-- ---------------------------------------------------------------------------
-- Plans. Numbers are placeholders and are not enforced.
-- ---------------------------------------------------------------------------

create table if not exists public.plan_templates (
  id text primary key,
  name text not null,
  max_items integer not null check (max_items > 0),
  max_users integer not null check (max_users > 0),
  feature_flags jsonb not null default '{}'::jsonb,
  unlisted boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.plan_templates is
  'Placeholder plan records. Not prices, and not enforced. Stripe is a later phase.';

insert into public.plan_templates (id, name, max_items, max_users, feature_flags, unlisted, note)
values
  (
    'starter',
    'Starter',
    100,
    5,
    '{"kiosk":false,"consumables":false,"approvals":false,"work_orders":false,"sop_library":false,"disposal_compliance":false,"offboarding":false,"offline_sync":false}'::jsonb,
    false,
    'Example only. Not a price and not enforced.'
  ),
  (
    'team',
    'Team',
    500,
    15,
    '{"kiosk":true,"consumables":true,"approvals":true,"work_orders":true,"sop_library":false,"disposal_compliance":false,"offboarding":false,"offline_sync":false}'::jsonb,
    false,
    'Example only. Not a price and not enforced.'
  ),
  (
    'business',
    'Business',
    2500,
    40,
    '{"kiosk":true,"consumables":true,"approvals":true,"work_orders":true,"sop_library":true,"disposal_compliance":true,"offboarding":true,"offline_sync":true}'::jsonb,
    false,
    'Example only. Not a price and not enforced.'
  ),
  (
    'internal',
    'Internal',
    1000000,
    1000000,
    '{"kiosk":true,"consumables":true,"approvals":true,"work_orders":true,"sop_library":true,"disposal_compliance":true,"offboarding":true,"offline_sync":true}'::jsonb,
    true,
    'Generous defaults so the owner organization is never blocked. Limits are stored and not enforced.'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Identity and tenancy
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  timezone text not null default 'America/Chicago',
  plan_id text not null default 'internal' references public.plan_templates (id),
  max_items integer not null default 1000000 check (max_items > 0),
  max_users integer not null default 1000000 check (max_users > 0),
  feature_flags jsonb not null default '{}'::jsonb,
  next_tag_number integer not null default 1001 check (next_tag_number > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.organizations.max_items is 'Stored for a later plan check. Not enforced.';
comment on column public.organizations.feature_flags is 'Stored for a later plan check. Not enforced.';
comment on column public.organizations.next_tag_number is 'Next auto tag, formatted AT-1001, AT-1002, and so on.';

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  active boolean not null default true,
  assignable boolean not null default true,
  built_in boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, key),
  check (
    built_in = false
    or key in ('admin', 'manager', 'editor', 'requester', 'viewer', 'kiosk', 'field_tech', 'auditor')
  )
);

comment on table public.roles is
  'Per-organization roles. Field Tech and Auditor are seeded with active = false.';

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  permission text not null,
  unique (role_id, permission)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- SQL functions: the tables they read must already exist.
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_permission(p_org uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and rp.permission = p_permission
  );
$$;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role_id uuid not null references public.roles (id),
  token text not null unique check (char_length(token) >= 16),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.normalize_invite_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- People and places. Employees are not logins.
-- ---------------------------------------------------------------------------

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  email text,
  phone text,
  hire_date date,
  termination_date date,
  active boolean not null default true,
  user_id uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.locations is 'Flat list. No aisle, shelf, or bin tree, and no default named 1.';

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------

create table if not exists public.assets (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  tag_id text not null check (char_length(btrim(tag_id)) between 1 and 64),
  type text not null check (type in ('equipment', 'tool', 'trailer', 'dosing_gear', 'it')),
  status text not null default 'available' check (
    status in ('available', 'checked_out', 'in_repair', 'broken', 'missing', 'retired', 'disposed', 'destroyed')
  ),
  location_id uuid references public.locations (id) on delete restrict,
  assigned_employee_id uuid references public.employees (id) on delete set null,
  due_on date,
  group_label text,
  brand text,
  model text,
  serial text,
  vendor text,
  purchase_date date,
  cost numeric(12, 2) check (cost is null or cost >= 0),
  notes text,
  parent_asset_id uuid references public.assets (id) on delete set null,
  checkout_as_unit boolean not null default false,
  custom_fields jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_asset_id is null or parent_asset_id <> id)
);

comment on table public.assets is
  'Physical items. id is client-generated. Tag IDs are unique per organization, not globally.';

create unique index if not exists assets_org_tag_lower_idx
  on public.assets (organization_id, lower(tag_id));

create index if not exists assets_org_idx on public.assets (organization_id);
create index if not exists assets_parent_idx on public.assets (parent_asset_id);
create index if not exists assets_location_idx on public.assets (location_id);
create index if not exists assets_assignee_idx on public.assets (assigned_employee_id);

create table if not exists public.attachments (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete cascade,
  kind text not null default 'photo' check (kind in ('photo', 'document')),
  storage_path text not null,
  file_name text not null,
  content_type text,
  byte_size integer check (byte_size is null or byte_size >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.attachments is
  'Photos now. Documents (manuals, certificates) use the same table later. Files live in the asset-files bucket.';

-- ---------------------------------------------------------------------------
-- Append-only event log
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_kiosk_id uuid,
  actor_name text,
  from_state jsonb,
  to_state jsonb,
  notes text,
  payload jsonb not null default '{}'::jsonb
);

comment on table public.events is
  'Append-only. Corrections are new events. Client supplies the id. Offline sync is not built.';

create index if not exists events_subject_idx
  on public.events (organization_id, subject_type, subject_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Later features. Tables exist so the next milestones do not reshape tenancy.
-- The app does not write these yet. Select is limited to the member's organization.
-- ---------------------------------------------------------------------------

create table if not exists public.consumables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'each',
  quantity_on_hand numeric not null default 0,
  minimum_quantity numeric not null default 0,
  reorder_quantity numeric not null default 0,
  location_id uuid references public.locations (id) on delete set null,
  vendor text,
  group_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  consumable_id uuid not null references public.consumables (id) on delete cascade,
  kind text not null check (kind in ('add', 'take', 'correction', 'transfer', 'received', 'parts_used')),
  quantity_delta numeric not null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  location_id uuid references public.locations (id) on delete set null,
  token_hash text,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kiosk_devices is 'Named storeroom device. No personal login. The kiosk screen is a later milestone.';

create table if not exists public.approval_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  workflow_type text not null check (
    workflow_type in (
      'supply_request',
      'purchase_request',
      'work_order_signoff',
      'asset_disposal',
      'asset_issue'
    )
  ),
  enabled boolean not null default false,
  approver_role_key text,
  approver_employee_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, workflow_type)
);

comment on table public.approval_policies is
  'Per-organization approval toggles. All start off. Supply requests are the first workflow to honor the toggle, in a later milestone.';

create table if not exists public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  consumable_id uuid references public.consumables (id) on delete set null,
  quantity numeric,
  requester_name text,
  requester_user_id uuid,
  kiosk_device_id uuid references public.kiosk_devices (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'approved', 'ordered', 'fulfilled', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  details text,
  asset_id uuid references public.assets (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'converted', 'closed')),
  requester_user_id uuid,
  requester_name text,
  kiosk_device_id uuid references public.kiosk_devices (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid references public.work_requests (id) on delete set null,
  asset_id uuid references public.assets (id) on delete set null,
  title text not null,
  details text,
  assignee_employee_id uuid references public.employees (id) on delete set null,
  status text not null default 'open' check (
    status in ('open', 'assigned', 'in_progress', 'completed', 'signed_off')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.work_orders.status is 'signed_off is reserved for v1.5.';

create table if not exists public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete cascade,
  title text not null,
  due_on date,
  repeat text not null default 'off' check (repeat in ('off', 'weekly', 'monthly', 'yearly')),
  assigned_employee_id uuid references public.employees (id) on delete set null,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.disposal_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  asset_id uuid,
  method text check (method in ('shred', 'wipe', 'recycle', 'sold', 'donated', 'other')),
  performed_on date,
  performed_by text,
  witness text,
  sanitization_standard text,
  vendor text,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.disposal_records is
  'v1.5 compliance log. Immutable once written. Retained after the asset is gone. Not used by this milestone.';

create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  workflow_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.procedure_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  procedure_id uuid not null references public.procedures (id) on delete cascade,
  version integer not null,
  body text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (procedure_id, version)
);

create table if not exists public.procedure_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version_id uuid not null references public.procedure_versions (id) on delete cascade,
  position integer not null,
  instruction text not null
);

create table if not exists public.procedure_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version_id uuid not null references public.procedure_versions (id) on delete cascade,
  user_id uuid,
  employee_id uuid,
  acknowledged_at timestamptz not null default now()
);

create table if not exists public.onboarding_kit_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  target_label text,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_kit_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid not null references public.onboarding_kit_templates (id) on delete cascade,
  label text not null,
  asset_type text
);

create table if not exists public.offboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  status text not null default 'open',
  signed_off_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.offboarding_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  checklist_id uuid not null references public.offboarding_checklists (id) on delete cascade,
  asset_id uuid,
  state text not null default 'outstanding'
);

create table if not exists public.issue_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  asset_id uuid,
  employee_id uuid,
  event_id uuid,
  method text,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.issue_acknowledgments is 'v1.5 optional signature or received confirmation. Not used yet.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists memberships_updated_at on public.memberships;
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

drop trigger if exists locations_updated_at on public.locations;
create trigger locations_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

drop trigger if exists assets_updated_at on public.assets;
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

drop trigger if exists invites_email on public.invites;
create trigger invites_email before insert or update on public.invites
  for each row execute function public.normalize_invite_email();

drop trigger if exists events_no_update on public.events;
create trigger events_no_update before update on public.events
  for each row execute function public.reject_mutation();

drop trigger if exists events_no_delete on public.events;
create trigger events_no_delete before delete on public.events
  for each row execute function public.reject_mutation();

drop trigger if exists disposal_no_update on public.disposal_records;
create trigger disposal_no_update before update on public.disposal_records
  for each row execute function public.reject_mutation();

drop trigger if exists disposal_no_delete on public.disposal_records;
create trigger disposal_no_delete before delete on public.disposal_records
  for each row execute function public.reject_mutation();

create or replace function public.keep_an_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.user_id <> old.user_id or new.id <> old.id then
      raise exception 'Membership organization and user cannot change.';
    end if;
    if new.role_id = old.role_id then
      return new;
    end if;
  end if;

  if not exists (select 1 from public.roles r where r.id = old.role_id and r.key = 'admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1 from public.roles r where r.id = new.role_id and r.key = 'admin'
  ) then
    return new;
  end if;

  select count(*) into v_remaining
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.organization_id = old.organization_id
    and r.key = 'admin'
    and m.id <> old.id;

  if v_remaining < 1 then
    raise exception 'Keep at least one admin in this organization.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists memberships_keep_admin on public.memberships;
create trigger memberships_keep_admin before insert or update or delete on public.memberships
  for each row execute function public.keep_an_admin();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), ''),
    coalesce(new.email, '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Organization lifecycle and invites
-- ---------------------------------------------------------------------------

create or replace function public.seed_role(
  p_org uuid,
  p_key text,
  p_name text,
  p_description text,
  p_active boolean,
  p_assignable boolean,
  p_permissions text[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role uuid := gen_random_uuid();
  v_perm text;
begin
  insert into public.roles (id, organization_id, key, name, description, active, assignable, built_in)
  values (v_role, p_org, p_key, p_name, p_description, p_active, p_assignable, true);
  foreach v_perm in array p_permissions loop
    insert into public.role_permissions (id, organization_id, role_id, permission)
    values (gen_random_uuid(), p_org, v_role, v_perm);
  end loop;
  return v_role;
end;
$$;

create or replace function public.create_organization(
  p_id uuid,
  p_name text,
  p_timezone text,
  p_additional boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_name text;
  v_tz text;
  v_admin uuid;
  v_max_items integer;
  v_max_users integer;
  v_flags jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_id is null then
    raise exception 'Organization id is required';
  end if;

  if not coalesce(p_additional, false) then
    select m.organization_id into v_existing
    from public.memberships m
    where m.user_id = auth.uid()
    order by m.created_at
    limit 1;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if exists (select 1 from public.organizations o where o.id = p_id) then
    if exists (
      select 1 from public.memberships m
      where m.organization_id = p_id and m.user_id = auth.uid()
    ) then
      return p_id;
    end if;
    raise exception 'Organization id already used';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Enter an organization name.';
  end if;

  v_tz := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/Chicago');
  begin
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'Use a timezone like America/Chicago';
  end;

  select t.max_items, t.max_users, t.feature_flags
    into v_max_items, v_max_users, v_flags
  from public.plan_templates t
  where t.id = 'internal';

  insert into public.organizations (
    id, name, timezone, plan_id, max_items, max_users, feature_flags, created_by
  ) values (
    p_id,
    v_name,
    v_tz,
    'internal',
    coalesce(v_max_items, 1000000),
    coalesce(v_max_users, 1000000),
    coalesce(v_flags, '{}'::jsonb),
    auth.uid()
  );

  -- Built-in roles. Field Tech and Auditor stay inactive. Kiosk is not assigned to a person.
  v_admin := public.seed_role(p_id, 'admin', 'Admin', 'Full access, including users, invites, and organization settings.', true, true, array['approvals.act', 'approvals.configure', 'assets.checkout', 'assets.maintain', 'assets.move', 'assets.scan', 'assets.view', 'assets.write', 'exports.full', 'import.run', 'kiosk.manage', 'locations.manage', 'org.manage', 'people.manage', 'plan.manage', 'reports.run', 'requests.submit', 'settings.manage', 'stock.adjust', 'stock.take', 'subscriptions.manage', 'subscriptions.view', 'work_orders.complete', 'work_orders.convert']);
  perform public.seed_role(p_id, 'manager', 'Manager', 'Manage equipment, approve requests, and assign work. Cannot manage users or organization settings.', true, true, array['approvals.act', 'assets.checkout', 'assets.maintain', 'assets.move', 'assets.scan', 'assets.view', 'assets.write', 'reports.run', 'requests.submit', 'stock.adjust', 'stock.take', 'subscriptions.manage', 'subscriptions.view', 'work_orders.complete', 'work_orders.convert']);
  perform public.seed_role(p_id, 'editor', 'Editor', 'Add and edit equipment, check it out, and update records.', true, true, array['assets.checkout', 'assets.maintain', 'assets.move', 'assets.scan', 'assets.view', 'assets.write', 'reports.run', 'requests.submit', 'stock.adjust', 'stock.take', 'work_orders.complete']);
  perform public.seed_role(p_id, 'requester', 'Requester', 'Search or scan an item and submit a request.', true, true, array['assets.scan', 'requests.submit']);
  perform public.seed_role(p_id, 'viewer', 'Viewer', 'Look up equipment and reports. Cannot change anything.', true, true, array['assets.scan', 'assets.view', 'reports.run', 'subscriptions.view']);
  perform public.seed_role(p_id, 'kiosk', 'Kiosk', 'Storeroom device mode. The kiosk screen is not in this version.', true, false, array['assets.scan', 'requests.submit', 'stock.take']);
  perform public.seed_role(p_id, 'field_tech', 'Field Tech', 'Field checkout of assigned items. Turned off until a later version.', false, false, array['assets.checkout', 'assets.scan', 'assets.view_assigned', 'work_orders.complete']);
  perform public.seed_role(p_id, 'auditor', 'Auditor', 'Read-only history and exports. Turned off until a later version.', false, false, array['assets.scan', 'assets.view', 'exports.full', 'reports.run']);

  insert into public.memberships (id, organization_id, user_id, role_id)
  values (gen_random_uuid(), p_id, auth.uid(), v_admin);

  insert into public.approval_policies (id, organization_id, workflow_type, enabled)
  select gen_random_uuid(), p_id, workflow, false
  from unnest(array[
    'supply_request',
    'purchase_request',
    'work_order_signoff',
    'asset_disposal',
    'asset_issue'
  ]) as workflow;

  return p_id;
end;
$$;

create or replace function public.update_organization(
  p_id uuid,
  p_name text,
  p_timezone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_tz text;
begin
  if not public.has_org_permission(p_id, 'org.manage') then
    raise exception 'You cannot change organization settings.';
  end if;
  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Enter an organization name.';
  end if;
  v_tz := btrim(coalesce(p_timezone, ''));
  begin
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'Use a timezone like America/Chicago';
  end;
  update public.organizations
    set name = v_name, timezone = v_tz
    where id = p_id;
  return p_id;
end;
$$;

create or replace function public.preview_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select i.email, i.expires_at, i.accepted_at, o.name as org_name, r.name as role_name
    into v_row
  from public.invites i
  join public.organizations o on o.id = i.organization_id
  join public.roles r on r.id = i.role_id
  where i.token = p_token;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'email', v_row.email,
    'org_name', v_row.org_name,
    'role_name', v_row.role_name,
    'expired', v_row.expires_at < now(),
    'accepted', v_row.accepted_at is not null
  );
end;
$$;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select * into v_invite from public.invites where token = p_token;
  if not found then
    raise exception 'This invite link is not valid.';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used.';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite has expired. Ask an admin for a new one.';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' or v_email <> v_invite.email then
    raise exception 'Sign in with the invited email address.';
  end if;

  insert into public.memberships (id, organization_id, user_id, role_id)
  values (gen_random_uuid(), v_invite.organization_id, auth.uid(), v_invite.role_id)
  on conflict (organization_id, user_id) do nothing;

  update public.invites set accepted_at = now() where id = v_invite.id;
  return v_invite.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Asset functions. Each change writes one event with the id the app supplies.
-- ---------------------------------------------------------------------------

create or replace function public.write_event(
  p_id uuid,
  p_org uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_event_type text,
  p_from jsonb,
  p_to jsonb,
  p_notes text,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null then
    raise exception 'Event id is required';
  end if;
  insert into public.events (
    id, organization_id, subject_type, subject_id, event_type,
    actor_user_id, from_state, to_state, notes, payload
  ) values (
    p_id, p_org, p_subject_type, p_subject_id, p_event_type,
    auth.uid(), p_from, p_to, nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public.allocate_tag(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  candidate text;
  i integer;
begin
  for i in 1..30 loop
    update public.organizations
      set next_tag_number = next_tag_number + 1
      where id = p_org
      returning next_tag_number - 1 into n;
    candidate := 'AT-' || n::text;
    exit when not exists (
      select 1 from public.assets a
      where a.organization_id = p_org and lower(a.tag_id) = lower(candidate)
    );
  end loop;
  if candidate is null then
    raise exception 'Could not assign a tag.';
  end if;
  return candidate;
end;
$$;

create or replace function public.asset_state(p_asset public.assets)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'name', p_asset.name,
    'tag_id', p_asset.tag_id,
    'type', p_asset.type,
    'status', p_asset.status,
    'location_id', p_asset.location_id,
    'assigned_employee_id', p_asset.assigned_employee_id,
    'due_on', p_asset.due_on,
    'parent_asset_id', p_asset.parent_asset_id,
    'checkout_as_unit', p_asset.checkout_as_unit
  );
$$;

create or replace function public.create_asset(
  p_id uuid,
  p_organization_id uuid,
  p_event_id uuid,
  p_asset jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_type text;
  v_tag text;
  v_location uuid;
  v_parent uuid;
  v_cost numeric;
  v_custom jsonb;
  v_row public.assets%rowtype;
begin
  if not public.has_org_permission(p_organization_id, 'assets.write') then
    raise exception 'You cannot add equipment.';
  end if;
  if p_id is null or p_event_id is null then
    raise exception 'Asset id and event id are required';
  end if;

  v_name := btrim(coalesce(p_asset ->> 'name', ''));
  v_type := btrim(coalesce(p_asset ->> 'type', ''));
  if char_length(v_name) < 1 then
    raise exception 'Name is required.';
  end if;
  if v_type not in ('equipment', 'tool', 'trailer', 'dosing_gear', 'it') then
    raise exception 'Choose a type.';
  end if;

  v_tag := btrim(coalesce(p_asset ->> 'tag_id', ''));
  if v_tag = '' then
    v_tag := public.allocate_tag(p_organization_id);
  end if;

  v_location := nullif(p_asset ->> 'location_id', '')::uuid;
  v_parent := nullif(p_asset ->> 'parent_asset_id', '')::uuid;
  if v_location is not null and not exists (
    select 1 from public.locations l
    where l.id = v_location and l.organization_id = p_organization_id
  ) then
    raise exception 'That location is not in this organization.';
  end if;
  if v_parent is not null then
    if v_parent = p_id then
      raise exception 'An item cannot be its own parent.';
    end if;
    if not exists (
      select 1 from public.assets a
      where a.id = v_parent and a.organization_id = p_organization_id
    ) then
      raise exception 'The parent item is not in this organization.';
    end if;
  end if;

  v_custom := coalesce(p_asset -> 'custom_fields', '{}'::jsonb);
  if jsonb_typeof(v_custom) <> 'object' then
    raise exception 'Custom fields must be an object.';
  end if;

  if nullif(p_asset ->> 'cost', '') is null then
    v_cost := null;
  else
    v_cost := (p_asset ->> 'cost')::numeric;
    if v_cost < 0 then
      raise exception 'Cost must be zero or more.';
    end if;
  end if;

  insert into public.assets (
    id, organization_id, name, tag_id, type, status, location_id, group_label,
    brand, model, serial, vendor, purchase_date, cost, notes, parent_asset_id,
    checkout_as_unit, custom_fields, created_by
  ) values (
    p_id,
    p_organization_id,
    v_name,
    v_tag,
    v_type,
    'available',
    v_location,
    nullif(btrim(coalesce(p_asset ->> 'group_label', '')), ''),
    nullif(btrim(coalesce(p_asset ->> 'brand', '')), ''),
    nullif(btrim(coalesce(p_asset ->> 'model', '')), ''),
    nullif(btrim(coalesce(p_asset ->> 'serial', '')), ''),
    nullif(btrim(coalesce(p_asset ->> 'vendor', '')), ''),
    nullif(p_asset ->> 'purchase_date', '')::date,
    v_cost,
    nullif(btrim(coalesce(p_asset ->> 'notes', '')), ''),
    v_parent,
    coalesce((p_asset ->> 'checkout_as_unit')::boolean, false),
    v_custom,
    auth.uid()
  )
  returning * into v_row;

  perform public.write_event(
    p_event_id, p_organization_id, 'asset', p_id, 'created',
    null, public.asset_state(v_row), null,
    jsonb_build_object('name', v_row.name, 'tag_id', v_row.tag_id)
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_asset(
  p_id uuid,
  p_event_id uuid,
  p_asset jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.assets%rowtype;
  v_row public.assets%rowtype;
  v_name text;
  v_type text;
  v_tag text;
  v_location uuid;
  v_parent uuid;
  v_cost numeric;
  v_custom jsonb;
begin
  select * into v_old from public.assets where id = p_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_old.organization_id, 'assets.write') then
    raise exception 'You cannot edit equipment.';
  end if;

  v_name := btrim(coalesce(p_asset ->> 'name', ''));
  v_type := btrim(coalesce(p_asset ->> 'type', ''));
  v_tag := btrim(coalesce(p_asset ->> 'tag_id', ''));
  if char_length(v_name) < 1 then
    raise exception 'Name is required.';
  end if;
  if v_type not in ('equipment', 'tool', 'trailer', 'dosing_gear', 'it') then
    raise exception 'Choose a type.';
  end if;
  if v_tag = '' then
    v_tag := v_old.tag_id;
  end if;

  v_location := nullif(p_asset ->> 'location_id', '')::uuid;
  v_parent := nullif(p_asset ->> 'parent_asset_id', '')::uuid;
  if v_location is not null and not exists (
    select 1 from public.locations l
    where l.id = v_location and l.organization_id = v_old.organization_id
  ) then
    raise exception 'That location is not in this organization.';
  end if;
  if v_parent is not null then
    if v_parent = p_id then
      raise exception 'An item cannot be its own parent.';
    end if;
    if not exists (
      select 1 from public.assets a
      where a.id = v_parent and a.organization_id = v_old.organization_id
    ) then
      raise exception 'The parent item is not in this organization.';
    end if;
  end if;

  v_custom := coalesce(p_asset -> 'custom_fields', '{}'::jsonb);
  if jsonb_typeof(v_custom) <> 'object' then
    raise exception 'Custom fields must be an object.';
  end if;
  if nullif(p_asset ->> 'cost', '') is null then
    v_cost := null;
  else
    v_cost := (p_asset ->> 'cost')::numeric;
    if v_cost < 0 then
      raise exception 'Cost must be zero or more.';
    end if;
  end if;

  update public.assets set
    name = v_name,
    tag_id = v_tag,
    type = v_type,
    location_id = v_location,
    group_label = nullif(btrim(coalesce(p_asset ->> 'group_label', '')), ''),
    brand = nullif(btrim(coalesce(p_asset ->> 'brand', '')), ''),
    model = nullif(btrim(coalesce(p_asset ->> 'model', '')), ''),
    serial = nullif(btrim(coalesce(p_asset ->> 'serial', '')), ''),
    vendor = nullif(btrim(coalesce(p_asset ->> 'vendor', '')), ''),
    purchase_date = nullif(p_asset ->> 'purchase_date', '')::date,
    cost = v_cost,
    notes = nullif(btrim(coalesce(p_asset ->> 'notes', '')), ''),
    parent_asset_id = v_parent,
    checkout_as_unit = coalesce((p_asset ->> 'checkout_as_unit')::boolean, false),
    custom_fields = v_custom
  where id = p_id
  returning * into v_row;

  perform public.write_event(
    p_event_id, v_row.organization_id, 'asset', p_id, 'updated',
    public.asset_state(v_old), public.asset_state(v_row), null,
    jsonb_build_object('name', v_row.name, 'tag_id', v_row.tag_id)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.delete_asset(p_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.assets%rowtype;
begin
  select * into v_old from public.assets where id = p_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_old.organization_id, 'assets.write') then
    raise exception 'You cannot delete equipment.';
  end if;
  if exists (select 1 from public.assets c where c.parent_asset_id = p_id) then
    raise exception 'Unlink the pieces in this kit before deleting it.';
  end if;

  perform public.write_event(
    p_event_id, v_old.organization_id, 'asset', p_id, 'deleted',
    public.asset_state(v_old), null, null,
    jsonb_build_object('name', v_old.name, 'tag_id', v_old.tag_id)
  );
  delete from public.assets where id = p_id;
end;
$$;

create or replace function public.apply_checkout(
  p_asset public.assets,
  p_event_id uuid,
  p_employee_id uuid,
  p_location_id uuid,
  p_due_on date,
  p_note text,
  p_extra jsonb
) returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.assets%rowtype;
  v_name text;
  v_payload jsonb;
begin
  if p_asset.status = 'checked_out' then
    raise exception 'Already checked out.';
  end if;
  if p_asset.status in ('retired', 'disposed', 'destroyed') then
    raise exception 'Retired, disposed, and destroyed items stay on the register and are not checked out.';
  end if;
  if p_asset.status <> 'available' then
    raise exception 'Check this item in, or mark it available, before checking it out.';
  end if;

  if p_employee_id is not null then
    select e.name into v_name
    from public.employees e
    where e.id = p_employee_id
      and e.organization_id = p_asset.organization_id
      and e.active;
    if v_name is null then
      raise exception 'Choose an active person.';
    end if;
    update public.assets set
      status = 'checked_out',
      assigned_employee_id = p_employee_id,
      due_on = p_due_on
    where id = p_asset.id
    returning * into v_row;
    v_payload := jsonb_build_object('assignee_name', v_name, 'due_on', p_due_on);
  else
    if p_location_id is null or not exists (
      select 1 from public.locations l
      where l.id = p_location_id and l.organization_id = p_asset.organization_id
    ) then
      raise exception 'Choose a location.';
    end if;
    select l.name into v_name from public.locations l where l.id = p_location_id;
    update public.assets set
      status = 'checked_out',
      assigned_employee_id = null,
      location_id = p_location_id,
      due_on = p_due_on
    where id = p_asset.id
    returning * into v_row;
    v_payload := jsonb_build_object('location_name', v_name, 'due_on', p_due_on);
  end if;

  perform public.write_event(
    p_event_id, p_asset.organization_id, 'asset', p_asset.id, 'checked_out',
    public.asset_state(p_asset), public.asset_state(v_row), p_note,
    v_payload || coalesce(p_extra, '{}'::jsonb)
  );
  return v_row;
end;
$$;

create or replace function public.checkout_asset(
  p_asset_id uuid,
  p_event_id uuid,
  p_employee_id uuid,
  p_location_id uuid,
  p_due_on date,
  p_child_events jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.assets%rowtype;
  v_row public.assets%rowtype;
  v_child public.assets%rowtype;
  v_child_event uuid;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_asset.organization_id, 'assets.checkout') then
    raise exception 'You cannot check equipment out.';
  end if;
  if p_employee_id is not null and p_location_id is not null then
    raise exception 'Choose a person or a location, not both.';
  end if;
  if p_employee_id is null and p_location_id is null then
    raise exception 'Choose a person or a location.';
  end if;

  if v_asset.checkout_as_unit then
    for v_child in
      select * from public.assets c where c.parent_asset_id = v_asset.id order by c.name
    loop
      select nullif(value ->> 'event_id', '')::uuid into v_child_event
      from jsonb_array_elements(coalesce(p_child_events, '[]'::jsonb))
      where lower(value ->> 'asset_id') = v_child.id::text;
      if v_child_event is null then
        raise exception 'Missing an event id for %', v_child.name;
      end if;
    end loop;
  end if;

  v_row := public.apply_checkout(v_asset, p_event_id, p_employee_id, p_location_id, p_due_on, null, '{}'::jsonb);

  if v_asset.checkout_as_unit then
    for v_child in
      select * from public.assets c where c.parent_asset_id = v_asset.id order by c.name
    loop
      select nullif(value ->> 'event_id', '')::uuid into v_child_event
      from jsonb_array_elements(coalesce(p_child_events, '[]'::jsonb))
      where lower(value ->> 'asset_id') = v_child.id::text;
      perform public.apply_checkout(
        v_child, v_child_event, p_employee_id, p_location_id, p_due_on, null,
        jsonb_build_object('with_parent', true, 'parent_tag', v_asset.tag_id)
      );
    end loop;
  end if;

  select * into v_row from public.assets where id = p_asset_id;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.checkin_asset(
  p_asset_id uuid,
  p_event_id uuid,
  p_child_events jsonb,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.assets%rowtype;
  v_row public.assets%rowtype;
  v_child public.assets%rowtype;
  v_child_event uuid;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_asset.organization_id, 'assets.checkout') then
    raise exception 'You cannot check equipment in.';
  end if;
  if v_asset.status <> 'checked_out' then
    raise exception 'This item is not checked out.';
  end if;

  if v_asset.checkout_as_unit then
    for v_child in
      select * from public.assets c
      where c.parent_asset_id = v_asset.id
        and c.status = 'checked_out'
        and c.assigned_employee_id is not distinct from v_asset.assigned_employee_id
        and c.due_on is not distinct from v_asset.due_on
    loop
      select nullif(value ->> 'event_id', '')::uuid into v_child_event
      from jsonb_array_elements(coalesce(p_child_events, '[]'::jsonb))
      where lower(value ->> 'asset_id') = v_child.id::text;
      if v_child_event is null then
        raise exception 'Missing an event id for %', v_child.name;
      end if;
    end loop;
  end if;

  update public.assets set
    status = 'available',
    assigned_employee_id = null,
    due_on = null
  where id = p_asset_id
  returning * into v_row;

  perform public.write_event(
    p_event_id, v_asset.organization_id, 'asset', p_asset_id, 'checked_in',
    public.asset_state(v_asset), public.asset_state(v_row), p_note,
    jsonb_strip_nulls(jsonb_build_object(
      'employee_id', v_asset.assigned_employee_id,
      'assignee_name', (select e.name from public.employees e where e.id = v_asset.assigned_employee_id)
    ))
  );

  if v_asset.checkout_as_unit then
    for v_child in
      select * from public.assets c
      where c.parent_asset_id = v_asset.id
        and c.status = 'checked_out'
        and c.assigned_employee_id is not distinct from v_asset.assigned_employee_id
        and c.due_on is not distinct from v_asset.due_on
    loop
      select nullif(value ->> 'event_id', '')::uuid into v_child_event
      from jsonb_array_elements(coalesce(p_child_events, '[]'::jsonb))
      where lower(value ->> 'asset_id') = v_child.id::text;
      update public.assets set
        status = 'available',
        assigned_employee_id = null,
        due_on = null
      where id = v_child.id
      returning * into v_row;
      perform public.write_event(
        v_child_event, v_child.organization_id, 'asset', v_child.id, 'checked_in',
        public.asset_state(v_child), public.asset_state(v_row), null,
        jsonb_strip_nulls(jsonb_build_object(
          'with_parent', true,
          'parent_tag', v_asset.tag_id,
          'employee_id', v_child.assigned_employee_id,
          'assignee_name', (select e.name from public.employees e where e.id = v_child.assigned_employee_id)
        ))
      );
    end loop;
  end if;

  select * into v_row from public.assets where id = p_asset_id;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.move_asset(
  p_asset_id uuid,
  p_event_id uuid,
  p_location_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.assets%rowtype;
  v_row public.assets%rowtype;
  v_name text;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_asset.organization_id, 'assets.move') then
    raise exception 'You cannot move equipment.';
  end if;
  select l.name into v_name
  from public.locations l
  where l.id = p_location_id and l.organization_id = v_asset.organization_id;
  if v_name is null then
    raise exception 'Choose a location.';
  end if;

  update public.assets set location_id = p_location_id where id = p_asset_id
  returning * into v_row;

  perform public.write_event(
    p_event_id, v_asset.organization_id, 'asset', p_asset_id, 'moved',
    public.asset_state(v_asset), public.asset_state(v_row), null,
    jsonb_build_object('location_name', v_name)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_asset_status(
  p_asset_id uuid,
  p_event_id uuid,
  p_status text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.assets%rowtype;
  v_row public.assets%rowtype;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not (
    public.has_org_permission(v_asset.organization_id, 'assets.maintain')
    or public.has_org_permission(v_asset.organization_id, 'assets.write')
  ) then
    raise exception 'You cannot change this status.';
  end if;
  if p_status = 'checked_out' then
    raise exception 'Use check out to issue this item.';
  end if;
  if p_status not in ('available', 'in_repair', 'broken', 'missing', 'retired', 'disposed') then
    raise exception 'That status is not available.';
  end if;

  update public.assets set
    status = p_status,
    assigned_employee_id = case when p_status = 'available' then null else assigned_employee_id end,
    due_on = case when p_status = 'available' then null else due_on end
  where id = p_asset_id
  returning * into v_row;

  perform public.write_event(
    p_event_id, v_asset.organization_id, 'asset', p_asset_id, 'status_changed',
    public.asset_state(v_asset), public.asset_state(v_row), p_note,
    jsonb_build_object('status', p_status)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.attach_file(
  p_id uuid,
  p_event_id uuid,
  p_asset_id uuid,
  p_path text,
  p_file_name text,
  p_content_type text,
  p_byte_size integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.assets%rowtype;
  v_row public.attachments%rowtype;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_asset.organization_id, 'assets.write') then
    raise exception 'You cannot add photos.';
  end if;
  if p_path not like v_asset.organization_id::text || '/' || v_asset.id::text || '/' || p_id::text || '/%' then
    raise exception 'Photo path does not match this item.';
  end if;

  insert into public.attachments (
    id, organization_id, asset_id, kind, storage_path, file_name, content_type, byte_size, created_by
  ) values (
    p_id, v_asset.organization_id, v_asset.id, 'photo', p_path,
    coalesce(nullif(btrim(p_file_name), ''), 'photo'),
    p_content_type, p_byte_size, auth.uid()
  )
  returning * into v_row;

  perform public.write_event(
    p_event_id, v_asset.organization_id, 'asset', v_asset.id, 'photo_added',
    null, null, null, jsonb_build_object('file_name', v_row.file_name, 'attachment_id', v_row.id)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.remove_file(p_attachment_id uuid, p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attachments%rowtype;
begin
  select * into v_row from public.attachments where id = p_attachment_id;
  if not found then
    raise exception 'That photo was not found.';
  end if;
  if not public.has_org_permission(v_row.organization_id, 'assets.write') then
    raise exception 'You cannot remove photos.';
  end if;
  if v_row.asset_id is not null then
    perform public.write_event(
      p_event_id, v_row.organization_id, 'asset', v_row.asset_id, 'photo_removed',
      null, null, null, jsonb_build_object('file_name', v_row.file_name)
    );
  end if;
  delete from public.attachments where id = p_attachment_id;
  return v_row.storage_path;
end;
$$;

create or replace function public.lookup_asset_by_tag(p_tag text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.name), '[]'::jsonb) into v_rows
  from public.assets a
  where lower(a.tag_id) = lower(btrim(coalesce(p_tag, '')))
    and (
      public.has_org_permission(a.organization_id, 'assets.view')
      or public.has_org_permission(a.organization_id, 'assets.scan')
      or (
        public.has_org_permission(a.organization_id, 'assets.view_assigned')
        and a.assigned_employee_id in (
          select e.id from public.employees e
          where e.organization_id = a.organization_id and e.user_id = auth.uid()
        )
      )
    );
  return v_rows;
end;
$$;

create or replace function public.read_asset(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_asset public.assets%rowtype;
  v_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select * into v_asset from public.assets where id = p_id;
  if not found then
    return 'null'::jsonb;
  end if;
  v_allowed :=
    public.has_org_permission(v_asset.organization_id, 'assets.view')
    or public.has_org_permission(v_asset.organization_id, 'assets.scan')
    or (
      public.has_org_permission(v_asset.organization_id, 'assets.view_assigned')
      and v_asset.assigned_employee_id in (
        select e.id from public.employees e
        where e.organization_id = v_asset.organization_id and e.user_id = auth.uid()
      )
    );
  if not v_allowed then
    return 'null'::jsonb;
  end if;
  return to_jsonb(v_asset);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.plan_templates enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.employees enable row level security;
alter table public.locations enable row level security;
alter table public.assets enable row level security;
alter table public.attachments enable row level security;
alter table public.events enable row level security;
alter table public.consumables enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.kiosk_devices enable row level security;
alter table public.approval_policies enable row level security;
alter table public.supply_requests enable row level security;
alter table public.work_requests enable row level security;
alter table public.work_orders enable row level security;
alter table public.maintenance_schedules enable row level security;
alter table public.disposal_records enable row level security;
alter table public.procedures enable row level security;
alter table public.procedure_versions enable row level security;
alter table public.procedure_steps enable row level security;
alter table public.procedure_acknowledgments enable row level security;
alter table public.onboarding_kit_templates enable row level security;
alter table public.onboarding_kit_items enable row level security;
alter table public.offboarding_checklists enable row level security;
alter table public.offboarding_items enable row level security;
alter table public.issue_acknowledgments enable row level security;

drop policy if exists plan_templates_read on public.plan_templates;
create policy plan_templates_read on public.plan_templates
  for select to authenticated using (true);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated using (public.is_org_member(id));

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.has_org_permission(organization_id, 'org.manage'))
  with check (
    public.has_org_permission(organization_id, 'org.manage')
    and exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organization_id = memberships.organization_id
        and r.assignable
        and r.active
    )
  );

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships
  for delete to authenticated using (public.has_org_permission(organization_id, 'org.manage'));

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select to authenticated using (
    public.has_org_permission(organization_id, 'org.manage')
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert to authenticated with check (
    public.has_org_permission(organization_id, 'org.manage')
    and invited_by = auth.uid()
    and accepted_at is null
    and exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organization_id = invites.organization_id
        and r.assignable
        and r.active
    )
  );

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete to authenticated using (public.has_org_permission(organization_id, 'org.manage'));

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert to authenticated with check (
    public.has_org_permission(organization_id, 'people.manage')
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees
  for update to authenticated
  using (public.has_org_permission(organization_id, 'people.manage'))
  with check (
    public.has_org_permission(organization_id, 'people.manage')
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations
  for insert to authenticated with check (public.has_org_permission(organization_id, 'locations.manage'));

drop policy if exists locations_update on public.locations;
create policy locations_update on public.locations
  for update to authenticated
  using (public.has_org_permission(organization_id, 'locations.manage'))
  with check (public.has_org_permission(organization_id, 'locations.manage'));

drop policy if exists locations_delete on public.locations;
create policy locations_delete on public.locations
  for delete to authenticated using (public.has_org_permission(organization_id, 'locations.manage'));

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select to authenticated using (
    public.has_org_permission(organization_id, 'assets.view')
    or (
      public.has_org_permission(organization_id, 'assets.view_assigned')
      and assigned_employee_id in (
        select e.id from public.employees e
        where e.organization_id = assets.organization_id and e.user_id = auth.uid()
      )
    )
  );

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated using (
    public.has_org_permission(organization_id, 'assets.view')
    or public.has_org_permission(organization_id, 'assets.scan')
    or public.has_org_permission(organization_id, 'assets.view_assigned')
  );

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated using (
    public.has_org_permission(organization_id, 'assets.view')
    or public.has_org_permission(organization_id, 'assets.scan')
    or public.has_org_permission(organization_id, 'exports.full')
    or public.has_org_permission(organization_id, 'assets.view_assigned')
  );

-- Later tables: members can read their own organization. Writes arrive with the feature.
drop policy if exists consumables_select on public.consumables;
create policy consumables_select on public.consumables
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists stock_adjustments_select on public.stock_adjustments;
create policy stock_adjustments_select on public.stock_adjustments
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists kiosk_devices_select on public.kiosk_devices;
create policy kiosk_devices_select on public.kiosk_devices
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists approval_policies_select on public.approval_policies;
create policy approval_policies_select on public.approval_policies
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists supply_requests_select on public.supply_requests;
create policy supply_requests_select on public.supply_requests
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists work_requests_select on public.work_requests;
create policy work_requests_select on public.work_requests
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists work_orders_select on public.work_orders;
create policy work_orders_select on public.work_orders
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists maintenance_schedules_select on public.maintenance_schedules;
create policy maintenance_schedules_select on public.maintenance_schedules
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists disposal_records_select on public.disposal_records;
create policy disposal_records_select on public.disposal_records
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists procedures_select on public.procedures;
create policy procedures_select on public.procedures
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists procedure_versions_select on public.procedure_versions;
create policy procedure_versions_select on public.procedure_versions
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists procedure_steps_select on public.procedure_steps;
create policy procedure_steps_select on public.procedure_steps
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists procedure_acknowledgments_select on public.procedure_acknowledgments;
create policy procedure_acknowledgments_select on public.procedure_acknowledgments
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists onboarding_kit_templates_select on public.onboarding_kit_templates;
create policy onboarding_kit_templates_select on public.onboarding_kit_templates
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists onboarding_kit_items_select on public.onboarding_kit_items;
create policy onboarding_kit_items_select on public.onboarding_kit_items
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists offboarding_checklists_select on public.offboarding_checklists;
create policy offboarding_checklists_select on public.offboarding_checklists
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists offboarding_items_select on public.offboarding_items;
create policy offboarding_items_select on public.offboarding_items
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists issue_acknowledgments_select on public.issue_acknowledgments;
create policy issue_acknowledgments_select on public.issue_acknowledgments
  for select to authenticated using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Grants. Asset writes go through functions so the event log cannot be skipped.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.plan_templates to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant select on public.roles to authenticated;
grant select on public.role_permissions to authenticated;
grant select, update, delete on public.memberships to authenticated;
grant select, insert, delete on public.invites to authenticated;
grant select, insert, update on public.employees to authenticated;
grant select, insert, update, delete on public.locations to authenticated;
grant select on public.assets to authenticated;
grant select on public.attachments to authenticated;
grant select on public.events to authenticated;
grant select on public.consumables to authenticated;
grant select on public.stock_adjustments to authenticated;
grant select on public.kiosk_devices to authenticated;
grant select on public.approval_policies to authenticated;
grant select on public.supply_requests to authenticated;
grant select on public.work_requests to authenticated;
grant select on public.work_orders to authenticated;
grant select on public.maintenance_schedules to authenticated;
grant select on public.disposal_records to authenticated;
grant select on public.procedures to authenticated;
grant select on public.procedure_versions to authenticated;
grant select on public.procedure_steps to authenticated;
grant select on public.procedure_acknowledgments to authenticated;
grant select on public.onboarding_kit_templates to authenticated;
grant select on public.onboarding_kit_items to authenticated;
grant select on public.offboarding_checklists to authenticated;
grant select on public.offboarding_items to authenticated;
grant select on public.issue_acknowledgments to authenticated;

revoke all on function public.seed_role(uuid, text, text, text, boolean, boolean, text[]) from public, anon, authenticated;
revoke all on function public.write_event(uuid, uuid, text, uuid, text, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.allocate_tag(uuid) from public, anon, authenticated;
revoke all on function public.apply_checkout(public.assets, uuid, uuid, uuid, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.asset_state(public.assets) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.reject_mutation() from public, anon, authenticated;
revoke all on function public.keep_an_admin() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.normalize_invite_email() from public, anon, authenticated;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_permission(uuid, text) to authenticated;
grant execute on function public.create_organization(uuid, text, text, boolean) to authenticated;
grant execute on function public.update_organization(uuid, text, text) to authenticated;
grant execute on function public.preview_invite(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.create_asset(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_asset(uuid, uuid, jsonb) to authenticated;
grant execute on function public.delete_asset(uuid, uuid) to authenticated;
grant execute on function public.checkout_asset(uuid, uuid, uuid, uuid, date, jsonb) to authenticated;
grant execute on function public.checkin_asset(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.move_asset(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_asset_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.attach_file(uuid, uuid, uuid, text, text, text, integer) to authenticated;
grant execute on function public.remove_file(uuid, uuid) to authenticated;
grant execute on function public.lookup_asset_by_tag(text) to authenticated;
grant execute on function public.read_asset(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage. Private bucket. The first folder is the organization id.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('asset-files', 'asset-files', false)
on conflict (id) do nothing;

drop policy if exists asset_files_read on storage.objects;
create policy asset_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'asset-files'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists asset_files_insert on storage.objects;
create policy asset_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'asset-files'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_permission(((storage.foldername(name))[1])::uuid, 'assets.write')
  );

drop policy if exists asset_files_delete on storage.objects;
create policy asset_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'asset-files'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_permission(((storage.foldername(name))[1])::uuid, 'assets.write')
  );

-- Milestone 2
-- Milestone 2. Safe to run again on a database that already has the first setup.
-- Adds lookups, archive flags, super-user permission, and field-level history.
-- Does not delete equipment, people, or photos.

alter table public.employees add column if not exists title text;
alter table public.employees add column if not exists archived_at timestamptz;
alter table public.assets add column if not exists archived_at timestamptz;
alter table public.locations add column if not exists archived_at timestamptz;

-- Custom statuses and types replace the original check lists.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'assets'
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) ilike '%status in%'
        or pg_get_constraintdef(con.oid) ilike '%type in%'
      )
  loop
    execute format('alter table public.assets drop constraint %I', r.conname);
  end loop;
end
$$;

create table if not exists public.asset_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  label text not null,
  position integer not null default 0,
  counts_as_available boolean not null default false,
  needs_attention boolean not null default false,
  notify boolean not null default false,
  built_in boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.asset_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  label text not null,
  position integer not null default 0,
  built_in boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type_key text not null,
  key text not null,
  label text not null,
  kind text not null default 'text' check (kind in ('text', 'date')),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, type_key, key)
);

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

comment on table public.notification_recipients is
  'When this list is empty, check-out and status emails go to organization admins.';

create index if not exists events_org_time_idx on public.events (organization_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Seeds and the super-user permission
-- ---------------------------------------------------------------------------

create or replace function public.ensure_org_lookups(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.asset_statuses (organization_id, key, label, position, counts_as_available, needs_attention, notify, built_in)
  select p_org, seed.key, seed.label, seed.position, seed.available, seed.attention, seed.notify, true
  from (
    values
      ('available', 'Available', 10, true, false, false),
      ('checked_out', 'Checked out', 20, false, false, false),
      ('in_repair', 'In repair', 30, false, true, true),
      ('broken', 'Broken', 40, false, true, true),
      ('missing', 'Missing', 50, false, true, true),
      ('retired', 'Retired', 60, false, false, false),
      ('disposed', 'Disposed', 70, false, false, false),
      ('destroyed', 'Destroyed', 80, false, false, false)
  ) as seed(key, label, position, available, attention, notify)
  where not exists (
    select 1 from public.asset_statuses s
    where s.organization_id = p_org and s.key = seed.key
  );

  insert into public.asset_types (organization_id, key, label, position, built_in)
  select p_org, seed.key, seed.label, seed.position, true
  from (
    values
      ('equipment', 'Equipment', 10),
      ('tool', 'Tool', 20),
      ('trailer', 'Trailer', 30),
      ('dosing_gear', 'Dosing gear', 40),
      ('it', 'IT / electronics', 50)
  ) as seed(key, label, position)
  where not exists (
    select 1 from public.asset_types t
    where t.organization_id = p_org and t.key = seed.key
  );

  insert into public.custom_field_definitions (organization_id, type_key, key, label, kind, position)
  select p_org, seed.type_key, seed.key, seed.label, seed.kind, seed.position
  from (
    values
      ('trailer', 'vin', 'VIN', 'text', 10),
      ('trailer', 'plate', 'Plate', 'text', 20),
      ('trailer', 'registration_expiry', 'Registration expiry', 'date', 30),
      ('trailer', 'gvwr', 'GVWR', 'text', 40),
      ('dosing_gear', 'pump_model', 'Pump model', 'text', 10),
      ('dosing_gear', 'chemical', 'Chemical', 'text', 20),
      ('dosing_gear', 'last_calibration', 'Last calibration', 'date', 30),
      ('dosing_gear', 'next_calibration', 'Next calibration', 'date', 40),
      ('it', 'wipe_standard', 'Wipe / sanitization standard', 'text', 10)
  ) as seed(type_key, key, label, kind, position)
  where not exists (
    select 1 from public.custom_field_definitions f
    where f.organization_id = p_org and f.type_key = seed.type_key and f.key = seed.key
  );
end;
$$;

create or replace function public.seed_org_lookups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_org_lookups(new.id);
  return new;
end;
$$;

drop trigger if exists organizations_seed_lookups on public.organizations;
create trigger organizations_seed_lookups
  after insert on public.organizations
  for each row execute function public.seed_org_lookups();

select public.ensure_org_lookups(id) from public.organizations;

insert into public.role_permissions (id, organization_id, role_id, permission)
select gen_random_uuid(), r.organization_id, r.id, 'settings.manage'
from public.roles r
where r.built_in and r.key = 'admin'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission = 'settings.manage'
  );

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.built_in
  and r.key in ('manager', 'editor')
  and rp.permission in ('people.manage', 'locations.manage');

-- ---------------------------------------------------------------------------
-- History: field-level before/after on every edit, with the actor's name.
-- ---------------------------------------------------------------------------

create or replace function public.json_field_changes(p_before jsonb, p_after jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'field', keys.key,
    'before', case when p_before -> keys.key is null or jsonb_typeof(p_before -> keys.key) = 'null' then null else p_before ->> keys.key end,
    'after', case when p_after -> keys.key is null or jsonb_typeof(p_after -> keys.key) = 'null' then null else p_after ->> keys.key end
  ) order by keys.key), '[]'::jsonb)
  from (
    select distinct key
    from (
      select jsonb_object_keys(coalesce(p_before, '{}'::jsonb)) as key
      union
      select jsonb_object_keys(coalesce(p_after, '{}'::jsonb))
    ) listed
  ) keys
  where (p_before -> keys.key) is distinct from (p_after -> keys.key);
$$;

create or replace function public.asset_state(p_asset public.assets)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_state jsonb;
  v_key text;
  v_value text;
begin
  v_state := jsonb_build_object(
    'name', p_asset.name,
    'tag_id', p_asset.tag_id,
    'type', p_asset.type,
    'status', p_asset.status,
    'location_id', p_asset.location_id,
    'assigned_employee_id', p_asset.assigned_employee_id,
    'due_on', p_asset.due_on,
    'group_label', p_asset.group_label,
    'brand', p_asset.brand,
    'model', p_asset.model,
    'serial', p_asset.serial,
    'vendor', p_asset.vendor,
    'purchase_date', p_asset.purchase_date,
    'cost', p_asset.cost,
    'notes', p_asset.notes,
    'parent_asset_id', p_asset.parent_asset_id,
    'checkout_as_unit', p_asset.checkout_as_unit,
    'archived_at', p_asset.archived_at
  );
  for v_key, v_value in
    select * from jsonb_each_text(coalesce(p_asset.custom_fields, '{}'::jsonb))
  loop
    v_state := v_state || jsonb_build_object('custom.' || v_key, v_value);
  end loop;
  return v_state;
end;
$$;

create or replace function public.write_event(
  p_id uuid,
  p_org uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_event_type text,
  p_from jsonb,
  p_to jsonb,
  p_notes text,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_changes jsonb := '[]'::jsonb;
  v_payload jsonb;
begin
  if p_id is null then
    raise exception 'Event id is required';
  end if;
  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(email), ''))
    into v_actor
  from public.profiles
  where id = auth.uid();
  if p_from is not null and p_to is not null then
    v_changes := public.json_field_changes(p_from, p_to);
  end if;
  v_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('changes', v_changes);
  insert into public.events (
    id, organization_id, subject_type, subject_id, event_type,
    actor_user_id, actor_name, from_state, to_state, notes, payload
  ) values (
    p_id, p_org, p_subject_type, p_subject_id, p_event_type,
    auth.uid(), v_actor, p_from, p_to, nullif(btrim(coalesce(p_notes, '')), ''),
    v_payload
  );
end;
$$;

create or replace function public.assert_asset_type(p_org uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.asset_types t
    where t.organization_id = p_org and t.key = p_type and t.archived_at is null
  ) then
    return;
  end if;
  raise exception 'Choose a type.';
end;
$$;

-- Replace the type check inside create/update. Bodies match the first migration apart from that check.
create or replace function public.create_asset(
  p_id uuid,
  p_organization_id uuid,
  p_event_id uuid,
  p_asset jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_type text;
  v_tag text;
  v_location uuid;
  v_parent uuid;
  v_cost numeric;
  v_custom jsonb;
  v_row public.assets%rowtype;
begin
  if not public.has_org_permission(p_organization_id, 'assets.write') then
    raise exception 'You cannot add equipment.';
  end if;
  if p_id is null or p_event_id is null then
    raise exception 'Asset id and event id are required';
  end if;
  v_name := btrim(coalesce(p_asset ->> 'name', ''));
  v_type := btrim(coalesce(p_asset ->> 'type', ''));
  if char_length(v_name) < 1 then
    raise exception 'Name is required.';
  end if;
  perform public.assert_asset_type(p_organization_id, v_type);
  v_tag := btrim(coalesce(p_asset ->> 'tag_id', ''));
  if v_tag = '' then
    v_tag := public.allocate_tag(p_organization_id);
  end if;
  v_location := nullif(p_asset ->> 'location_id', '')::uuid;
  v_parent := nullif(p_asset ->> 'parent_asset_id', '')::uuid;
  if v_location is not null and not exists (
    select 1 from public.locations l
    where l.id = v_location and l.organization_id = p_organization_id and l.archived_at is null
  ) then
    raise exception 'That location is not in this organization.';
  end if;
  if v_parent is not null then
    if v_parent = p_id then
      raise exception 'An item cannot be its own parent.';
    end if;
    if not exists (
      select 1 from public.assets a
      where a.id = v_parent and a.organization_id = p_organization_id
    ) then
      raise exception 'The parent item is not in this organization.';
    end if;
  end if;
  v_custom := coalesce(p_asset -> 'custom_fields', '{}'::jsonb);
  if jsonb_typeof(v_custom) <> 'object' then
    raise exception 'Custom fields must be an object.';
  end if;
  if nullif(p_asset ->> 'cost', '') is null then
    v_cost := null;
  else
    v_cost := (p_asset ->> 'cost')::numeric;
    if v_cost < 0 then
      raise exception 'Cost must be zero or more.';
    end if;
  end if;
  insert into public.assets (
    id, organization_id, name, tag_id, type, status, location_id, group_label,
    brand, model, serial, vendor, purchase_date, cost, notes, parent_asset_id,
    checkout_as_unit, custom_fields, created_by
  ) values (
    p_id, p_organization_id, v_name, v_tag, v_type, 'available', v_location,
    nullif(btrim(coalesce(p_asset ->> 'group_label', '')), ''),
    nullif(btrim(coalesce(p_asset ->> 'brand', '')), ''),
    nullif(btrim(coalesce(p_asset ->> 'model', '')), ''),
    nullif(btrim(coalesce(p_asset ->> 'serial', '')), ''),
    nullif(btrim(coalesce(p_asset ->> 'vendor', '')), ''),
    nullif(p_asset ->> 'purchase_date', '')::date,
    v_cost,
    nullif(btrim(coalesce(p_asset ->> 'notes', '')), ''),
    v_parent,
    coalesce((p_asset ->> 'checkout_as_unit')::boolean, false),
    v_custom,
    auth.uid()
  )
  returning * into v_row;
  perform public.write_event(
    p_event_id, p_organization_id, 'asset', p_id, 'created',
    null, public.asset_state(v_row), null,
    jsonb_build_object('name', v_row.name, 'tag_id', v_row.tag_id)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_asset(
  p_id uuid,
  p_event_id uuid,
  p_asset jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.assets%rowtype;
  v_row public.assets%rowtype;
  v_name text;
  v_type text;
  v_tag text;
  v_location uuid;
  v_parent uuid;
  v_cost numeric;
  v_custom jsonb;
begin
  select * into v_old from public.assets where id = p_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_old.organization_id, 'assets.write') then
    raise exception 'You cannot edit equipment.';
  end if;
  v_name := btrim(coalesce(p_asset ->> 'name', ''));
  v_type := btrim(coalesce(p_asset ->> 'type', ''));
  v_tag := btrim(coalesce(p_asset ->> 'tag_id', ''));
  if char_length(v_name) < 1 then
    raise exception 'Name is required.';
  end if;
  perform public.assert_asset_type(v_old.organization_id, v_type);
  if v_tag = '' then
    v_tag := v_old.tag_id;
  end if;
  v_location := nullif(p_asset ->> 'location_id', '')::uuid;
  v_parent := nullif(p_asset ->> 'parent_asset_id', '')::uuid;
  if v_location is not null and not exists (
    select 1 from public.locations l
    where l.id = v_location and l.organization_id = v_old.organization_id and l.archived_at is null
  ) then
    raise exception 'That location is not in this organization.';
  end if;
  if v_parent is not null then
    if v_parent = p_id then
      raise exception 'An item cannot be its own parent.';
    end if;
    if not exists (
      select 1 from public.assets a
      where a.id = v_parent and a.organization_id = v_old.organization_id
    ) then
      raise exception 'The parent item is not in this organization.';
    end if;
  end if;
  v_custom := coalesce(p_asset -> 'custom_fields', '{}'::jsonb);
  if jsonb_typeof(v_custom) <> 'object' then
    raise exception 'Custom fields must be an object.';
  end if;
  if nullif(p_asset ->> 'cost', '') is null then
    v_cost := null;
  else
    v_cost := (p_asset ->> 'cost')::numeric;
    if v_cost < 0 then
      raise exception 'Cost must be zero or more.';
    end if;
  end if;
  update public.assets set
    name = v_name,
    tag_id = v_tag,
    type = v_type,
    location_id = v_location,
    group_label = nullif(btrim(coalesce(p_asset ->> 'group_label', '')), ''),
    brand = nullif(btrim(coalesce(p_asset ->> 'brand', '')), ''),
    model = nullif(btrim(coalesce(p_asset ->> 'model', '')), ''),
    serial = nullif(btrim(coalesce(p_asset ->> 'serial', '')), ''),
    vendor = nullif(btrim(coalesce(p_asset ->> 'vendor', '')), ''),
    purchase_date = nullif(p_asset ->> 'purchase_date', '')::date,
    cost = v_cost,
    notes = nullif(btrim(coalesce(p_asset ->> 'notes', '')), ''),
    parent_asset_id = v_parent,
    checkout_as_unit = coalesce((p_asset ->> 'checkout_as_unit')::boolean, false),
    custom_fields = v_custom
  where id = p_id
  returning * into v_row;
  perform public.write_event(
    p_event_id, v_row.organization_id, 'asset', p_id, 'updated',
    public.asset_state(v_old), public.asset_state(v_row), null,
    jsonb_build_object('name', v_row.name, 'tag_id', v_row.tag_id)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.delete_asset(p_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.assets%rowtype;
  v_row public.assets%rowtype;
begin
  select * into v_old from public.assets where id = p_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_old.organization_id, 'assets.write') then
    raise exception 'You cannot archive equipment.';
  end if;
  if v_old.archived_at is not null then
    raise exception 'This item is already archived.';
  end if;
  update public.assets set archived_at = now() where id = p_id returning * into v_row;
  perform public.write_event(
    p_event_id, v_old.organization_id, 'asset', p_id, 'archived',
    public.asset_state(v_old), public.asset_state(v_row), null,
    jsonb_build_object('name', v_old.name, 'tag_id', v_old.tag_id)
  );
end;
$$;

create or replace function public.apply_checkout(
  p_asset public.assets,
  p_event_id uuid,
  p_employee_id uuid,
  p_location_id uuid,
  p_due_on date,
  p_note text,
  p_extra jsonb
) returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.assets%rowtype;
  v_name text;
  v_payload jsonb;
  v_available boolean;
begin
  if p_asset.status = 'checked_out' then
    raise exception 'Already checked out.';
  end if;
  select coalesce(bool_or(s.counts_as_available and s.archived_at is null), false)
    into v_available
  from public.asset_statuses s
  where s.organization_id = p_asset.organization_id and s.key = p_asset.status;
  if not v_available and p_asset.status <> 'available' then
    raise exception 'This item is not available to check out.';
  end if;
  if p_employee_id is not null then
    select e.name into v_name
    from public.employees e
    where e.id = p_employee_id
      and e.organization_id = p_asset.organization_id
      and e.active
      and e.archived_at is null;
    if v_name is null then
      raise exception 'Choose an active person.';
    end if;
    update public.assets set
      status = 'checked_out',
      assigned_employee_id = p_employee_id,
      due_on = p_due_on
    where id = p_asset.id
    returning * into v_row;
    v_payload := jsonb_build_object('assignee_name', v_name, 'due_on', p_due_on, 'employee_id', p_employee_id);
  else
    if p_location_id is null or not exists (
      select 1 from public.locations l
      where l.id = p_location_id and l.organization_id = p_asset.organization_id and l.archived_at is null
    ) then
      raise exception 'Choose a location.';
    end if;
    select l.name into v_name from public.locations l where l.id = p_location_id;
    update public.assets set
      status = 'checked_out',
      assigned_employee_id = null,
      location_id = p_location_id,
      due_on = p_due_on
    where id = p_asset.id
    returning * into v_row;
    v_payload := jsonb_build_object('location_name', v_name, 'due_on', p_due_on);
  end if;
  perform public.write_event(
    p_event_id, p_asset.organization_id, 'asset', p_asset.id, 'checked_out',
    public.asset_state(p_asset), public.asset_state(v_row), p_note,
    v_payload || coalesce(p_extra, '{}'::jsonb)
  );
  return v_row;
end;
$$;

create or replace function public.set_asset_status(
  p_asset_id uuid,
  p_event_id uuid,
  p_status text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.assets%rowtype;
  v_row public.assets%rowtype;
  v_available boolean := false;
  v_label text;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not (
    public.has_org_permission(v_asset.organization_id, 'assets.maintain')
    or public.has_org_permission(v_asset.organization_id, 'assets.write')
  ) then
    raise exception 'You cannot change this status.';
  end if;
  if p_status = 'checked_out' then
    raise exception 'Use check out to issue this item.';
  end if;
  select s.label, s.counts_as_available into v_label, v_available
  from public.asset_statuses s
  where s.organization_id = v_asset.organization_id and s.key = p_status and s.archived_at is null;
  if v_label is null then
    raise exception 'That status is not available.';
  end if;
  update public.assets set
    status = p_status,
    assigned_employee_id = case when v_available then null else assigned_employee_id end,
    due_on = case when v_available then null else due_on end
  where id = p_asset_id
  returning * into v_row;
  perform public.write_event(
    p_event_id, v_asset.organization_id, 'asset', p_asset_id, 'status_changed',
    public.asset_state(v_asset), public.asset_state(v_row), p_note,
    jsonb_build_object('status', p_status, 'status_label', v_label)
  );
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- People, places, and lookups. Edits require settings.manage and are logged.
-- ---------------------------------------------------------------------------

create or replace function public.require_settings(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_permission(p_org, 'settings.manage') then
    raise exception 'You need the settings permission to change this.';
  end if;
end;
$$;

create or replace function public.save_employee(
  p_id uuid,
  p_event_id uuid,
  p_organization_id uuid,
  p_employee jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.employees%rowtype;
  v_row public.employees%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_name text;
begin
  perform public.require_settings(p_organization_id);
  if p_id is null or p_event_id is null then
    raise exception 'Person id and event id are required';
  end if;
  v_name := btrim(coalesce(p_employee ->> 'name', ''));
  if char_length(v_name) < 1 then
    raise exception 'Name is required.';
  end if;
  select * into v_old from public.employees where id = p_id;
  if found and v_old.organization_id <> p_organization_id then
    raise exception 'That person is not in this organization.';
  end if;
  if found then
    v_before := jsonb_build_object(
      'name', v_old.name, 'title', v_old.title, 'email', v_old.email, 'phone', v_old.phone,
      'hire_date', v_old.hire_date, 'leaving_date', v_old.termination_date,
      'notes', v_old.notes, 'active', v_old.active, 'archived_at', v_old.archived_at
    );
    update public.employees set
      name = v_name,
      title = nullif(btrim(coalesce(p_employee ->> 'title', '')), ''),
      email = nullif(btrim(coalesce(p_employee ->> 'email', '')), ''),
      phone = nullif(btrim(coalesce(p_employee ->> 'phone', '')), ''),
      hire_date = nullif(p_employee ->> 'hire_date', '')::date,
      termination_date = nullif(p_employee ->> 'termination_date', '')::date,
      notes = nullif(btrim(coalesce(p_employee ->> 'notes', '')), ''),
      active = coalesce((p_employee ->> 'active')::boolean, true),
      archived_at = case when coalesce((p_employee ->> 'archived')::boolean, false) then coalesce(archived_at, now()) else null end
    where id = p_id
    returning * into v_row;
  else
    v_before := null;
    insert into public.employees (
      id, organization_id, name, title, email, phone, hire_date, termination_date, notes, active, user_id
    ) values (
      p_id, p_organization_id, v_name,
      nullif(btrim(coalesce(p_employee ->> 'title', '')), ''),
      nullif(btrim(coalesce(p_employee ->> 'email', '')), ''),
      nullif(btrim(coalesce(p_employee ->> 'phone', '')), ''),
      nullif(p_employee ->> 'hire_date', '')::date,
      nullif(p_employee ->> 'termination_date', '')::date,
      nullif(btrim(coalesce(p_employee ->> 'notes', '')), ''),
      coalesce((p_employee ->> 'active')::boolean, true),
      null
    )
    returning * into v_row;
  end if;
  v_after := jsonb_build_object(
    'name', v_row.name, 'title', v_row.title, 'email', v_row.email, 'phone', v_row.phone,
    'hire_date', v_row.hire_date, 'leaving_date', v_row.termination_date,
    'notes', v_row.notes, 'active', v_row.active, 'archived_at', v_row.archived_at
  );
  perform public.write_event(
    p_event_id, p_organization_id, 'employee', p_id,
    case when v_before is null then 'created' else 'updated' end,
    v_before, v_after, null, jsonb_build_object('name', v_row.name)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.save_location(
  p_id uuid,
  p_event_id uuid,
  p_organization_id uuid,
  p_location jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.locations%rowtype;
  v_row public.locations%rowtype;
  v_before jsonb;
  v_name text;
begin
  perform public.require_settings(p_organization_id);
  v_name := btrim(coalesce(p_location ->> 'name', ''));
  if char_length(v_name) < 1 then
    raise exception 'Name is required.';
  end if;
  select * into v_old from public.locations where id = p_id;
  if found and v_old.organization_id <> p_organization_id then
    raise exception 'That location is not in this organization.';
  end if;
  if found then
    v_before := jsonb_build_object('name', v_old.name, 'notes', v_old.notes, 'archived_at', v_old.archived_at);
    update public.locations set
      name = v_name,
      notes = nullif(btrim(coalesce(p_location ->> 'notes', '')), ''),
      archived_at = case when coalesce((p_location ->> 'archived')::boolean, false) then coalesce(archived_at, now()) else null end
    where id = p_id
    returning * into v_row;
  else
    v_before := null;
    insert into public.locations (id, organization_id, name, notes)
    values (p_id, p_organization_id, v_name, nullif(btrim(coalesce(p_location ->> 'notes', '')), ''))
    returning * into v_row;
  end if;
  perform public.write_event(
    p_event_id, p_organization_id, 'location', p_id,
    case when v_before is null then 'created' else 'updated' end,
    v_before,
    jsonb_build_object('name', v_row.name, 'notes', v_row.notes, 'archived_at', v_row.archived_at),
    null, jsonb_build_object('name', v_row.name)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.save_asset_status(
  p_id uuid,
  p_event_id uuid,
  p_organization_id uuid,
  p_status jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.asset_statuses%rowtype;
  v_row public.asset_statuses%rowtype;
  v_before jsonb;
  v_key text;
  v_label text;
begin
  perform public.require_settings(p_organization_id);
  v_label := btrim(coalesce(p_status ->> 'label', ''));
  v_key := lower(btrim(coalesce(p_status ->> 'key', '')));
  if v_label = '' then
    raise exception 'Name is required.';
  end if;
  select * into v_old from public.asset_statuses where id = p_id;
  if found then
    if v_old.organization_id <> p_organization_id then
      raise exception 'That status is not in this organization.';
    end if;
    v_before := jsonb_build_object(
      'label', v_old.label, 'position', v_old.position,
      'counts_as_available', v_old.counts_as_available,
      'needs_attention', v_old.needs_attention, 'notify', v_old.notify,
      'archived_at', v_old.archived_at
    );
    update public.asset_statuses set
      label = v_label,
      position = coalesce((p_status ->> 'position')::integer, position),
      counts_as_available = coalesce((p_status ->> 'counts_as_available')::boolean, counts_as_available),
      needs_attention = coalesce((p_status ->> 'needs_attention')::boolean, needs_attention),
      notify = coalesce((p_status ->> 'notify')::boolean, notify),
      archived_at = case when coalesce((p_status ->> 'archived')::boolean, false) then coalesce(archived_at, now()) else null end
    where id = p_id
    returning * into v_row;
  else
    if v_key !~ '^[a-z0-9_]+$' then
      raise exception 'Use a short key such as in_repair.';
    end if;
    if v_key = 'checked_out' then
      raise exception 'Checked out is reserved for the check-out action.';
    end if;
    v_before := null;
    insert into public.asset_statuses (
      id, organization_id, key, label, position, counts_as_available, needs_attention, notify, built_in
    ) values (
      p_id, p_organization_id, v_key, v_label,
      coalesce((p_status ->> 'position')::integer, 100),
      coalesce((p_status ->> 'counts_as_available')::boolean, false),
      coalesce((p_status ->> 'needs_attention')::boolean, false),
      coalesce((p_status ->> 'notify')::boolean, false),
      false
    )
    returning * into v_row;
  end if;
  perform public.write_event(
    p_event_id, p_organization_id, 'asset_status', p_id,
    case when v_before is null then 'created' else 'updated' end,
    v_before,
    jsonb_build_object(
      'label', v_row.label, 'position', v_row.position,
      'counts_as_available', v_row.counts_as_available,
      'needs_attention', v_row.needs_attention, 'notify', v_row.notify,
      'archived_at', v_row.archived_at
    ),
    null, jsonb_build_object('name', v_row.label, 'key', v_row.key)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.save_asset_type(
  p_id uuid,
  p_event_id uuid,
  p_organization_id uuid,
  p_type jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.asset_types%rowtype;
  v_row public.asset_types%rowtype;
  v_before jsonb;
  v_key text;
  v_label text;
begin
  perform public.require_settings(p_organization_id);
  v_label := btrim(coalesce(p_type ->> 'label', ''));
  v_key := lower(btrim(coalesce(p_type ->> 'key', '')));
  if v_label = '' then
    raise exception 'Name is required.';
  end if;
  select * into v_old from public.asset_types where id = p_id;
  if found then
    if v_old.organization_id <> p_organization_id then
      raise exception 'That type is not in this organization.';
    end if;
    v_before := jsonb_build_object('label', v_old.label, 'position', v_old.position, 'archived_at', v_old.archived_at);
    update public.asset_types set
      label = v_label,
      position = coalesce((p_type ->> 'position')::integer, position),
      archived_at = case when coalesce((p_type ->> 'archived')::boolean, false) then coalesce(archived_at, now()) else null end
    where id = p_id
    returning * into v_row;
  else
    if v_key !~ '^[a-z0-9_]+$' then
      raise exception 'Use a short key such as trailer.';
    end if;
    insert into public.asset_types (id, organization_id, key, label, position, built_in)
    values (p_id, p_organization_id, v_key, v_label, coalesce((p_type ->> 'position')::integer, 100), false)
    returning * into v_row;
  end if;
  perform public.write_event(
    p_event_id, p_organization_id, 'asset_type', p_id,
    case when v_before is null then 'created' else 'updated' end,
    v_before,
    jsonb_build_object('label', v_row.label, 'position', v_row.position, 'archived_at', v_row.archived_at),
    null, jsonb_build_object('name', v_row.label, 'key', v_row.key)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.save_custom_field(
  p_id uuid,
  p_event_id uuid,
  p_organization_id uuid,
  p_field jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.custom_field_definitions%rowtype;
  v_row public.custom_field_definitions%rowtype;
  v_before jsonb;
  v_key text;
  v_label text;
  v_kind text;
  v_type text;
begin
  perform public.require_settings(p_organization_id);
  v_label := btrim(coalesce(p_field ->> 'label', ''));
  v_key := lower(btrim(coalesce(p_field ->> 'key', '')));
  v_kind := coalesce(nullif(p_field ->> 'kind', ''), 'text');
  v_type := btrim(coalesce(p_field ->> 'type_key', ''));
  if v_label = '' or v_type = '' then
    raise exception 'A label and a type are required.';
  end if;
  if v_kind not in ('text', 'date') then
    raise exception 'Choose text or date.';
  end if;
  select * into v_old from public.custom_field_definitions where id = p_id;
  if found then
    if v_old.organization_id <> p_organization_id then
      raise exception 'That field is not in this organization.';
    end if;
    v_before := jsonb_build_object('label', v_old.label, 'kind', v_old.kind, 'position', v_old.position, 'archived_at', v_old.archived_at);
    update public.custom_field_definitions set
      label = v_label,
      kind = v_kind,
      position = coalesce((p_field ->> 'position')::integer, position),
      archived_at = case when coalesce((p_field ->> 'archived')::boolean, false) then coalesce(archived_at, now()) else null end
    where id = p_id
    returning * into v_row;
  else
    if v_key !~ '^[a-z0-9_]+$' then
      raise exception 'Use a short key such as vin.';
    end if;
    insert into public.custom_field_definitions (id, organization_id, type_key, key, label, kind, position)
    values (
      p_id, p_organization_id, v_type, v_key, v_label, v_kind,
      coalesce((p_field ->> 'position')::integer, 100)
    )
    returning * into v_row;
  end if;
  perform public.write_event(
    p_event_id, p_organization_id, 'custom_field', p_id,
    case when v_before is null then 'created' else 'updated' end,
    v_before,
    jsonb_build_object('label', v_row.label, 'kind', v_row.kind, 'position', v_row.position, 'archived_at', v_row.archived_at),
    null, jsonb_build_object('name', v_row.label, 'key', v_row.key, 'type_key', v_row.type_key)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_notification_recipients(
  p_organization_id uuid,
  p_event_id uuid,
  p_emails text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_email text;
begin
  perform public.require_settings(p_organization_id);
  select coalesce(jsonb_agg(email order by email), '[]'::jsonb)
    into v_before
  from public.notification_recipients
  where organization_id = p_organization_id;
  delete from public.notification_recipients where organization_id = p_organization_id;
  foreach v_email in array coalesce(p_emails, array[]::text[]) loop
    if position('@' in lower(btrim(v_email))) > 1 then
      insert into public.notification_recipients (organization_id, email)
      values (p_organization_id, lower(btrim(v_email)))
      on conflict (organization_id, email) do nothing;
    end if;
  end loop;
  perform public.write_event(
    p_event_id, p_organization_id, 'notification_recipients', p_organization_id, 'updated',
    jsonb_build_object('emails', v_before),
    jsonb_build_object('emails', (
      select coalesce(jsonb_agg(email order by email), '[]'::jsonb)
      from public.notification_recipients where organization_id = p_organization_id
    )),
    null, '{}'::jsonb
  );
end;
$$;

create or replace function public.reference_summary(p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_key text;
  v_events integer := 0;
  v_assets integer := 0;
  v_children integer := 0;
  v_photos integer := 0;
begin
  if p_kind = 'asset' then
    select organization_id into v_org from public.assets where id = p_id;
    select count(*) into v_events from public.events where subject_id = p_id;
    select count(*) into v_children from public.assets where parent_asset_id = p_id;
    select count(*) into v_photos from public.attachments where asset_id = p_id;
  elsif p_kind = 'employee' then
    select organization_id into v_org from public.employees where id = p_id;
    select count(*) into v_events from public.events where subject_id = p_id;
    select count(*) into v_assets from public.assets where assigned_employee_id = p_id;
  elsif p_kind = 'location' then
    select organization_id into v_org from public.locations where id = p_id;
    select count(*) into v_events from public.events where subject_id = p_id;
    select count(*) into v_assets from public.assets where location_id = p_id;
  elsif p_kind = 'asset_status' then
    select organization_id, key into v_org, v_key from public.asset_statuses where id = p_id;
    select count(*) into v_events from public.events where subject_id = p_id;
    select count(*) into v_assets from public.assets where organization_id = v_org and status = v_key;
  elsif p_kind = 'asset_type' then
    select organization_id, key into v_org, v_key from public.asset_types where id = p_id;
    select count(*) into v_events from public.events where subject_id = p_id;
    select count(*) into v_assets from public.assets where organization_id = v_org and type = v_key;
  elsif p_kind = 'custom_field' then
    select organization_id, key into v_org, v_key from public.custom_field_definitions where id = p_id;
    select count(*) into v_events from public.events where subject_id = p_id;
    select count(*) into v_assets from public.assets
    where organization_id = v_org and custom_fields ? v_key;
  end if;
  if v_org is null or not public.is_org_member(v_org) then
    return jsonb_build_object('events', 0, 'assets', 0, 'children', 0, 'photos', 0);
  end if;
  return jsonb_build_object('events', v_events, 'assets', v_assets, 'children', v_children, 'photos', v_photos);
end;
$$;

-- People and locations are changed through the functions above.
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert to authenticated with check (
    public.has_org_permission(organization_id, 'settings.manage')
    or (
      public.has_org_permission(organization_id, 'assets.checkout')
      and user_id = auth.uid()
    )
  );

drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees
  for update to authenticated
  using (public.has_org_permission(organization_id, 'settings.manage'))
  with check (public.has_org_permission(organization_id, 'settings.manage'));

drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations
  for insert to authenticated with check (public.has_org_permission(organization_id, 'settings.manage'));

drop policy if exists locations_update on public.locations;
create policy locations_update on public.locations
  for update to authenticated
  using (public.has_org_permission(organization_id, 'settings.manage'))
  with check (public.has_org_permission(organization_id, 'settings.manage'));

drop policy if exists locations_delete on public.locations;

alter table public.asset_statuses enable row level security;
alter table public.asset_types enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.notification_recipients enable row level security;

drop policy if exists asset_statuses_select on public.asset_statuses;
create policy asset_statuses_select on public.asset_statuses
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists asset_types_select on public.asset_types;
create policy asset_types_select on public.asset_types
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists custom_field_definitions_select on public.custom_field_definitions;
create policy custom_field_definitions_select on public.custom_field_definitions
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists notification_recipients_select on public.notification_recipients;
create policy notification_recipients_select on public.notification_recipients
  for select to authenticated using (public.is_org_member(organization_id));

grant select on public.asset_statuses to authenticated;
grant select on public.asset_types to authenticated;
grant select on public.custom_field_definitions to authenticated;
grant select on public.notification_recipients to authenticated;

revoke all on function public.ensure_org_lookups(uuid) from public, anon, authenticated;
revoke all on function public.seed_org_lookups() from public, anon, authenticated;
revoke all on function public.json_field_changes(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.assert_asset_type(uuid, text) from public, anon, authenticated;
revoke all on function public.require_settings(uuid) from public, anon, authenticated;

grant execute on function public.save_employee(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_location(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_asset_status(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_asset_type(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_custom_field(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.set_notification_recipients(uuid, uuid, text[]) to authenticated;
grant execute on function public.reference_summary(text, uuid) to authenticated;

-- History links
-- Links history rows to the person they are about, and searches that log in the database.
-- Safe to run again. It does not erase equipment, people, or events.
-- The event log stays append-only. The only allowed change is filling related_employee_id while it is still empty.

alter table public.events
  add column if not exists related_employee_id uuid;

comment on column public.events.related_employee_id is
  'Person this event is about: the record itself, the check-out or check-in target, or the assignee. Empty when the event is not about a person.';

create index if not exists events_employee_idx
  on public.events (organization_id, related_employee_id, occurred_at desc);

create or replace function public.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  -- Filling the person link on an existing event is not an edit of what happened.
  if tg_op = 'UPDATE'
    and tg_table_name = 'events'
    and old.related_employee_id is null
    and new.related_employee_id is not null
    and new.id is not distinct from old.id
    and new.organization_id is not distinct from old.organization_id
    and new.subject_type is not distinct from old.subject_type
    and new.subject_id is not distinct from old.subject_id
    and new.event_type is not distinct from old.event_type
    and new.occurred_at is not distinct from old.occurred_at
    and new.actor_user_id is not distinct from old.actor_user_id
    and new.actor_kiosk_id is not distinct from old.actor_kiosk_id
    and new.actor_name is not distinct from old.actor_name
    and new.from_state is not distinct from old.from_state
    and new.to_state is not distinct from old.to_state
    and new.notes is not distinct from old.notes
    and new.payload is not distinct from old.payload
  then
    return new;
  end if;
  if tg_op = 'DELETE' and not exists (
    select 1 from public.organizations o where o.id = old.organization_id
  ) then
    return old;
  end if;
  raise exception 'This record is append-only and cannot be changed.';
end;
$$;

create or replace function public.uuid_or_null(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return btrim(p_value)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

-- One person to store on the row. Check-out uses the new assignee, check-in uses the person who had it.
-- A name is used only when the payload has assignee_name and exactly one person in the organization has that name.
create or replace function public.derive_event_employee(
  p_org uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_event_type text,
  p_from jsonb,
  p_to jsonb,
  p_payload jsonb
) returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_from uuid;
  v_to uuid;
  v_name text;
  v_count integer;
begin
  if p_subject_type = 'employee' then
    return p_subject_id;
  end if;
  v_id := coalesce(
    public.uuid_or_null(p_payload ->> 'employee_id'),
    public.uuid_or_null(p_payload ->> 'assignee_employee_id'),
    public.uuid_or_null(p_payload ->> 'related_employee_id')
  );
  if v_id is not null then
    return v_id;
  end if;
  v_from := public.uuid_or_null(p_from ->> 'assigned_employee_id');
  v_to := public.uuid_or_null(p_to ->> 'assigned_employee_id');
  if p_event_type = 'checked_out' and v_to is not null then
    return v_to;
  end if;
  if p_event_type = 'checked_in' and v_from is not null then
    return v_from;
  end if;
  if p_event_type in ('updated', 'status_changed') and v_from is distinct from v_to then
    return coalesce(v_to, v_from);
  end if;
  v_name := nullif(btrim(coalesce(p_payload ->> 'assignee_name', '')), '');
  if v_name is null then
    return null;
  end if;
  select count(*) into v_count
  from public.employees emp
  where emp.organization_id = p_org
    and lower(emp.name) = lower(v_name);
  if v_count = 1 then
    select emp.id into v_id
    from public.employees emp
    where emp.organization_id = p_org
      and lower(emp.name) = lower(v_name)
    limit 1;
    return v_id;
  end if;
  return null;
end;
$$;

create or replace function public.event_mentions_employee(p_event public.events, p_employee uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_from uuid;
  v_to uuid;
  v_name text;
  v_count integer;
  v_derived uuid;
begin
  if p_employee is null then
    return false;
  end if;
  if p_event.related_employee_id = p_employee then
    return true;
  end if;
  if p_event.subject_type = 'employee' and p_event.subject_id = p_employee then
    return true;
  end if;
  if coalesce(
    public.uuid_or_null(p_event.payload ->> 'employee_id'),
    public.uuid_or_null(p_event.payload ->> 'assignee_employee_id'),
    public.uuid_or_null(p_event.payload ->> 'related_employee_id')
  ) = p_employee then
    return true;
  end if;
  v_from := public.uuid_or_null(p_event.from_state ->> 'assigned_employee_id');
  v_to := public.uuid_or_null(p_event.to_state ->> 'assigned_employee_id');
  if p_event.event_type = 'checked_out' and v_to = p_employee then
    return true;
  end if;
  if p_event.event_type = 'checked_in' and v_from = p_employee then
    return true;
  end if;
  if p_event.event_type in ('updated', 'status_changed')
    and v_from is distinct from v_to
    and (v_from = p_employee or v_to = p_employee)
  then
    return true;
  end if;
  v_derived := public.derive_event_employee(
    p_event.organization_id, p_event.subject_type, p_event.subject_id, p_event.event_type,
    p_event.from_state, p_event.to_state, p_event.payload
  );
  if v_derived = p_employee then
    return true;
  end if;
  v_name := nullif(btrim(coalesce(p_event.payload ->> 'assignee_name', '')), '');
  if v_name is null then
    return false;
  end if;
  if v_from is not null or v_to is not null or p_event.subject_type = 'employee' then
    return false;
  end if;
  select count(*) into v_count
  from public.employees emp
  where emp.organization_id = p_event.organization_id
    and lower(emp.name) = lower(v_name);
  if v_count <> 1 then
    return false;
  end if;
  return exists (
    select 1 from public.employees emp
    where emp.id = p_employee
      and emp.organization_id = p_event.organization_id
      and lower(emp.name) = lower(v_name)
  );
end;
$$;

create or replace function public.event_search_text(p_event public.events)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select concat_ws(' ',
    p_event.notes,
    p_event.actor_name,
    (select a.name from public.assets a where p_event.subject_type = 'asset' and a.id = p_event.subject_id),
    (select a.tag_id from public.assets a where p_event.subject_type = 'asset' and a.id = p_event.subject_id),
    (
      select emp.name from public.employees emp
      where emp.id = coalesce(
        p_event.related_employee_id,
        case when p_event.subject_type = 'employee' then p_event.subject_id else null end,
        public.uuid_or_null(p_event.payload ->> 'employee_id'),
        public.uuid_or_null(p_event.payload ->> 'assignee_employee_id'),
        public.uuid_or_null(p_event.to_state ->> 'assigned_employee_id'),
        public.uuid_or_null(p_event.from_state ->> 'assigned_employee_id')
      )
    ),
    p_event.payload ->> 'assignee_name',
    p_event.payload ->> 'name',
    p_event.payload ->> 'tag_id',
    p_event.payload ->> 'location_name',
    (
      select string_agg(concat_ws(' ', c ->> 'field', c ->> 'before', c ->> 'after'), ' ')
      from jsonb_array_elements(case when jsonb_typeof(p_event.payload -> 'changes') = 'array' then p_event.payload -> 'changes' else '[]'::jsonb end) c
    )
  );
$$;

create or replace function public.search_events(
  p_organization_id uuid,
  p_query text,
  p_subject_type text,
  p_subject_id uuid,
  p_event_type text,
  p_from timestamptz,
  p_to timestamptz
) returns setof public.events
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_raw text := btrim(coalesce(p_query, ''));
  v_needle text;
begin
  if not (
    public.has_org_permission(p_organization_id, 'assets.view')
    or public.has_org_permission(p_organization_id, 'assets.scan')
  ) then
    raise exception 'You cannot view history.';
  end if;
  if v_raw <> '' then
    v_needle := replace(replace(replace(v_raw, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  end if;
  return query
  select e.*
  from public.events e
  where e.organization_id = p_organization_id
    and (
      p_subject_type is null or btrim(p_subject_type) = ''
      or (
        p_subject_type = 'employee' and p_subject_id is not null
        and public.event_mentions_employee(e, p_subject_id)
      )
      or (
        (p_subject_type is distinct from 'employee' or p_subject_id is null)
        and e.subject_type = p_subject_type
        and (p_subject_id is null or e.subject_id = p_subject_id)
      )
    )
    and (p_event_type is null or btrim(p_event_type) = '' or e.event_type = p_event_type)
    and (p_from is null or e.occurred_at >= p_from)
    and (p_to is null or e.occurred_at < p_to)
    and (
      v_needle is null
      or public.event_search_text(e) ilike '%' || v_needle || '%' escape '\'
    )
  order by e.occurred_at desc
  limit 400;
end;
$$;

create or replace function public.write_event(
  p_id uuid,
  p_org uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_event_type text,
  p_from jsonb,
  p_to jsonb,
  p_notes text,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_changes jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_employee uuid;
begin
  if p_id is null then
    raise exception 'Event id is required';
  end if;
  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(email), ''))
    into v_actor
  from public.profiles
  where id = auth.uid();
  if p_from is not null and p_to is not null then
    v_changes := public.json_field_changes(p_from, p_to);
  end if;
  v_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('changes', v_changes);
  v_employee := public.derive_event_employee(p_org, p_subject_type, p_subject_id, p_event_type, p_from, p_to, v_payload);
  insert into public.events (
    id, organization_id, subject_type, subject_id, event_type,
    actor_user_id, actor_name, from_state, to_state, notes, payload, related_employee_id
  ) values (
    p_id, p_org, p_subject_type, p_subject_id, p_event_type,
    auth.uid(), v_actor, p_from, p_to, nullif(btrim(coalesce(p_notes, '')), ''),
    v_payload, v_employee
  );
end;
$$;

update public.events e
set related_employee_id = public.derive_event_employee(
  e.organization_id, e.subject_type, e.subject_id, e.event_type, e.from_state, e.to_state, e.payload
)
where e.related_employee_id is null
  and public.derive_event_employee(
    e.organization_id, e.subject_type, e.subject_id, e.event_type, e.from_state, e.to_state, e.payload
  ) is not null;

revoke all on function public.uuid_or_null(text) from public, anon, authenticated;
revoke all on function public.derive_event_employee(uuid, text, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.event_mentions_employee(public.events, uuid) from public, anon, authenticated;
revoke all on function public.event_search_text(public.events) from public, anon, authenticated;
revoke all on function public.reject_mutation() from public, anon, authenticated;

-- search_events runs as the signed-in user, so that user must be allowed to call the helpers.
grant execute on function public.uuid_or_null(text) to authenticated;
grant execute on function public.derive_event_employee(uuid, text, uuid, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.event_mentions_employee(public.events, uuid) to authenticated;
grant execute on function public.event_search_text(public.events) to authenticated;
grant execute on function public.search_events(uuid, text, text, uuid, text, timestamptz, timestamptz) to authenticated;

-- Invite email
-- Records an emailed invite in the history log.
-- Safe to run again. It does not erase equipment, people, or invites.

create or replace function public.log_invite_sent(
  p_invite_id uuid,
  p_event_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_role text;
  v_org text;
begin
  if p_invite_id is null or p_event_id is null then
    raise exception 'Invite id and event id are required';
  end if;
  select * into v_invite from public.invites where id = p_invite_id;
  if not found then
    raise exception 'That invite was not found.';
  end if;
  if not public.has_org_permission(v_invite.organization_id, 'org.manage') then
    raise exception 'You cannot invite people.';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite was already accepted.';
  end if;
  select r.name into v_role from public.roles r where r.id = v_invite.role_id;
  select o.name into v_org from public.organizations o where o.id = v_invite.organization_id;
  perform public.write_event(
    p_event_id,
    v_invite.organization_id,
    'invite',
    v_invite.id,
    'invite_sent',
    null,
    null,
    'Invite emailed to ' || v_invite.email,
    jsonb_build_object(
      'name', v_invite.email,
      'email', v_invite.email,
      'role', coalesce(v_role, ''),
      'organization', coalesce(v_org, ''),
      'expires_at', v_invite.expires_at
    )
  );
end;
$$;

revoke all on function public.log_invite_sent(uuid, uuid) from public, anon;
grant execute on function public.log_invite_sent(uuid, uuid) to authenticated;

-- Status change
-- Stops offering Retired. Existing Retired assets are marked Disposed and that change is written to history.
-- The Retired status row is archived, not deleted, so old history can still name it.
-- Safe to run again. It does not erase equipment or people.

create or replace function public.ensure_org_lookups(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.asset_statuses (organization_id, key, label, position, counts_as_available, needs_attention, notify, built_in)
  select p_org, seed.key, seed.label, seed.position, seed.available, seed.attention, seed.notify, true
  from (
    values
      ('available', 'Available', 10, true, false, false),
      ('checked_out', 'Checked out', 20, false, false, false),
      ('in_repair', 'In repair', 30, false, true, true),
      ('broken', 'Broken', 40, false, true, true),
      ('missing', 'Missing', 50, false, true, true),
      ('disposed', 'Disposed', 70, false, false, false),
      ('destroyed', 'Destroyed', 80, false, false, false)
  ) as seed(key, label, position, available, attention, notify)
  where not exists (
    select 1 from public.asset_statuses s
    where s.organization_id = p_org and s.key = seed.key
  );

  insert into public.asset_types (organization_id, key, label, position, built_in)
  select p_org, seed.key, seed.label, seed.position, true
  from (
    values
      ('equipment', 'Equipment', 10),
      ('tool', 'Tool', 20),
      ('trailer', 'Trailer', 30),
      ('dosing_gear', 'Dosing gear', 40),
      ('it', 'IT / electronics', 50)
  ) as seed(key, label, position)
  where not exists (
    select 1 from public.asset_types t
    where t.organization_id = p_org and t.key = seed.key
  );

  insert into public.custom_field_definitions (organization_id, type_key, key, label, kind, position)
  select p_org, seed.type_key, seed.key, seed.label, seed.kind, seed.position
  from (
    values
      ('trailer', 'vin', 'VIN', 'text', 10),
      ('trailer', 'plate', 'Plate', 'text', 20),
      ('trailer', 'registration_expiry', 'Registration expiry', 'date', 30),
      ('trailer', 'gvwr', 'GVWR', 'text', 40),
      ('dosing_gear', 'pump_model', 'Pump model', 'text', 10),
      ('dosing_gear', 'chemical', 'Chemical', 'text', 20),
      ('dosing_gear', 'last_calibration', 'Last calibration', 'date', 30),
      ('dosing_gear', 'next_calibration', 'Next calibration', 'date', 40),
      ('it', 'wipe_standard', 'Wipe / sanitization standard', 'text', 10)
  ) as seed(type_key, key, label, kind, position)
  where not exists (
    select 1 from public.custom_field_definitions f
    where f.organization_id = p_org and f.type_key = seed.type_key and f.key = seed.key
  );
end;
$$;

select public.ensure_org_lookups(id) from public.organizations;

create or replace function public.set_asset_status(
  p_asset_id uuid,
  p_event_id uuid,
  p_status text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.assets%rowtype;
  v_row public.assets%rowtype;
  v_available boolean := false;
  v_label text;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not (
    public.has_org_permission(v_asset.organization_id, 'assets.maintain')
    or public.has_org_permission(v_asset.organization_id, 'assets.write')
  ) then
    raise exception 'You cannot change this status.';
  end if;
  if p_status = 'checked_out' then
    raise exception 'Use check out to issue this item.';
  end if;
  if p_status = 'retired' then
    raise exception 'Retired is no longer used. Choose disposed or destroyed.';
  end if;
  if p_status in ('disposed', 'destroyed') and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Disposed and destroyed need a note.';
  end if;
  select s.label, s.counts_as_available into v_label, v_available
  from public.asset_statuses s
  where s.organization_id = v_asset.organization_id and s.key = p_status and s.archived_at is null;
  if v_label is null then
    raise exception 'That status is not available.';
  end if;
  if v_asset.status = p_status then
    raise exception 'This item already has that status.';
  end if;
  update public.assets set
    status = p_status,
    assigned_employee_id = case when v_available then null else assigned_employee_id end,
    due_on = case when v_available then null else due_on end
  where id = p_asset_id
  returning * into v_row;
  perform public.write_event(
    p_event_id, v_asset.organization_id, 'asset', p_asset_id, 'status_changed',
    public.asset_state(v_asset), public.asset_state(v_row), p_note,
    jsonb_build_object('status', p_status, 'status_label', v_label, 'name', v_row.name, 'tag_id', v_row.tag_id)
  );
  return to_jsonb(v_row);
end;
$$;

-- Move Retired items to Disposed and keep the before/after in the log.
do $$
declare
  v_asset public.assets%rowtype;
  v_row public.assets%rowtype;
begin
  for v_asset in
    select * from public.assets where status = 'retired'
  loop
    update public.assets
      set status = 'disposed'
    where id = v_asset.id
    returning * into v_row;
    perform public.write_event(
      gen_random_uuid(),
      v_asset.organization_id,
      'asset',
      v_asset.id,
      'status_changed',
      public.asset_state(v_asset),
      public.asset_state(v_row),
      'Retired is no longer used. This item was marked disposed.',
      jsonb_build_object(
        'status', 'disposed',
        'status_label', 'Disposed',
        'migrated_from', 'retired',
        'name', v_row.name,
        'tag_id', v_row.tag_id
      )
    );
  end loop;
end $$;

update public.asset_statuses
set archived_at = coalesce(archived_at, now())
where key = 'retired'
  and archived_at is null;

-- History labels
-- History search also matches the names and labels people see, not only raw ids and slugs.
-- Safe to run again. It does not erase equipment, people, or events.

create or replace function public.resolve_history_value(
  p_org uuid,
  p_field text,
  p_value text
) returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_name text;
  v_field text := regexp_replace(coalesce(p_field, ''), '^custom\.', '');
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  if p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select e.name into v_name from public.employees e where e.id = p_value::uuid and e.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select l.name into v_name from public.locations l where l.id = p_value::uuid and l.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select a.name into v_name from public.assets a where a.id = p_value::uuid and a.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select s.label into v_name from public.asset_statuses s where s.id = p_value::uuid and s.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select t.label into v_name from public.asset_types t where t.id = p_value::uuid and t.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select r.name into v_name from public.roles r where r.id = p_value::uuid and r.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    return 'Unknown (deleted)';
  end if;
  if v_field in ('status', 'status_id') then
    select s.label into v_name from public.asset_statuses s
    where s.organization_id = p_org and s.key = p_value
    order by s.archived_at nulls first
    limit 1;
    if v_name is not null then return v_name; end if;
  end if;
  if v_field in ('type', 'type_id') then
    select t.label into v_name from public.asset_types t
    where t.organization_id = p_org and t.key = p_value
    order by t.archived_at nulls first
    limit 1;
    if v_name is not null then return v_name; end if;
  end if;
  return replace(p_value, '_', ' ');
end;
$$;

create or replace function public.event_search_text(p_event public.events)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select concat_ws(' ',
    p_event.notes,
    p_event.actor_name,
    (select a.name from public.assets a where p_event.subject_type = 'asset' and a.id = p_event.subject_id),
    (select a.tag_id from public.assets a where p_event.subject_type = 'asset' and a.id = p_event.subject_id),
    (
      select emp.name from public.employees emp
      where emp.id = coalesce(
        p_event.related_employee_id,
        case when p_event.subject_type = 'employee' then p_event.subject_id else null end,
        public.uuid_or_null(p_event.payload ->> 'employee_id'),
        public.uuid_or_null(p_event.payload ->> 'assignee_employee_id'),
        public.uuid_or_null(p_event.to_state ->> 'assigned_employee_id'),
        public.uuid_or_null(p_event.from_state ->> 'assigned_employee_id')
      )
    ),
    p_event.payload ->> 'assignee_name',
    p_event.payload ->> 'name',
    p_event.payload ->> 'tag_id',
    p_event.payload ->> 'location_name',
    p_event.payload ->> 'status_label',
    (
      select string_agg(
        concat_ws(
          ' ',
          replace(c ->> 'field', '_', ' '),
          c ->> 'before',
          c ->> 'after',
          public.resolve_history_value(p_event.organization_id, c ->> 'field', c ->> 'before'),
          public.resolve_history_value(p_event.organization_id, c ->> 'field', c ->> 'after')
        ),
        ' '
      )
      from jsonb_array_elements(
        case when jsonb_typeof(p_event.payload -> 'changes') = 'array' then p_event.payload -> 'changes' else '[]'::jsonb end
      ) c
    )
  );
$$;

revoke all on function public.resolve_history_value(uuid, text, text) from public, anon;
grant execute on function public.resolve_history_value(uuid, text, text) to authenticated;
grant execute on function public.event_search_text(public.events) to authenticated;

-- Subscriptions
-- Subscriptions and software licenses. Archive instead of delete. Changes are written to history.
-- Safe to run again. It does not erase equipment, people, or subscriptions.

create table if not exists public.subscription_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position integer not null default 100,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.subscriptions (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  vendor text,
  category_id uuid references public.subscription_categories (id) on delete set null,
  plan_name text,
  seats numeric check (seats is null or seats >= 0),
  cost numeric(12, 2) check (cost is null or cost >= 0),
  currency text not null default 'USD',
  billing_cycle text not null default 'yearly' check (billing_cycle in ('monthly', 'quarterly', 'yearly', 'multi_year', 'one_time')),
  started_on date,
  renews_on date,
  auto_renew boolean not null default true,
  notice_days integer check (notice_days is null or notice_days >= 0),
  payment_note text,
  owner_employee_id uuid references public.employees (id) on delete set null,
  vendor_url text,
  notes text,
  status text not null default 'active' check (status in ('active', 'pending_renewal', 'cancelled', 'expired')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_secrets (
  subscription_id uuid primary key references public.subscriptions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  license_key text,
  updated_at timestamptz not null default now()
);

comment on table public.subscription_secrets is
  'License key or account id. Only people with subscriptions.manage can read this table.';

create table if not exists public.subscription_people (
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (subscription_id, employee_id)
);

create table if not exists public.subscription_assets (
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (subscription_id, asset_id)
);

create table if not exists public.subscription_files (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text,
  byte_size integer check (byte_size is null or byte_size >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_reminder_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  days integer[] not null default '{30,7}'
);

create table if not exists public.subscription_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  renews_on date not null,
  days_before integer not null,
  sent_at timestamptz not null default now(),
  unique (subscription_id, renews_on, days_before)
);

create index if not exists subscriptions_org_idx on public.subscriptions (organization_id, renews_on);

alter table public.subscription_categories enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_secrets enable row level security;
alter table public.subscription_people enable row level security;
alter table public.subscription_assets enable row level security;
alter table public.subscription_files enable row level security;
alter table public.subscription_reminder_settings enable row level security;
alter table public.subscription_reminder_sends enable row level security;

drop policy if exists subscription_categories_select on public.subscription_categories;
create policy subscription_categories_select on public.subscription_categories
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (
    public.has_org_permission(organization_id, 'subscriptions.view')
    or public.has_org_permission(organization_id, 'subscriptions.manage')
  );

drop policy if exists subscription_secrets_select on public.subscription_secrets;
create policy subscription_secrets_select on public.subscription_secrets
  for select to authenticated using (public.has_org_permission(organization_id, 'subscriptions.manage'));

drop policy if exists subscription_people_select on public.subscription_people;
create policy subscription_people_select on public.subscription_people
  for select to authenticated using (
    public.has_org_permission(organization_id, 'subscriptions.view')
    or public.has_org_permission(organization_id, 'subscriptions.manage')
  );

drop policy if exists subscription_assets_select on public.subscription_assets;
create policy subscription_assets_select on public.subscription_assets
  for select to authenticated using (
    public.has_org_permission(organization_id, 'subscriptions.view')
    or public.has_org_permission(organization_id, 'subscriptions.manage')
  );

drop policy if exists subscription_files_select on public.subscription_files;
create policy subscription_files_select on public.subscription_files
  for select to authenticated using (
    public.has_org_permission(organization_id, 'subscriptions.view')
    or public.has_org_permission(organization_id, 'subscriptions.manage')
  );

drop policy if exists subscription_files_insert on public.subscription_files;
create policy subscription_files_insert on public.subscription_files
  for insert to authenticated with check (public.has_org_permission(organization_id, 'subscriptions.manage'));

drop policy if exists subscription_files_delete on public.subscription_files;
create policy subscription_files_delete on public.subscription_files
  for delete to authenticated using (public.has_org_permission(organization_id, 'subscriptions.manage'));

drop policy if exists subscription_reminder_settings_select on public.subscription_reminder_settings;
create policy subscription_reminder_settings_select on public.subscription_reminder_settings
  for select to authenticated using (
    public.has_org_permission(organization_id, 'subscriptions.view')
    or public.has_org_permission(organization_id, 'subscriptions.manage')
  );

grant select on public.subscription_categories to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.subscription_secrets to authenticated;
grant select on public.subscription_people to authenticated;
grant select on public.subscription_assets to authenticated;
grant select, insert, delete on public.subscription_files to authenticated;
grant select on public.subscription_reminder_settings to authenticated;

drop policy if exists subscription_files_storage_insert on storage.objects;
create policy subscription_files_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'asset-files'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] = 'subscriptions'
    and public.has_org_permission(((storage.foldername(name))[1])::uuid, 'subscriptions.manage')
  );

drop policy if exists subscription_files_storage_delete on storage.objects;
create policy subscription_files_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'asset-files'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] = 'subscriptions'
    and public.has_org_permission(((storage.foldername(name))[1])::uuid, 'subscriptions.manage')
  );

create or replace function public.ensure_subscription_setup(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.role_permissions (id, organization_id, role_id, permission)
  select gen_random_uuid(), r.organization_id, r.id, p.permission
  from public.roles r
  join (
    values
      ('admin', 'subscriptions.view'),
      ('admin', 'subscriptions.manage'),
      ('manager', 'subscriptions.view'),
      ('manager', 'subscriptions.manage'),
      ('viewer', 'subscriptions.view')
  ) as p(role_key, permission) on p.role_key = r.key
  where r.organization_id = p_org
    and not exists (
      select 1 from public.role_permissions rp
      where rp.role_id = r.id and rp.permission = p.permission
    );

  insert into public.subscription_categories (organization_id, name, position)
  select p_org, seed.name, seed.position
  from (values ('Software', 10), ('Domain', 20), ('Service', 30), ('Insurance', 40)) as seed(name, position)
  where not exists (
    select 1 from public.subscription_categories c
    where c.organization_id = p_org and lower(c.name) = lower(seed.name)
  );

  insert into public.subscription_reminder_settings (organization_id)
  values (p_org)
  on conflict (organization_id) do nothing;
end;
$$;

create or replace function public.seed_org_lookups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_org_lookups(new.id);
  perform public.ensure_subscription_setup(new.id);
  return new;
end;
$$;

select public.ensure_subscription_setup(id) from public.organizations;

create or replace function public.subscription_state(p_row public.subscriptions)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'name', p_row.name,
    'vendor', p_row.vendor,
    'category_id', p_row.category_id,
    'plan_name', p_row.plan_name,
    'seats', p_row.seats,
    'cost', p_row.cost,
    'currency', p_row.currency,
    'billing_cycle', p_row.billing_cycle,
    'started_on', p_row.started_on,
    'renews_on', p_row.renews_on,
    'auto_renew', p_row.auto_renew,
    'notice_days', p_row.notice_days,
    'payment_note', p_row.payment_note,
    'owner_employee_id', p_row.owner_employee_id,
    'vendor_url', p_row.vendor_url,
    'notes', p_row.notes,
    'status', p_row.status,
    'archived_at', p_row.archived_at
  );
$$;

create or replace function public.require_subscription_manage(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_permission(p_org, 'subscriptions.manage') then
    raise exception 'You cannot change subscriptions.';
  end if;
end;
$$;

create or replace function public.save_subscription(
  p_id uuid,
  p_event_id uuid,
  p_organization_id uuid,
  p_subscription jsonb,
  p_people uuid[],
  p_assets uuid[],
  p_license_key text,
  p_set_secret boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.subscriptions%rowtype;
  v_row public.subscriptions%rowtype;
  v_name text;
  v_cycle text;
  v_status text;
  v_person uuid;
  v_asset uuid;
  v_existed boolean := false;
begin
  perform public.require_subscription_manage(p_organization_id);
  if p_id is null or p_event_id is null then
    raise exception 'Subscription id and event id are required';
  end if;
  v_name := btrim(coalesce(p_subscription ->> 'name', ''));
  if char_length(v_name) < 1 then
    raise exception 'Name is required.';
  end if;
  v_cycle := coalesce(nullif(p_subscription ->> 'billing_cycle', ''), 'yearly');
  if v_cycle not in ('monthly', 'quarterly', 'yearly', 'multi_year', 'one_time') then
    raise exception 'Choose a billing cycle.';
  end if;
  v_status := coalesce(nullif(p_subscription ->> 'status', ''), 'active');
  if v_status not in ('active', 'pending_renewal', 'cancelled', 'expired') then
    raise exception 'Choose a status.';
  end if;
  if p_subscription ->> 'payment_note' ~ '[0-9](?:[ -]*[0-9]){12,18}' then
    raise exception 'Don''t store a card number. Use a short label such as Visa ending 4242.';
  end if;
  select * into v_old from public.subscriptions where id = p_id;
  v_existed := found;
  if v_existed and v_old.organization_id <> p_organization_id then
    raise exception 'That subscription is not in this organization.';
  end if;
  if v_existed then
    update public.subscriptions set
      name = v_name,
      vendor = nullif(btrim(coalesce(p_subscription ->> 'vendor', '')), ''),
      category_id = nullif(p_subscription ->> 'category_id', '')::uuid,
      plan_name = nullif(btrim(coalesce(p_subscription ->> 'plan_name', '')), ''),
      seats = nullif(p_subscription ->> 'seats', '')::numeric,
      cost = nullif(p_subscription ->> 'cost', '')::numeric,
      currency = coalesce(nullif(btrim(coalesce(p_subscription ->> 'currency', '')), ''), 'USD'),
      billing_cycle = v_cycle,
      started_on = nullif(p_subscription ->> 'started_on', '')::date,
      renews_on = nullif(p_subscription ->> 'renews_on', '')::date,
      auto_renew = coalesce((p_subscription ->> 'auto_renew')::boolean, true),
      notice_days = nullif(p_subscription ->> 'notice_days', '')::integer,
      payment_note = nullif(btrim(coalesce(p_subscription ->> 'payment_note', '')), ''),
      owner_employee_id = nullif(p_subscription ->> 'owner_employee_id', '')::uuid,
      vendor_url = nullif(btrim(coalesce(p_subscription ->> 'vendor_url', '')), ''),
      notes = nullif(btrim(coalesce(p_subscription ->> 'notes', '')), ''),
      status = v_status,
      archived_at = case when coalesce((p_subscription ->> 'archived')::boolean, false) then coalesce(archived_at, now()) else null end
    where id = p_id
    returning * into v_row;
  else
    insert into public.subscriptions (
      id, organization_id, name, vendor, category_id, plan_name, seats, cost, currency,
      billing_cycle, started_on, renews_on, auto_renew, notice_days, payment_note,
      owner_employee_id, vendor_url, notes, status
    ) values (
      p_id, p_organization_id, v_name,
      nullif(btrim(coalesce(p_subscription ->> 'vendor', '')), ''),
      nullif(p_subscription ->> 'category_id', '')::uuid,
      nullif(btrim(coalesce(p_subscription ->> 'plan_name', '')), ''),
      nullif(p_subscription ->> 'seats', '')::numeric,
      nullif(p_subscription ->> 'cost', '')::numeric,
      coalesce(nullif(btrim(coalesce(p_subscription ->> 'currency', '')), ''), 'USD'),
      v_cycle,
      nullif(p_subscription ->> 'started_on', '')::date,
      nullif(p_subscription ->> 'renews_on', '')::date,
      coalesce((p_subscription ->> 'auto_renew')::boolean, true),
      nullif(p_subscription ->> 'notice_days', '')::integer,
      nullif(btrim(coalesce(p_subscription ->> 'payment_note', '')), ''),
      nullif(p_subscription ->> 'owner_employee_id', '')::uuid,
      nullif(btrim(coalesce(p_subscription ->> 'vendor_url', '')), ''),
      nullif(btrim(coalesce(p_subscription ->> 'notes', '')), ''),
      v_status
    )
    returning * into v_row;
  end if;

  delete from public.subscription_people where subscription_id = v_row.id;
  if p_people is not null then
    foreach v_person in array p_people loop
      insert into public.subscription_people (subscription_id, employee_id, organization_id)
      select v_row.id, e.id, v_row.organization_id
      from public.employees e
      where e.id = v_person and e.organization_id = v_row.organization_id;
    end loop;
  end if;
  delete from public.subscription_assets where subscription_id = v_row.id;
  if p_assets is not null then
    foreach v_asset in array p_assets loop
      insert into public.subscription_assets (subscription_id, asset_id, organization_id)
      select v_row.id, a.id, v_row.organization_id
      from public.assets a
      where a.id = v_asset and a.organization_id = v_row.organization_id;
    end loop;
  end if;

  if p_set_secret then
    if nullif(btrim(coalesce(p_license_key, '')), '') is null then
      delete from public.subscription_secrets where subscription_id = v_row.id;
    else
      insert into public.subscription_secrets (subscription_id, organization_id, license_key)
      values (v_row.id, v_row.organization_id, btrim(p_license_key))
      on conflict (subscription_id) do update set license_key = excluded.license_key, updated_at = now();
    end if;
  end if;

  perform public.write_event(
    p_event_id, v_row.organization_id, 'subscription', v_row.id,
    case
      when not v_existed then 'created'
      when v_old.archived_at is null and v_row.archived_at is not null then 'archived'
      else 'updated'
    end,
    case when v_existed then public.subscription_state(v_old) else null end,
    public.subscription_state(v_row),
    null,
    jsonb_build_object('name', v_row.name)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.renew_subscription(
  p_id uuid,
  p_event_id uuid,
  p_paid numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.subscriptions%rowtype;
  v_row public.subscriptions%rowtype;
  v_next date;
begin
  select * into v_old from public.subscriptions where id = p_id;
  if not found then
    raise exception 'That subscription was not found.';
  end if;
  perform public.require_subscription_manage(v_old.organization_id);
  if v_old.renews_on is null then
    raise exception 'Set a renewal date first.';
  end if;
  v_next := case v_old.billing_cycle
    when 'monthly' then (v_old.renews_on + interval '1 month')::date
    when 'quarterly' then (v_old.renews_on + interval '3 months')::date
    when 'yearly' then (v_old.renews_on + interval '1 year')::date
    when 'multi_year' then (v_old.renews_on + interval '2 years')::date
    else null
  end;
  if v_next is null then
    raise exception 'One-time items are not renewed.';
  end if;
  update public.subscriptions
  set renews_on = v_next, status = 'active'
  where id = p_id
  returning * into v_row;
  perform public.write_event(
    p_event_id, v_row.organization_id, 'subscription', v_row.id, 'renewed',
    public.subscription_state(v_old), public.subscription_state(v_row),
    case when p_paid is null then 'Renewed' else 'Renewed. Paid ' || p_paid::text || ' ' || v_row.currency end,
    jsonb_build_object('name', v_row.name, 'paid', p_paid, 'currency', v_row.currency)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.cancel_subscription(p_id uuid, p_event_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.subscriptions%rowtype;
  v_row public.subscriptions%rowtype;
begin
  select * into v_old from public.subscriptions where id = p_id;
  if not found then
    raise exception 'That subscription was not found.';
  end if;
  perform public.require_subscription_manage(v_old.organization_id);
  update public.subscriptions set status = 'cancelled' where id = p_id returning * into v_row;
  perform public.write_event(
    p_event_id, v_row.organization_id, 'subscription', v_row.id, 'cancelled',
    public.subscription_state(v_old), public.subscription_state(v_row),
    'Cancelled',
    jsonb_build_object('name', v_row.name)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.save_subscription_category(
  p_id uuid,
  p_organization_id uuid,
  p_name text,
  p_archived boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.subscription_categories%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform public.require_subscription_manage(p_organization_id);
  if char_length(v_name) < 1 then
    raise exception 'Name is required.';
  end if;
  if exists (select 1 from public.subscription_categories where id = p_id) then
    update public.subscription_categories set
      name = v_name,
      archived_at = case when p_archived then coalesce(archived_at, now()) else null end
    where id = p_id and organization_id = p_organization_id
    returning * into v_row;
  else
    insert into public.subscription_categories (id, organization_id, name)
    values (coalesce(p_id, gen_random_uuid()), p_organization_id, v_name)
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_subscription_reminder_days(p_organization_id uuid, p_days integer[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day integer;
begin
  perform public.require_subscription_manage(p_organization_id);
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'Choose at least one reminder day.';
  end if;
  foreach v_day in array p_days loop
    if v_day < 0 or v_day > 365 then
      raise exception 'Reminder days must be between 0 and 365.';
    end if;
  end loop;
  insert into public.subscription_reminder_settings (organization_id, days)
  values (p_organization_id, p_days)
  on conflict (organization_id) do update set days = excluded.days;
end;
$$;

create or replace function public.claim_subscription_reminders(p_today date)
returns table (
  organization_id uuid,
  subscription_id uuid,
  name text,
  renews_on date,
  days_before integer,
  owner_email text,
  organization_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_day integer;
begin
  for v_row in
    select s.id, s.organization_id, s.name, s.renews_on, s.owner_employee_id, o.name as organization_name,
      coalesce(r.days, '{30,7}'::integer[]) as days
    from public.subscriptions s
    join public.organizations o on o.id = s.organization_id
    left join public.subscription_reminder_settings r on r.organization_id = s.organization_id
    where s.archived_at is null
      and s.status <> 'cancelled'
      and s.renews_on is not null
  loop
    foreach v_day in array v_row.days loop
      if (v_row.renews_on - p_today) = v_day
        and not exists (
          select 1 from public.subscription_reminder_sends sent
          where sent.subscription_id = v_row.id
            and sent.renews_on = v_row.renews_on
            and sent.days_before = v_day
        )
      then
        insert into public.subscription_reminder_sends (organization_id, subscription_id, renews_on, days_before)
        values (v_row.organization_id, v_row.id, v_row.renews_on, v_day);
        organization_id := v_row.organization_id;
        subscription_id := v_row.id;
        name := v_row.name;
        renews_on := v_row.renews_on;
        days_before := v_day;
        organization_name := v_row.organization_name;
        select e.email into owner_email from public.employees e where e.id = v_row.owner_employee_id;
        return next;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.release_subscription_reminder(
  p_subscription_id uuid,
  p_renews_on date,
  p_days_before integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.subscription_reminder_sends
  where subscription_id = p_subscription_id
    and renews_on = p_renews_on
    and days_before = p_days_before;
end;
$$;

revoke all on function public.ensure_subscription_setup(uuid) from public, anon, authenticated;
revoke all on function public.subscription_state(public.subscriptions) from public, anon, authenticated;
revoke all on function public.require_subscription_manage(uuid) from public, anon, authenticated;
revoke all on function public.claim_subscription_reminders(date) from public, anon, authenticated;
revoke all on function public.release_subscription_reminder(uuid, date, integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_subscription_reminders(date) to service_role;
    grant execute on function public.release_subscription_reminder(uuid, date, integer) to service_role;
  end if;
end $$;

grant execute on function public.save_subscription(uuid, uuid, uuid, jsonb, uuid[], uuid[], text, boolean) to authenticated;
grant execute on function public.renew_subscription(uuid, uuid, numeric) to authenticated;
grant execute on function public.cancel_subscription(uuid, uuid) to authenticated;
grant execute on function public.save_subscription_category(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.set_subscription_reminder_days(uuid, integer[]) to authenticated;

-- History search and the on-screen labels can name a subscription's owner, category, cycle, and status.
-- This replaces the earlier resolver now that subscription categories exist. Safe to run again.
create or replace function public.resolve_history_value(
  p_org uuid,
  p_field text,
  p_value text
) returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_name text;
  v_field text := regexp_replace(coalesce(p_field, ''), '^custom\.', '');
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  if p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select e.name into v_name from public.employees e where e.id = p_value::uuid and e.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select l.name into v_name from public.locations l where l.id = p_value::uuid and l.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select a.name into v_name from public.assets a where a.id = p_value::uuid and a.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select s.label into v_name from public.asset_statuses s where s.id = p_value::uuid and s.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select t.label into v_name from public.asset_types t where t.id = p_value::uuid and t.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select r.name into v_name from public.roles r where r.id = p_value::uuid and r.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    select c.name into v_name from public.subscription_categories c where c.id = p_value::uuid and c.organization_id = p_org;
    if v_name is not null then return v_name; end if;
    return 'Unknown (deleted)';
  end if;
  if v_field in ('status', 'status_id') then
    select s.label into v_name from public.asset_statuses s
    where s.organization_id = p_org and s.key = p_value
    order by s.archived_at nulls first
    limit 1;
    if v_name is not null then return v_name; end if;
    if p_value = 'pending_renewal' then return 'Pending renewal'; end if;
    if p_value = 'cancelled' then return 'Cancelled'; end if;
    if p_value = 'expired' then return 'Expired'; end if;
    if p_value = 'active' then return 'Active'; end if;
  end if;
  if v_field in ('type', 'type_id') then
    select t.label into v_name from public.asset_types t
    where t.organization_id = p_org and t.key = p_value
    order by t.archived_at nulls first
    limit 1;
    if v_name is not null then return v_name; end if;
  end if;
  if v_field = 'billing_cycle' then
    return case p_value
      when 'monthly' then 'Monthly'
      when 'quarterly' then 'Quarterly'
      when 'yearly' then 'Yearly'
      when 'multi_year' then 'Multi-year'
      when 'one_time' then 'One-time'
      else replace(p_value, '_', ' ')
    end;
  end if;
  return replace(p_value, '_', ' ');
end;
$$;

create or replace function public.event_search_text(p_event public.events)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select concat_ws(' ',
    p_event.notes,
    p_event.actor_name,
    (select a.name from public.assets a where p_event.subject_type = 'asset' and a.id = p_event.subject_id),
    (select a.tag_id from public.assets a where p_event.subject_type = 'asset' and a.id = p_event.subject_id),
    (select s.name from public.subscriptions s where p_event.subject_type = 'subscription' and s.id = p_event.subject_id),
    (
      select emp.name from public.employees emp
      where emp.id = coalesce(
        p_event.related_employee_id,
        case when p_event.subject_type = 'employee' then p_event.subject_id else null end,
        public.uuid_or_null(p_event.payload ->> 'employee_id'),
        public.uuid_or_null(p_event.payload ->> 'assignee_employee_id'),
        public.uuid_or_null(p_event.to_state ->> 'assigned_employee_id'),
        public.uuid_or_null(p_event.from_state ->> 'assigned_employee_id')
      )
    ),
    p_event.payload ->> 'assignee_name',
    p_event.payload ->> 'name',
    p_event.payload ->> 'tag_id',
    p_event.payload ->> 'location_name',
    p_event.payload ->> 'status_label',
    (
      select string_agg(
        concat_ws(
          ' ',
          replace(c ->> 'field', '_', ' '),
          case c ->> 'field'
            when 'owner_employee_id' then 'Account owner'
            when 'category_id' then 'Category'
            when 'billing_cycle' then 'Billing cycle'
            when 'renews_on' then 'Renewal'
            when 'started_on' then 'Start date'
            when 'plan_name' then 'Plan'
            when 'auto_renew' then 'Auto-renew'
            when 'notice_days' then 'Cancellation notice'
            when 'payment_note' then 'Payment method'
            when 'vendor_url' then 'Vendor URL'
            else null
          end,
          c ->> 'before',
          c ->> 'after',
          public.resolve_history_value(p_event.organization_id, c ->> 'field', c ->> 'before'),
          public.resolve_history_value(p_event.organization_id, c ->> 'field', c ->> 'after')
        ),
        ' '
      )
      from jsonb_array_elements(
        case when jsonb_typeof(p_event.payload -> 'changes') = 'array' then p_event.payload -> 'changes' else '[]'::jsonb end
      ) c
    )
  );
$$;

revoke all on function public.resolve_history_value(uuid, text, text) from public, anon;
grant execute on function public.resolve_history_value(uuid, text, text) to authenticated;
grant execute on function public.event_search_text(public.events) to authenticated;
