-- Consumables, storeroom kiosk, and asset warranty reminders.
-- Safe to run again. It does not erase equipment, people, or subscriptions.

create extension if not exists pgcrypto;

alter table public.consumables add column if not exists category text;
alter table public.consumables add column if not exists unit_cost numeric(12, 2);
alter table public.consumables add column if not exists active boolean not null default true;
alter table public.consumables add column if not exists archived_at timestamptz;
alter table public.consumables add column if not exists photo_path text;
alter table public.consumables add column if not exists bin_code text;

alter table public.assets add column if not exists warranty_start date;
alter table public.assets add column if not exists warranty_end date;
alter table public.assets add column if not exists warranty_provider text;
alter table public.assets add column if not exists warranty_notes text;

alter table public.employees add column if not exists kiosk_pin_hash text;
alter table public.employees add column if not exists kiosk_pin_failures integer not null default 0;
alter table public.employees add column if not exists kiosk_pin_locked_until timestamptz;

alter table public.organization_settings add column if not exists notify_low_stock boolean not null default true;
alter table public.organization_settings add column if not exists warranty_reminder_days integer[] not null default '{30,7}';

create table if not exists public.kiosk_sessions (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.warranty_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  warranty_end date not null,
  days_before integer not null,
  sent_at timestamptz not null default now(),
  unique (asset_id, warranty_end, days_before)
);

create unique index if not exists consumables_org_bin_idx
  on public.consumables (organization_id, lower(bin_code))
  where bin_code is not null;
create index if not exists consumables_org_idx on public.consumables (organization_id);
create index if not exists stock_adjustments_item_idx on public.stock_adjustments (consumable_id, created_at desc);
create index if not exists assets_warranty_end_idx on public.assets (organization_id, warranty_end);
create index if not exists kiosk_sessions_employee_idx on public.kiosk_sessions (employee_id);

alter table public.kiosk_sessions enable row level security;
alter table public.warranty_reminder_sends enable row level security;

update public.roles set assignable = true, description = 'Storeroom tablet. Pick a person, enter their PIN, and record what they take.'
where key = 'kiosk';

insert into public.role_permissions (id, organization_id, role_id, permission)
select gen_random_uuid(), r.organization_id, r.id, needed.permission
from public.roles r
cross join (
  values
    ('inventory.view'), ('inventory.edit'), ('inventory.manage'), ('kiosk.use'), ('assets.checkout')
) as needed(permission)
where (
  (r.key = 'admin' and needed.permission in ('inventory.view', 'inventory.edit', 'inventory.manage', 'kiosk.use'))
  or (r.key = 'manager' and needed.permission in ('inventory.view', 'inventory.edit', 'inventory.manage'))
  or (r.key = 'editor' and needed.permission in ('inventory.view', 'inventory.edit'))
  or (r.key in ('viewer', 'auditor') and needed.permission = 'inventory.view')
  or (r.key = 'kiosk' and needed.permission in ('inventory.view', 'kiosk.use', 'assets.checkout'))
)
and not exists (
  select 1 from public.role_permissions existing
  where existing.role_id = r.id and existing.permission = needed.permission
);

create or replace function public.module_universe(p_module text)
returns text[]
language sql
immutable
as $$
  select case p_module
    when 'assets' then array['assets.view', 'assets.view_assigned', 'assets.scan', 'assets.write', 'assets.checkout', 'assets.move']
    when 'kits' then array['kits.view', 'kits.write']
    when 'people' then array['people.view', 'people.manage']
    when 'locations' then array['locations.view', 'locations.manage']
    when 'subscriptions' then array['subscriptions.view', 'subscriptions.manage']
    when 'history' then array['history.view']
    when 'reports' then array['reports.run', 'exports.full']
    when 'maintenance' then array['maintenance.view', 'assets.maintain']
    when 'inventory' then array['inventory.view', 'inventory.edit', 'inventory.manage']
    when 'settings' then array['settings.manage']
    when 'users' then array['org.manage']
    when 'kiosk' then array['kiosk.use', 'kiosk.manage']
    when 'work_orders' then array['work_orders.complete', 'work_orders.convert']
    else null
  end;
