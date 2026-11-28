-- A separate permission for seeing the shopping list.
-- Safe to run again. It does not erase requests, stock, or equipment.

insert into public.role_permissions (id, organization_id, role_id, permission)
select gen_random_uuid(), r.organization_id, r.id, 'shopping.view'
from public.roles r
where exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission in ('inventory.view', 'inventory.edit', 'inventory.manage')
)
and not exists (
  select 1 from public.role_permissions existing
  where existing.role_id = r.id and existing.permission = 'shopping.view'
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
    when 'shopping' then array['shopping.view']
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
    when p_module = 'shopping' and p_level = 'view' then array['shopping.view']
    when p_module = 'settings' and p_level = 'manage' then array['settings.manage']
    when p_module = 'users' and p_level = 'manage' then array['org.manage']
    when p_module = 'kiosk' and p_level = 'use' then array['kiosk.use']
    when p_module = 'kiosk' and p_level = 'manage' then array['kiosk.use', 'kiosk.manage']
    when p_module = 'work_orders' and p_level = 'edit' then array['work_orders.complete', 'work_orders.convert']
    else null
  end;
$$;

drop policy if exists supply_requests_select on public.supply_requests;
create policy supply_requests_select on public.supply_requests
  for select to authenticated using (
    public.has_org_permission(organization_id, 'shopping.view')
    or public.has_org_permission(organization_id, 'inventory.edit')
    or public.has_org_permission(organization_id, 'inventory.manage')
    or public.has_org_permission(organization_id, 'kiosk.request')
  );
