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