$$;

create or replace function public.module_grants(p_module text, p_level text)
returns text[]
language sql
immutable
as $$
  select case
    when p_level = 'none' and public.module_universe(p_module) is not null then array[]::text[]
    when p_module = 'assets' and p_level = 'view' then array['assets.view', 'assets.scan']
    when p_module = 'assets' and p_level = 'edit' then array['assets.view', 'assets.scan', 'assets.write', 'assets.checkout', 'assets.move']
    when p_module = 'kits' and p_level = 'view' then array['kits.view']
    when p_module = 'kits' and p_level = 'edit' then array['kits.view', 'kits.write']
    when p_module = 'people' and p_level = 'view' then array['people.view']
    when p_module = 'people' and p_level = 'manage' then array['people.view', 'people.manage']
    when p_module = 'locations' and p_level = 'view' then array['locations.view']
    when p_module = 'locations' and p_level = 'manage' then array['locations.view', 'locations.manage']
    when p_module = 'subscriptions' and p_level = 'view' then array['subscriptions.view']
    when p_module = 'subscriptions' and p_level = 'manage' then array['subscriptions.view', 'subscriptions.manage']
    when p_module = 'history' and p_level = 'view' then array['history.view']
    when p_module = 'reports' and p_level = 'view' then array['reports.run']
    when p_module = 'reports' and p_level = 'manage' then array['reports.run', 'exports.full']
    when p_module = 'maintenance' and p_level = 'view' then array['maintenance.view']
    when p_module = 'maintenance' and p_level = 'edit' then array['maintenance.view', 'assets.maintain']
    when p_module = 'inventory' and p_level = 'view' then array['inventory.view']
    when p_module = 'inventory' and p_level = 'edit' then array['inventory.view', 'inventory.edit']
    when p_module = 'inventory' and p_level = 'manage' then array['inventory.view', 'inventory.edit', 'inventory.manage']
    when p_module = 'settings' and p_level = 'manage' then array['settings.manage']
    when p_module = 'users' and p_level = 'manage' then array['org.manage']
    when p_module = 'kiosk' and p_level = 'use' then array['kiosk.use']
    when p_module = 'kiosk' and p_level = 'manage' then array['kiosk.use', 'kiosk.manage']
    when p_module = 'work_orders' and p_level = 'edit' then array['work_orders.complete', 'work_orders.convert']
    else null
  end;
$$;

create or replace function public.module_level_label(p_module text, p_permissions text[])
returns text
language plpgsql
immutable
as $$
declare
  v_level text;
  v_grant text[];
  v_view text[];
  v_perm text;
begin
  foreach v_level in array array['manage', 'edit', 'use', 'view'] loop
    v_grant := public.module_grants(p_module, v_level);
    if v_grant is not null and cardinality(v_grant) > 0 and v_grant <@ p_permissions then
      return case v_level when 'manage' then 'Manage' when 'edit' then 'Edit' when 'use' then 'Use' else 'View' end;
    end if;
  end loop;
  v_grant := coalesce(public.module_grants(p_module, 'edit'), public.module_grants(p_module, 'manage'), public.module_grants(p_module, 'use'), array[]::text[]);
  v_view := coalesce(public.module_grants(p_module, 'view'), public.module_grants(p_module, 'use'), array[]::text[]);
  foreach v_perm in array v_grant loop
    if not (v_perm = any (v_view)) and v_perm = any (p_permissions) then
      if public.module_grants(p_module, 'manage') is not null then return 'Manage'; end if;
      return 'Edit';
    end if;
  end loop;
  foreach v_perm in array v_view loop
    if v_perm = any (p_permissions) then
      if public.module_grants(p_module, 'use') is not null and public.module_grants(p_module, 'view') is null then return 'Use'; end if;
      return 'View';
    end if;
  end loop;
  return 'None';
end;
$$;

