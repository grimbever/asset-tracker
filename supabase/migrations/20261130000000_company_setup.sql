-- Company setup: role matrix, role names, and organization defaults.
-- Safe to run again. It does not erase equipment, people, invites, or subscriptions.

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  accent_color text not null default '#1d6b4f',
  logo_url text not null default '',
  date_format text not null default 'MMM d, yyyy',
  default_checkout_days integer not null default 0 check (default_checkout_days between 0 and 365),
  checkout_due_required boolean not null default false,
  tag_prefix text not null default 'AT',
  label_template text not null default 'avery-5163',
  notify_checkout boolean not null default true,
  notify_checkin boolean not null default true,
  notify_status boolean not null default true,
  low_stock_threshold integer not null default 1 check (low_stock_threshold between 0 and 100000),
  maintenance_reminder_days integer not null default 7 check (maintenance_reminder_days between 0 and 365),
  require_note_broken boolean not null default false,
  require_note_missing boolean not null default false,
  approver_role_id uuid references public.roles (id) on delete set null,
  invite_expiry_days integer not null default 14 check (invite_expiry_days between 1 and 90),
  upcoming_days integer[] not null default '{7,30,90,180}'
);

alter table public.organization_settings enable row level security;

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select on public.organization_settings
  for select to authenticated using (public.is_org_member(organization_id));

grant select on public.organization_settings to authenticated;

create or replace function public.ensure_company_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organization_settings_seed on public.organizations;
create trigger organization_settings_seed
  after insert on public.organizations
  for each row execute function public.ensure_company_settings();

insert into public.organization_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

update public.organization_settings s
set approver_role_id = coalesce(
  s.approver_role_id,
  (select r.id from public.roles r where r.organization_id = s.organization_id and r.key = 'manager' limit 1),
  (select r.id from public.roles r where r.organization_id = s.organization_id and r.key = 'admin' limit 1)
)
where s.approver_role_id is null;

create or replace function public.assign_default_approver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key = 'manager' then
    update public.organization_settings
      set approver_role_id = new.id
      where organization_id = new.organization_id and approver_role_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists roles_default_approver on public.roles;
create trigger roles_default_approver
  after insert on public.roles
  for each row execute function public.assign_default_approver();

-- Give existing organizations the same access they already have, under the new permission names.
insert into public.role_permissions (id, organization_id, role_id, permission)
select gen_random_uuid(), r.organization_id, r.id, needed.permission
from public.roles r
cross join (
  values ('people.view'), ('locations.view'), ('history.view'), ('kits.view'), ('kits.write'), ('maintenance.view')
) as needed(permission)
where (
  (needed.permission = 'people.view' and exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission in ('assets.view', 'settings.manage', 'people.manage')
  ))
  or (needed.permission = 'locations.view' and exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission in ('assets.view', 'settings.manage', 'locations.manage')
  ))
  or (needed.permission = 'history.view' and exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission in ('assets.view', 'assets.scan', 'exports.full', 'assets.view_assigned')
  ))
  or (needed.permission = 'kits.view' and exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission = 'assets.view'
  ))
  or (needed.permission = 'kits.write' and exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission = 'assets.write'
  ))
  or (needed.permission = 'maintenance.view' and exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission in ('assets.view', 'assets.maintain')
  ))
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
    when 'settings' then array['settings.manage']
    when 'users' then array['org.manage']
    when 'kiosk' then array['kiosk.manage']
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
    when p_module = 'settings' and p_level = 'manage' then array['settings.manage']
    when p_module = 'users' and p_level = 'manage' then array['org.manage']
    when p_module = 'kiosk' and p_level = 'manage' then array['kiosk.manage']
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
  foreach v_level in array array['manage', 'edit', 'view'] loop
    v_grant := public.module_grants(p_module, v_level);
    if v_grant is not null and cardinality(v_grant) > 0 and v_grant <@ p_permissions then
      return case v_level when 'manage' then 'Manage' when 'edit' then 'Edit' else 'View' end;
    end if;
  end loop;
  v_grant := coalesce(public.module_grants(p_module, 'edit'), public.module_grants(p_module, 'manage'), array[]::text[]);
  v_view := coalesce(public.module_grants(p_module, 'view'), array[]::text[]);
  foreach v_perm in array v_grant loop
    if not (v_perm = any (v_view)) and v_perm = any (p_permissions) then
      if public.module_grants(p_module, 'manage') is not null then return 'Manage'; end if;
      return 'Edit';
    end if;
  end loop;
  foreach v_perm in array v_view loop
    if v_perm = any (p_permissions) then return 'View'; end if;
  end loop;
  return 'None';
