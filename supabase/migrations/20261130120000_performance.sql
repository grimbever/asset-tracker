-- Faster row checks and the indexes those checks use.
-- Safe to run again. It does not erase equipment, people, invites, or subscriptions.

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
      and m.user_id = (select auth.uid())
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
      and m.user_id = (select auth.uid())
      and rp.permission = p_permission
  );
$$;

-- Lookups by the signed-in user, and by the foreign keys row policies join on.
create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_role_idx on public.memberships (role_id);
create index if not exists role_permissions_org_permission_idx on public.role_permissions (organization_id, permission);
create index if not exists employees_org_idx on public.employees (organization_id);
create index if not exists employees_user_idx on public.employees (user_id);
create index if not exists locations_org_idx on public.locations (organization_id);
create index if not exists invites_org_idx on public.invites (organization_id);
create index if not exists invites_role_idx on public.invites (role_id);
create index if not exists attachments_org_idx on public.attachments (organization_id, asset_id);
create index if not exists attachments_asset_idx on public.attachments (asset_id);
create index if not exists asset_statuses_org_idx on public.asset_statuses (organization_id);
create index if not exists asset_types_org_idx on public.asset_types (organization_id);
create index if not exists custom_fields_org_idx on public.custom_field_definitions (organization_id);
create index if not exists notification_recipients_org_idx on public.notification_recipients (organization_id);
create index if not exists roles_org_idx on public.roles (organization_id);
create index if not exists subscription_categories_org_idx on public.subscription_categories (organization_id);
create index if not exists subscription_people_org_idx on public.subscription_people (organization_id);
create index if not exists subscription_assets_org_idx on public.subscription_assets (organization_id);
create index if not exists subscription_files_sub_idx on public.subscription_files (subscription_id);
create index if not exists maintenance_org_idx on public.maintenance_schedules (organization_id);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select to authenticated using (
    public.has_org_permission(organization_id, 'org.manage')
    or public.has_org_permission(organization_id, 'settings.manage')
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert to authenticated with check (
    public.has_org_permission(organization_id, 'org.manage')
    and invited_by = (select auth.uid())
    and accepted_at is null
    and exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organization_id = invites.organization_id
        and r.assignable
        and r.active
    )
  );

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert to authenticated with check (
    public.has_org_permission(organization_id, 'settings.manage')
    or (
      public.has_org_permission(organization_id, 'assets.checkout')
      and user_id = (select auth.uid())
    )
  );

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select to authenticated using (
    public.has_org_permission(organization_id, 'assets.view')
    or (
      public.has_org_permission(organization_id, 'assets.view_assigned')
      and assigned_employee_id in (
        select e.id from public.employees e
        where e.organization_id = assets.organization_id
          and e.user_id = (select auth.uid())
      )
    )
  );

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_permission(uuid, text) to authenticated;