create or replace function public.set_role_module(
  p_organization_id uuid,
  p_role_id uuid,
  p_event_id uuid,
  p_module text,
  p_level text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.roles%rowtype;
  v_before text[];
  v_before_label text;
  v_after_label text;
  v_message text;
  v_assigned boolean;
  v_pending boolean;
begin
  perform public.require_settings(p_organization_id);
  if p_module = 'work_orders' then
    raise exception 'That module is not available yet.';
  end if;
  select * into v_role from public.roles where id = p_role_id and organization_id = p_organization_id;
  if not found then
    raise exception 'That role was not found.';
  end if;
  v_before := public.role_permission_list(p_role_id);
  v_before_label := public.module_level_label(p_module, v_before);
  perform public.replace_role_module(p_role_id, p_organization_id, p_module, p_level);
  select exists (select 1 from public.memberships m where m.role_id = p_role_id) into v_assigned;
  select exists (
    select 1 from public.invites i
    where i.role_id = p_role_id and i.accepted_at is null and i.expires_at > now()
  ) into v_pending;
  v_message := public.company_lockout_message(
    p_organization_id, p_role_id, public.role_permission_list(p_role_id), v_role.active, v_assigned, v_pending
  );
  if v_message is not null then
    perform public.restore_role_permissions(p_organization_id, p_role_id, p_module, v_before);
    raise exception '%', v_message;
  end if;
  v_after_label := public.module_level_label(p_module, public.role_permission_list(p_role_id));
  perform public.write_event(
    p_event_id, p_organization_id, 'role', p_role_id, 'updated',
    jsonb_build_object(p_module, v_before_label),
    jsonb_build_object(p_module, v_after_label),
    null,
    jsonb_build_object('name', v_role.name)
  );
end;
$$;

create or replace function public.set_role_active(
  p_organization_id uuid,
  p_role_id uuid,
  p_event_id uuid,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.roles%rowtype;
  v_message text;
  v_assigned boolean;
  v_pending boolean;
begin
  perform public.require_settings(p_organization_id);
  select * into v_role from public.roles where id = p_role_id and organization_id = p_organization_id;
  if not found then
    raise exception 'That role was not found.';
  end if;
  select exists (select 1 from public.memberships m where m.role_id = p_role_id) into v_assigned;
  select exists (
    select 1 from public.invites i
    where i.role_id = p_role_id and i.accepted_at is null and i.expires_at > now()
  ) into v_pending;
  v_message := public.company_lockout_message(
    p_organization_id, p_role_id, public.role_permission_list(p_role_id), p_active, v_assigned, v_pending
  );
  if v_message is not null then
    raise exception '%', v_message;
  end if;
  update public.roles set active = p_active, assignable = p_active where id = p_role_id;
  perform public.write_event(
    p_event_id, p_organization_id, 'role', p_role_id, 'updated',
    jsonb_build_object('active', v_role.active),
    jsonb_build_object('active', p_active),
    null,
    jsonb_build_object('name', v_role.name)
  );
end;
$$;

create or replace function public.require_inventory_edit(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.has_org_permission(p_org, 'inventory.edit')
    or public.has_org_permission(p_org, 'inventory.manage')
  ) then
    raise exception 'You cannot change inventory.';
  end if;
end;
$$;

create or replace function public.next_bin_code(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 1000;
  candidate text;
begin
  select coalesce(max((regexp_replace(bin_code, '\D', '', 'g'))::integer), 1000)
    into n
  from public.consumables
  where organization_id = p_org and bin_code ~ '^BIN-[0-9]+$';
  loop
    n := n + 1;
    candidate := 'BIN-' || n::text;
    exit when not exists (
      select 1 from public.consumables c
      where c.organization_id = p_org and lower(c.bin_code) = lower(candidate)
    );
  end loop;
  return candidate;
end;
$$;

create or replace function public.save_consumable(
  p_id uuid,
  p_event_id uuid,
  p_organization_id uuid,
  p_item jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.consumables%rowtype;
  v_row public.consumables%rowtype;
  v_name text := btrim(coalesce(p_item ->> 'name', ''));
  v_unit text := lower(btrim(coalesce(p_item ->> 'unit', 'each')));
begin
  if not (
    public.has_org_permission(p_organization_id, 'inventory.edit')
    or public.has_org_permission(p_organization_id, 'inventory.manage')
  ) then
    raise exception 'You cannot change inventory.';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'Enter a name.';
  end if;
  if v_unit not in ('each', 'box', 'case', 'pack') then
    raise exception 'Choose each, box, case, or pack.';
  end if;
  select * into v_old from public.consumables where id = p_id and organization_id = p_organization_id;
  if found then
    update public.consumables set
      name = v_name,
      category = nullif(btrim(coalesce(p_item ->> 'category', '')), ''),
      unit = v_unit,
      sku = nullif(btrim(coalesce(p_item ->> 'sku', '')), ''),
      location_id = nullif(p_item ->> 'location_id', '')::uuid,
      minimum_quantity = greatest(coalesce((p_item ->> 'reorder_point')::numeric, 0), 0),
      reorder_quantity = greatest(coalesce((p_item ->> 'reorder_quantity')::numeric, 0), 0),
      vendor = nullif(btrim(coalesce(p_item ->> 'vendor', '')), ''),
      unit_cost = nullif(p_item ->> 'unit_cost', '')::numeric,
      notes = nullif(btrim(coalesce(p_item ->> 'notes', '')), ''),
      active = coalesce((p_item ->> 'active')::boolean, true),
      archived_at = case when coalesce((p_item ->> 'archived')::boolean, false) then coalesce(archived_at, now()) else null end,
      photo_path = coalesce(nullif(p_item ->> 'photo_path', ''), photo_path),
      bin_code = coalesce(nullif(btrim(coalesce(p_item ->> 'bin_code', '')), ''), bin_code, public.next_bin_code(p_organization_id)),
      updated_at = now()
    where id = p_id
    returning * into v_row;
  else
    insert into public.consumables (
      id, organization_id, name, category, unit, sku, location_id, quantity_on_hand,
      minimum_quantity, reorder_quantity, vendor, unit_cost, notes, active, photo_path, bin_code
    ) values (
      p_id, p_organization_id, v_name,
      nullif(btrim(coalesce(p_item ->> 'category', '')), ''),
      v_unit,
      nullif(btrim(coalesce(p_item ->> 'sku', '')), ''),
      nullif(p_item ->> 'location_id', '')::uuid,
      0,
      greatest(coalesce((p_item ->> 'reorder_point')::numeric, 0), 0),
      greatest(coalesce((p_item ->> 'reorder_quantity')::numeric, 0), 0),
      nullif(btrim(coalesce(p_item ->> 'vendor', '')), ''),
      nullif(p_item ->> 'unit_cost', '')::numeric,
      nullif(btrim(coalesce(p_item ->> 'notes', '')), ''),
      coalesce((p_item ->> 'active')::boolean, true),
      nullif(p_item ->> 'photo_path', ''),
      coalesce(nullif(btrim(coalesce(p_item ->> 'bin_code', '')), ''), public.next_bin_code(p_organization_id))
    )
    returning * into v_row;
  end if;
  perform public.write_event(
    p_event_id, p_organization_id, 'consumable', p_id,
    case when v_old.id is null then 'created' else 'updated' end,
    case when v_old.id is null then null else jsonb_build_object('name', v_old.name, 'reorder_point', v_old.minimum_quantity, 'active', v_old.active) end,
    jsonb_build_object('name', v_row.name, 'reorder_point', v_row.minimum_quantity, 'active', v_row.active),
    null,
    jsonb_build_object('name', v_row.name)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.adjust_consumable_stock(
  p_id uuid,
  p_event_id uuid,
  p_kind text,
  p_quantity numeric,
  p_reason text,
  p_employee_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.consumables%rowtype;
  v_before numeric;
  v_after numeric;
  v_actor uuid := (select auth.uid());
begin
  select * into v_row from public.consumables where id = p_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if p_employee_id is null then
    perform public.require_inventory_edit(v_row.organization_id);
  elsif not (
    public.has_org_permission(v_row.organization_id, 'kiosk.use')
    or public.has_org_permission(v_row.organization_id, 'kiosk.manage')
  ) then
    raise exception 'You cannot use the kiosk.';
  end if;
  v_before := v_row.quantity_on_hand;
  if p_kind = 'receive' then
    if p_quantity <= 0 then raise exception 'Enter a quantity greater than zero.'; end if;
    v_after := v_before + p_quantity;
  elsif p_kind = 'use' then
    if p_quantity <= 0 then raise exception 'Enter a quantity greater than zero.'; end if;
    if v_before < p_quantity then raise exception 'That is more than you have on hand.'; end if;
    v_after := v_before - p_quantity;
  elsif p_kind = 'correction' then
    if p_quantity < 0 then raise exception 'A count cannot be negative.'; end if;
    v_after := p_quantity;
  else
    raise exception 'Choose receive, use, or a count correction.';
  end if;
  update public.consumables set quantity_on_hand = v_after, updated_at = now() where id = p_id;
  insert into public.stock_adjustments (organization_id, consumable_id, kind, quantity_delta, notes, created_by)
  values (
    v_row.organization_id, p_id,
    case p_kind when 'receive' then 'received' when 'use' then 'take' else 'correction' end,
    v_after - v_before,
    nullif(btrim(coalesce(p_reason, '')), ''),
    v_actor
  );
  perform public.write_event(
    p_event_id, v_row.organization_id, 'consumable', p_id, 'adjusted',
    jsonb_build_object('quantity', v_before),
    jsonb_build_object('quantity', v_after),
    nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_row.name, 'kind', p_kind, 'employee_id', p_employee_id)
  );
  return jsonb_build_object(
    'quantity', v_after,
    'crossed', v_before > v_row.minimum_quantity and v_after <= v_row.minimum_quantity,
    'name', v_row.name,
    'organization_id', v_row.organization_id
  );
end;
$$;

create or replace function public.set_kiosk_pin(
  p_employee_id uuid,
  p_pin text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.employees where id = p_employee_id;
  if v_org is null then
    raise exception 'That person was not found.';
  end if;
  if not (
    public.has_org_permission(v_org, 'kiosk.manage')
    or public.has_org_permission(v_org, 'people.manage')
  ) then
    raise exception 'You cannot set a kiosk PIN.';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'Use a 4-digit PIN.';
  end if;
  update public.employees set
    kiosk_pin_hash = crypt(p_pin, gen_salt('bf')),
    kiosk_pin_failures = 0,
    kiosk_pin_locked_until = null
  where id = p_employee_id;
end;
$$;

create or replace function public.start_kiosk_session(
  p_employee_id uuid,
  p_pin text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_emp public.employees%rowtype;
  v_id uuid := gen_random_uuid();
begin
  select * into v_emp from public.employees where id = p_employee_id and archived_at is null and active;
  if not found then
    raise exception 'That person was not found.';
  end if;
  if not (
    public.has_org_permission(v_emp.organization_id, 'kiosk.use')
    or public.has_org_permission(v_emp.organization_id, 'kiosk.manage')
  ) then
    raise exception 'You cannot use the kiosk.';
  end if;
  if v_emp.kiosk_pin_locked_until is not null and v_emp.kiosk_pin_locked_until > now() then
    raise exception 'This PIN is locked. Try again in a few minutes.';
  end if;
  if v_emp.kiosk_pin_hash is null or crypt(coalesce(p_pin, ''), v_emp.kiosk_pin_hash) is distinct from v_emp.kiosk_pin_hash then
    update public.employees set
      kiosk_pin_failures = kiosk_pin_failures + 1,
      kiosk_pin_locked_until = case when kiosk_pin_failures + 1 >= 5 then now() + interval '5 minutes' else kiosk_pin_locked_until end
    where id = p_employee_id;
    raise exception 'That PIN does not match.';
  end if;
  update public.employees set kiosk_pin_failures = 0, kiosk_pin_locked_until = null where id = p_employee_id;
  insert into public.kiosk_sessions (id, organization_id, employee_id, expires_at)
  values (v_id, v_emp.organization_id, p_employee_id, now() + interval '15 minutes');
  return v_id;
end;
$$;

create or replace function public.touch_kiosk_session(p_session uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.kiosk_sessions%rowtype;
begin
  select * into v_row from public.kiosk_sessions where id = p_session and expires_at > now();
  if not found then
    raise exception 'Start again and enter a PIN.';
  end if;
  if not (
    public.has_org_permission(v_row.organization_id, 'kiosk.use')
    or public.has_org_permission(v_row.organization_id, 'kiosk.manage')
  ) then
    raise exception 'You cannot use the kiosk.';
  end if;
  update public.kiosk_sessions set expires_at = now() + interval '15 minutes' where id = p_session;
  return v_row.employee_id;
end;
$$;

create or replace function public.kiosk_take(
  p_session uuid,
  p_event_id uuid,
  p_consumable_id uuid,
  p_quantity numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
  v_name text;
begin
  v_employee := public.touch_kiosk_session(p_session);
  select name into v_name from public.employees where id = v_employee;
  return public.adjust_consumable_stock(p_consumable_id, p_event_id, 'use', p_quantity, 'Kiosk · ' || coalesce(v_name, 'Someone'), v_employee);
end;
$$;

create or replace function public.save_asset_warranty(
  p_asset_id uuid,
  p_event_id uuid,
  p_start date,
  p_end date,
  p_provider text,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.assets%rowtype;
  v_row public.assets%rowtype;
begin
  select * into v_old from public.assets where id = p_asset_id;
  if not found then
    raise exception 'That item was not found.';
  end if;
  if not public.has_org_permission(v_old.organization_id, 'assets.write') then
    raise exception 'You cannot edit this item.';
  end if;
  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'The warranty end is before the start.';
  end if;
  update public.assets set
    warranty_start = p_start,
    warranty_end = p_end,
    warranty_provider = nullif(btrim(coalesce(p_provider, '')), ''),
    warranty_notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_asset_id
  returning * into v_row;
  perform public.write_event(
    p_event_id, v_row.organization_id, 'asset', p_asset_id, 'updated',
    jsonb_build_object('warranty_start', v_old.warranty_start, 'warranty_end', v_old.warranty_end, 'warranty_provider', v_old.warranty_provider),
    jsonb_build_object('warranty_start', v_row.warranty_start, 'warranty_end', v_row.warranty_end, 'warranty_provider', v_row.warranty_provider),
    null,
    jsonb_build_object('name', v_row.name, 'tag_id', v_row.tag_id)
  );
end;
$$;

create or replace function public.save_stock_alert_settings(
  p_organization_id uuid,
  p_event_id uuid,
  p_notify_low_stock boolean,
  p_warranty_days integer[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.organization_settings%rowtype;
  v_day integer;
begin
  perform public.require_settings(p_organization_id);
  if p_warranty_days is null or cardinality(p_warranty_days) < 1 or cardinality(p_warranty_days) > 4 then
    raise exception 'Use 1 to 4 warranty reminder days.';
  end if;
  foreach v_day in array p_warranty_days loop
    if v_day < 1 or v_day > 365 then
      raise exception 'Warranty reminders must be from 1 to 365 days.';
    end if;
  end loop;
  insert into public.organization_settings (organization_id) values (p_organization_id) on conflict do nothing;
  select * into v_before from public.organization_settings where organization_id = p_organization_id;
  update public.organization_settings set
    notify_low_stock = coalesce(p_notify_low_stock, true),
    warranty_reminder_days = p_warranty_days
  where organization_id = p_organization_id;
  perform public.write_event(
    p_event_id, p_organization_id, 'organization', p_organization_id, 'updated',
    jsonb_build_object('notify_low_stock', v_before.notify_low_stock, 'warranty_reminder_days', array_to_string(v_before.warranty_reminder_days, ', ')),
    jsonb_build_object('notify_low_stock', coalesce(p_notify_low_stock, true), 'warranty_reminder_days', array_to_string(p_warranty_days, ', ')),
    null, '{}'::jsonb
  );
end;
$$;

create or replace function public.claim_warranty_reminders(p_today date)
returns table (
  organization_id uuid,
  asset_id uuid,
  name text,
  tag_id text,
  warranty_end date,
  days_before integer,
  organization_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset record;
  v_day integer;
begin
  for v_asset in
    select a.id, a.organization_id, a.name, a.tag_id, a.warranty_end, o.name as organization_name,
      coalesce(s.warranty_reminder_days, '{30,7}'::integer[]) as days
    from public.assets a
    join public.organizations o on o.id = a.organization_id
    left join public.organization_settings s on s.organization_id = a.organization_id
    where a.archived_at is null and a.warranty_end is not null
  loop
    foreach v_day in array v_asset.days loop
      if v_asset.warranty_end - p_today = v_day
        and not exists (
          select 1 from public.warranty_reminder_sends sent
          where sent.asset_id = v_asset.id and sent.warranty_end = v_asset.warranty_end and sent.days_before = v_day
        )
      then
        insert into public.warranty_reminder_sends (organization_id, asset_id, warranty_end, days_before)
        values (v_asset.organization_id, v_asset.id, v_asset.warranty_end, v_day);
        organization_id := v_asset.organization_id;
        asset_id := v_asset.id;
        name := v_asset.name;
        tag_id := v_asset.tag_id;
        warranty_end := v_asset.warranty_end;
        days_before := v_day;
        organization_name := v_asset.organization_name;
        return next;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.release_warranty_reminder(
  p_asset_id uuid,
  p_warranty_end date,
  p_days_before integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.warranty_reminder_sends
  where asset_id = p_asset_id and warranty_end = p_warranty_end and days_before = p_days_before;
end;
$$;

drop policy if exists consumables_select on public.consumables;
create policy consumables_select on public.consumables
  for select to authenticated using (
    public.has_org_permission(organization_id, 'inventory.view')
    or public.has_org_permission(organization_id, 'inventory.edit')
    or public.has_org_permission(organization_id, 'inventory.manage')
    or public.has_org_permission(organization_id, 'kiosk.use')
  );

drop policy if exists consumables_write on public.consumables;
create policy consumables_write on public.consumables
  for all to authenticated using (
    public.has_org_permission(organization_id, 'inventory.edit')
    or public.has_org_permission(organization_id, 'inventory.manage')
  ) with check (
    public.has_org_permission(organization_id, 'inventory.edit')
    or public.has_org_permission(organization_id, 'inventory.manage')
  );

drop policy if exists stock_adjustments_select on public.stock_adjustments;
create policy stock_adjustments_select on public.stock_adjustments
  for select to authenticated using (
    public.has_org_permission(organization_id, 'inventory.view')
    or public.has_org_permission(organization_id, 'inventory.edit')
    or public.has_org_permission(organization_id, 'inventory.manage')
  );

drop policy if exists inventory_files_storage_write on storage.objects;
create policy inventory_files_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'asset-files'
    and (storage.foldername(name))[2] = 'inventory'
    and public.has_org_permission(((storage.foldername(name))[1])::uuid, 'inventory.edit')
  );

revoke all on function public.require_inventory_edit(uuid) from public, anon, authenticated;
revoke all on function public.next_bin_code(uuid) from public, anon, authenticated;
revoke all on function public.touch_kiosk_session(uuid) from public, anon, authenticated;
revoke all on function public.claim_warranty_reminders(date) from public, anon, authenticated;
revoke all on function public.release_warranty_reminder(uuid, date, integer) from public, anon, authenticated;

grant execute on function public.save_consumable(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.adjust_consumable_stock(uuid, uuid, text, numeric, text, uuid) to authenticated;
grant execute on function public.set_kiosk_pin(uuid, text) to authenticated;
grant execute on function public.start_kiosk_session(uuid, text) to authenticated;
grant execute on function public.kiosk_take(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.save_asset_warranty(uuid, uuid, date, date, text, text) to authenticated;
grant execute on function public.save_stock_alert_settings(uuid, uuid, boolean, integer[]) to authenticated;
grant select on public.consumables to authenticated;
grant select on public.stock_adjustments to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_warranty_reminders(date) to service_role;
    grant execute on function public.release_warranty_reminder(uuid, date, integer) to service_role;
  end if;
end $$;