end;
$$;

create or replace function public.company_lockout_message(
  p_org uuid,
  p_role uuid,
  p_next_permissions text[],
  p_next_active boolean,
  p_assigned boolean,
  p_pending boolean
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_role uuid;
  v_holders integer := 0;
  v_actor_ok boolean := false;
  v_role record;
  v_perms text[];
  v_active boolean;
begin
  if p_next_active = false and p_assigned then
    return 'This role is assigned to someone. Move them first.';
  end if;
  if p_next_active = false and p_pending then
    return 'This role has an open invite. Revoke it first.';
  end if;
  select m.role_id into v_actor_role
  from public.memberships m
  where m.organization_id = p_org and m.user_id = auth.uid();
  for v_role in select id, active from public.roles where organization_id = p_org loop
    if v_role.id = p_role then
      v_perms := p_next_permissions;
      v_active := p_next_active;
    else
      select coalesce(array_agg(permission), array[]::text[]) into v_perms
      from public.role_permissions where role_id = v_role.id;
      v_active := v_role.active;
    end if;
    if v_active and 'settings.manage' = any (coalesce(v_perms, array[]::text[])) then
      v_holders := v_holders + 1;
    end if;
    if v_role.id = v_actor_role and 'settings.manage' = any (coalesce(v_perms, array[]::text[])) then
      v_actor_ok := true;
    end if;
  end loop;
  if v_holders = 0 then
    return 'Keep company setup on at least one active role.';
  end if;
  if not v_actor_ok then
    return 'You cannot remove your own access to company setup.';
  end if;
  return null;
end;
$$;

create or replace function public.role_permission_list(p_role uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(permission order by permission), array[]::text[])
  from public.role_permissions
  where role_id = p_role;
$$;

create or replace function public.replace_role_module(
  p_role uuid,
  p_org uuid,
  p_module text,
  p_level text
) returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text[] := public.role_permission_list(p_role);
  v_universe text[] := public.module_universe(p_module);
  v_grant text[] := public.module_grants(p_module, p_level);
  v_next text[] := array[]::text[];
  v_perm text;
begin
  if v_universe is null or v_grant is null then
    raise exception 'Choose a level this module supports.';
  end if;
  foreach v_perm in array v_current loop
    if not (v_perm = any (v_universe)) or (p_module = 'assets' and p_level <> 'none' and v_perm = 'assets.view_assigned') then
      v_next := v_next || v_perm;
    end if;
  end loop;
  foreach v_perm in array v_grant loop
    if not (v_perm = any (v_next)) then
      v_next := v_next || v_perm;
    end if;
  end loop;
  delete from public.role_permissions where role_id = p_role and permission = any (v_universe);
  foreach v_perm in array v_next loop
    if v_perm = any (v_universe) then
      insert into public.role_permissions (id, organization_id, role_id, permission)
      values (gen_random_uuid(), p_org, p_role, v_perm);
    end if;
  end loop;
  return v_next;
end;
$$;

create or replace function public.restore_role_permissions(
  p_org uuid,
  p_role uuid,
  p_module text,
  p_permissions text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perm text;
begin
  delete from public.role_permissions where role_id = p_role and permission = any (public.module_universe(p_module));
  foreach v_perm in array coalesce(p_permissions, array[]::text[]) loop
    if v_perm = any (public.module_universe(p_module)) then
      insert into public.role_permissions (id, organization_id, role_id, permission)
      values (gen_random_uuid(), p_org, p_role, v_perm)
      on conflict (role_id, permission) do nothing;
    end if;
  end loop;
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
  if p_module in ('kiosk', 'work_orders') then
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

create or replace function public.rename_role(
  p_organization_id uuid,
  p_role_id uuid,
  p_event_id uuid,
  p_name text,
  p_description text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.roles%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := btrim(coalesce(p_description, ''));
begin
  perform public.require_settings(p_organization_id);
  select * into v_role from public.roles where id = p_role_id and organization_id = p_organization_id;
  if not found then
    raise exception 'That role was not found.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Enter a role name.';
  end if;
  update public.roles set name = v_name, description = left(v_description, 240) where id = p_role_id;
  perform public.write_event(
    p_event_id, p_organization_id, 'role', p_role_id, 'updated',
    jsonb_build_object('name', v_role.name, 'description', v_role.description),
    jsonb_build_object('name', v_name, 'description', left(v_description, 240)),
    null,
    jsonb_build_object('name', v_name)
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
  v_assignable boolean;
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
  v_assignable := case
    when v_role.key = 'kiosk' then false
    else p_active
  end;
  update public.roles set active = p_active, assignable = v_assignable where id = p_role_id;
  perform public.write_event(
    p_event_id, p_organization_id, 'role', p_role_id, 'updated',
    jsonb_build_object('active', v_role.active),
    jsonb_build_object('active', p_active),
    null,
    jsonb_build_object('name', v_role.name)
  );
end;
$$;

create or replace function public.clone_role(
  p_organization_id uuid,
  p_source_id uuid,
  p_event_id uuid,
  p_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.roles%rowtype;
  v_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_name, ''));
  v_key text;
  v_perm text;
begin
  perform public.require_settings(p_organization_id);
  select * into v_source from public.roles where id = p_source_id and organization_id = p_organization_id;
  if not found then
    raise exception 'That role was not found.';
  end if;
  if char_length(v_name) < 1 then
    v_name := left('Copy of ' || v_source.name, 80);
  end if;
  v_key := 'custom_' || substr(replace(v_id::text, '-', ''), 1, 12);
  insert into public.roles (id, organization_id, key, name, description, active, assignable, built_in)
  values (v_id, p_organization_id, v_key, v_name, left('Copied from ' || v_source.name, 240), true, true, false);
  for v_perm in select permission from public.role_permissions where role_id = p_source_id loop
    insert into public.role_permissions (id, organization_id, role_id, permission)
    values (gen_random_uuid(), p_organization_id, v_id, v_perm);
  end loop;
  perform public.write_event(
    p_event_id, p_organization_id, 'role', v_id, 'created',
    '{}'::jsonb,
    jsonb_build_object('name', v_name, 'description', left('Copied from ' || v_source.name, 240)),
    null,
    jsonb_build_object('name', v_name)
  );
  return v_id;
end;
$$;

create or replace function public.save_company_settings(
  p_organization_id uuid,
  p_event_id uuid,
  p_settings jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations%rowtype;
  v_before public.organization_settings%rowtype;
  v_name text;
  v_tz text;
  v_accent text;
  v_logo text;
  v_format text;
  v_prefix text;
  v_template text;
  v_emails text;
  v_email text;
  v_days integer;
  v_upcoming integer[] := array[]::integer[];
  v_day integer;
  v_previous integer := 0;
  v_approver uuid;
  v_approver_name text;
  v_before_approver text;
  v_before_emails text;
  v_after_emails text;
begin
  perform public.require_settings(p_organization_id);
  select * into v_org from public.organizations where id = p_organization_id;
  if not found then
    raise exception 'That organization was not found.';
  end if;
  insert into public.organization_settings (organization_id) values (p_organization_id) on conflict do nothing;
  select * into v_before from public.organization_settings where organization_id = p_organization_id;
  v_name := btrim(coalesce(p_settings ->> 'name', ''));
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Enter an organization name.';
  end if;
  v_tz := btrim(coalesce(p_settings ->> 'timezone', ''));
  begin
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'Use a timezone like America/Chicago';
  end;
  v_accent := lower(btrim(coalesce(p_settings ->> 'accent_color', '')));
  if v_accent !~ '^#[0-9a-f]{6}$' then
    raise exception 'Use an accent color like #1d6b4f.';
  end if;
  v_logo := btrim(coalesce(p_settings ->> 'logo_url', ''));
  if v_logo <> '' and v_logo !~* '^https://' then
    raise exception 'The logo address must start with https://.';
  end if;
  v_format := coalesce(p_settings ->> 'date_format', '');
  if v_format not in ('MMM d, yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd') then
    raise exception 'Choose a date format.';
  end if;
  v_prefix := upper(btrim(coalesce(p_settings ->> 'tag_prefix', '')));
  if v_prefix !~ '^[A-Z0-9]{1,6}$' then
    raise exception 'The tag prefix must be 1 to 6 letters or numbers.';
  end if;
  v_template := btrim(coalesce(p_settings ->> 'label_template', ''));
  if char_length(v_template) < 1 or char_length(v_template) > 40 then
    raise exception 'Choose a label template.';
  end if;
  if coalesce((p_settings ->> 'default_checkout_days')::integer, -1) not between 0 and 365 then
    raise exception 'Default check-out length must be from 0 to 365 days.';
  end if;
  if coalesce((p_settings ->> 'invite_expiry_days')::integer, 0) not between 1 and 90 then
    raise exception 'Invite links must last from 1 to 90 days.';
  end if;
  if coalesce((p_settings ->> 'low_stock_threshold')::integer, -1) not between 0 and 100000 then
    raise exception 'The low-stock threshold must be from 0 to 100000.';
  end if;
  if coalesce((p_settings ->> 'maintenance_reminder_days')::integer, -1) not between 0 and 365 then
    raise exception 'The maintenance reminder must be from 0 to 365 days.';
  end if;
  if jsonb_typeof(p_settings -> 'upcoming_days') <> 'array' or jsonb_array_length(p_settings -> 'upcoming_days') not between 1 and 4 then
    raise exception 'Use 1 to 4 upcoming windows.';
  end if;
  for v_day in select value::integer from jsonb_array_elements_text(p_settings -> 'upcoming_days') as value loop
    if v_day < 1 or v_day > 365 or v_day <= v_previous then
      raise exception 'Each upcoming window must be longer than the one before it.';
    end if;
    v_upcoming := v_upcoming || v_day;
    v_previous := v_day;
  end loop;
  v_approver := nullif(p_settings ->> 'approver_role_id', '')::uuid;
  if v_approver is not null and not exists (
    select 1 from public.roles r where r.id = v_approver and r.organization_id = p_organization_id
  ) then
    raise exception 'Choose a role that belongs to this organization.';
  end if;
  select r.name into v_before_approver from public.roles r where r.id = v_before.approver_role_id;
  select r.name into v_approver_name from public.roles r where r.id = v_approver;
  select coalesce(string_agg(email, ', ' order by email), '') into v_before_emails
  from public.notification_recipients where organization_id = p_organization_id;
  update public.organizations set name = v_name, timezone = v_tz where id = p_organization_id;
  update public.organization_settings set
    accent_color = v_accent,
    logo_url = v_logo,
    date_format = v_format,
    default_checkout_days = (p_settings ->> 'default_checkout_days')::integer,
    checkout_due_required = coalesce((p_settings ->> 'checkout_due_required')::boolean, false),
    tag_prefix = v_prefix,
    label_template = v_template,
    notify_checkout = coalesce((p_settings ->> 'notify_checkout')::boolean, true),
    notify_checkin = coalesce((p_settings ->> 'notify_checkin')::boolean, true),
    notify_status = coalesce((p_settings ->> 'notify_status')::boolean, true),
    low_stock_threshold = (p_settings ->> 'low_stock_threshold')::integer,
    maintenance_reminder_days = (p_settings ->> 'maintenance_reminder_days')::integer,
    require_note_broken = coalesce((p_settings ->> 'require_note_broken')::boolean, false),
    require_note_missing = coalesce((p_settings ->> 'require_note_missing')::boolean, false),
    approver_role_id = v_approver,
    invite_expiry_days = (p_settings ->> 'invite_expiry_days')::integer,
    upcoming_days = v_upcoming
  where organization_id = p_organization_id;
  if v_approver is not null then
    insert into public.role_permissions (id, organization_id, role_id, permission)
    select gen_random_uuid(), p_organization_id, v_approver, 'approvals.act'
    where not exists (
      select 1 from public.role_permissions rp
      where rp.role_id = v_approver and rp.permission = 'approvals.act'
    );
  end if;
  delete from public.notification_recipients where organization_id = p_organization_id;
  v_emails := coalesce(p_settings ->> 'notify_emails', '');
  foreach v_email in array regexp_split_to_array(v_emails, '[[:space:],;]+') loop
    if position('@' in lower(btrim(v_email))) > 1 then
      insert into public.notification_recipients (organization_id, email)
      values (p_organization_id, lower(btrim(v_email)))
      on conflict (organization_id, email) do nothing;
    end if;
  end loop;
  select coalesce(string_agg(email, ', ' order by email), '') into v_after_emails
  from public.notification_recipients where organization_id = p_organization_id;
  perform public.write_event(
    p_event_id, p_organization_id, 'organization', p_organization_id, 'updated',
    jsonb_build_object(
      'name', v_org.name,
      'timezone', v_org.timezone,
      'accent_color', v_before.accent_color,
      'logo_url', v_before.logo_url,
      'date_format', v_before.date_format,
      'default_checkout_days', v_before.default_checkout_days,
      'checkout_due_required', v_before.checkout_due_required,
      'tag_prefix', v_before.tag_prefix,
      'label_template', v_before.label_template,
      'notify_checkout', v_before.notify_checkout,
      'notify_checkin', v_before.notify_checkin,
      'notify_status', v_before.notify_status,
      'notify_emails', v_before_emails,
      'low_stock_threshold', v_before.low_stock_threshold,
      'maintenance_reminder_days', v_before.maintenance_reminder_days,
      'require_note_broken', v_before.require_note_broken,
      'require_note_missing', v_before.require_note_missing,
      'approver', v_before_approver,
      'invite_expiry_days', v_before.invite_expiry_days,
      'upcoming_days', array_to_string(v_before.upcoming_days, ', ')
    ),
    jsonb_build_object(
      'name', v_name,
      'timezone', v_tz,
      'accent_color', v_accent,
      'logo_url', v_logo,
      'date_format', v_format,
      'default_checkout_days', (p_settings ->> 'default_checkout_days')::integer,
      'checkout_due_required', coalesce((p_settings ->> 'checkout_due_required')::boolean, false),
      'tag_prefix', v_prefix,
      'label_template', v_template,
      'notify_checkout', coalesce((p_settings ->> 'notify_checkout')::boolean, true),
      'notify_checkin', coalesce((p_settings ->> 'notify_checkin')::boolean, true),
      'notify_status', coalesce((p_settings ->> 'notify_status')::boolean, true),
      'notify_emails', v_after_emails,
      'low_stock_threshold', (p_settings ->> 'low_stock_threshold')::integer,
      'maintenance_reminder_days', (p_settings ->> 'maintenance_reminder_days')::integer,
      'require_note_broken', coalesce((p_settings ->> 'require_note_broken')::boolean, false),
      'require_note_missing', coalesce((p_settings ->> 'require_note_missing')::boolean, false),
      'approver', v_approver_name,
      'invite_expiry_days', (p_settings ->> 'invite_expiry_days')::integer,
      'upcoming_days', array_to_string(v_upcoming, ', ')
    ),
    null,
    jsonb_build_object('name', v_name)
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
  v_prefix text := 'AT';
begin
  select upper(tag_prefix) into v_prefix from public.organization_settings where organization_id = p_org;
  if v_prefix is null or v_prefix !~ '^[A-Z0-9]{1,6}$' then
    v_prefix := 'AT';
  end if;
  for i in 1..30 loop
    update public.organizations
      set next_tag_number = next_tag_number + 1
      where id = p_org
      returning next_tag_number - 1 into n;
    candidate := v_prefix || '-' || n::text;
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

create or replace function public.change_asset_status(
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
  v_broken boolean := false;
  v_missing boolean := false;
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
  select s.require_note_broken, s.require_note_missing into v_broken, v_missing
  from public.organization_settings s where s.organization_id = v_asset.organization_id;
  if p_status in ('disposed', 'destroyed') and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Disposed and destroyed need a note.';
  end if;
  if p_status = 'broken' and coalesce(v_broken, false) and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'This status needs a note.';
  end if;
  if p_status = 'missing' and coalesce(v_missing, false) and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'This status needs a note.';
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
  v_ready boolean;
begin
  select exists (
    select 1 from public.role_permissions rp
    where rp.organization_id = p_organization_id and rp.permission = 'history.view'
  ) into v_ready;
  if not (
    public.has_org_permission(p_organization_id, 'history.view')
    or (
      not v_ready and (
        public.has_org_permission(p_organization_id, 'assets.view')
        or public.has_org_permission(p_organization_id, 'assets.scan')
      )
    )
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

create or replace function public.apply_invite_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  select invite_expiry_days into v_days
  from public.organization_settings where organization_id = new.organization_id;
  if v_days is null then
    v_days := 14;
  end if;
  new.expires_at := now() + make_interval(days => v_days);
  return new;
end;
$$;

drop trigger if exists invites_apply_expiry on public.invites;
create trigger invites_apply_expiry
  before insert on public.invites
  for each row execute function public.apply_invite_expiry();

create or replace function public.enforce_company_asset_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.organization_settings%rowtype;
  v_tz text;
  v_ready boolean;
begin
  select * into v_settings from public.organization_settings where organization_id = new.organization_id;
  if tg_op = 'UPDATE' and new.status = 'checked_out' and old.status is distinct from 'checked_out' and v_settings.organization_id is not null then
    if new.due_on is null and v_settings.default_checkout_days > 0 then
      select timezone into v_tz from public.organizations where id = new.organization_id;
      new.due_on := ((now() at time zone coalesce(v_tz, 'UTC'))::date + v_settings.default_checkout_days);
    end if;
    if v_settings.checkout_due_required and new.due_on is null then
      raise exception 'A due date is required.';
    end if;
  end if;
  select exists (
    select 1 from public.role_permissions rp
    where rp.organization_id = new.organization_id and rp.permission = 'kits.write'
  ) into v_ready;
  if v_ready and (
    (tg_op = 'INSERT' and (new.parent_asset_id is not null or new.checkout_as_unit))
    or (tg_op = 'UPDATE' and (
      new.parent_asset_id is distinct from old.parent_asset_id
      or new.checkout_as_unit is distinct from old.checkout_as_unit
    ))
  ) then
    if not public.has_org_permission(new.organization_id, 'kits.write') then
      raise exception 'You cannot change kits.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assets_company_rules on public.assets;
create trigger assets_company_rules
  before insert or update on public.assets
  for each row execute function public.enforce_company_asset_rules();

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select to authenticated using (
    public.has_org_permission(organization_id, 'org.manage')
    or public.has_org_permission(organization_id, 'settings.manage')
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated using (
    public.has_org_permission(organization_id, 'people.view')
    or public.has_org_permission(organization_id, 'people.manage')
    or public.has_org_permission(organization_id, 'settings.manage')
    or (
      not exists (
        select 1 from public.role_permissions rp
        where rp.organization_id = employees.organization_id and rp.permission = 'people.view'
      )
      and public.is_org_member(organization_id)
    )
  );

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated using (
    public.has_org_permission(organization_id, 'locations.view')
    or public.has_org_permission(organization_id, 'locations.manage')
    or public.has_org_permission(organization_id, 'settings.manage')
    or (
      not exists (
        select 1 from public.role_permissions rp
        where rp.organization_id = locations.organization_id and rp.permission = 'locations.view'
      )
      and public.is_org_member(organization_id)
    )
  );

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated using (
    public.has_org_permission(organization_id, 'history.view')
    or (
      not exists (
        select 1 from public.role_permissions rp
        where rp.organization_id = events.organization_id and rp.permission = 'history.view'
      )
      and (
        public.has_org_permission(organization_id, 'assets.view')
        or public.has_org_permission(organization_id, 'assets.scan')
        or public.has_org_permission(organization_id, 'exports.full')
        or public.has_org_permission(organization_id, 'assets.view_assigned')
      )
    )
  );

revoke all on function public.ensure_company_settings() from public, anon, authenticated;
revoke all on function public.assign_default_approver() from public, anon, authenticated;
revoke all on function public.module_universe(text) from public, anon, authenticated;
revoke all on function public.module_grants(text, text) from public, anon, authenticated;
revoke all on function public.module_level_label(text, text[]) from public, anon, authenticated;
revoke all on function public.company_lockout_message(uuid, uuid, text[], boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.role_permission_list(uuid) from public, anon, authenticated;
revoke all on function public.replace_role_module(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.restore_role_permissions(uuid, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.apply_invite_expiry() from public, anon, authenticated;
revoke all on function public.enforce_company_asset_rules() from public, anon, authenticated;

grant execute on function public.set_role_module(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.rename_role(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.set_role_active(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.clone_role(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.save_company_settings(uuid, uuid, jsonb) to authenticated;
grant execute on function public.search_events(uuid, text, text, uuid, text, timestamptz, timestamptz) to authenticated;
