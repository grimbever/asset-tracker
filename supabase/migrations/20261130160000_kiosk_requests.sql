-- Shopping list requests from the kiosk.
-- Safe to run again. It does not erase equipment, people, or stock.

alter table public.supply_requests add column if not exists item_name text;
alter table public.supply_requests add column if not exists photo_path text;
alter table public.supply_requests add column if not exists employee_id uuid references public.employees (id) on delete set null;

create index if not exists supply_requests_org_idx on public.supply_requests (organization_id, created_at desc);

-- Existing organizations (including this one) may request and create items from the kiosk.
-- A brand-new organization only gives these to Admin until someone turns them on.
insert into public.role_permissions (id, organization_id, role_id, permission)
select gen_random_uuid(), r.organization_id, r.id, needed.permission
from public.roles r
cross join (values ('kiosk.request'), ('kiosk.create_item')) as needed(permission)
where r.key in ('admin', 'manager', 'kiosk')
  and not exists (
    select 1 from public.role_permissions existing
    where existing.role_id = r.id and existing.permission = needed.permission
  );

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
  return public.adjust_consumable_stock(
    p_consumable_id,
    p_event_id,
    'use',
    p_quantity,
    'Kiosk · ' || coalesce(v_name, 'Someone') || ' · ' || trim(to_char(p_quantity, 'FM999990.###')),
    v_employee
  );
end;
$$;

create or replace function public.set_role_extra_permission(
  p_organization_id uuid,
  p_role_id uuid,
  p_event_id uuid,
  p_permission text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.roles%rowtype;
  v_had boolean;
begin
  perform public.require_settings(p_organization_id);
  if p_permission not in ('kiosk.request', 'kiosk.create_item') then
    raise exception 'That permission is not changed here.';
  end if;
  select * into v_role from public.roles where id = p_role_id and organization_id = p_organization_id;
  if not found then
    raise exception 'That role was not found.';
  end if;
  select exists (
    select 1 from public.role_permissions
    where role_id = p_role_id and permission = p_permission
  ) into v_had;
  if p_enabled and not v_had then
    insert into public.role_permissions (id, organization_id, role_id, permission)
    values (gen_random_uuid(), p_organization_id, p_role_id, p_permission);
  elsif not p_enabled and v_had then
    delete from public.role_permissions where role_id = p_role_id and permission = p_permission;
  end if;
  perform public.write_event(
    p_event_id, p_organization_id, 'role', p_role_id, 'updated',
    jsonb_build_object(p_permission, v_had),
    jsonb_build_object(p_permission, p_enabled),
    null,
    jsonb_build_object('name', v_role.name)
  );
end;
$$;

create or replace function public.submit_supply_request(
  p_id uuid,
  p_event_id uuid,
  p_session uuid,
  p_name text,
  p_quantity numeric,
  p_note text,
  p_photo_path text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
  v_session public.kiosk_sessions%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_person text;
begin
  select * into v_session from public.kiosk_sessions where id = p_session and expires_at > now();
  if not found then
    raise exception 'Start again and enter a PIN.';
  end if;
  if not public.has_org_permission(v_session.organization_id, 'kiosk.request') then
    raise exception 'This kiosk cannot add shopping requests.';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'Enter the item name.';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity) then
    raise exception 'Enter a whole number greater than zero.';
  end if;
  v_employee := public.touch_kiosk_session(p_session);
  select name into v_person from public.employees where id = v_employee;
  insert into public.supply_requests (
    id, organization_id, quantity, requester_name, employee_id, status, notes, item_name, photo_path
  ) values (
    p_id, v_session.organization_id, p_quantity, v_person, v_employee, 'open',
    nullif(btrim(coalesce(p_note, '')), ''), v_name, nullif(btrim(coalesce(p_photo_path, '')), '')
  );
  perform public.write_event(
    p_event_id, v_session.organization_id, 'supply_request', p_id, 'created',
    null,
    jsonb_build_object('name', v_name, 'quantity', p_quantity, 'requested_by', v_person),
    nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_build_object('name', v_name)
  );
  return p_id;
end;
$$;

create or replace function public.update_supply_request(
  p_id uuid,
  p_event_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.supply_requests%rowtype;
  v_item uuid;
  v_name text;
begin
  select * into v_row from public.supply_requests where id = p_id;
  if not found then
    raise exception 'That request was not found.';
  end if;
  if not (
    public.has_org_permission(v_row.organization_id, 'inventory.manage')
    or public.has_org_permission(v_row.organization_id, 'inventory.edit')
  ) then
    raise exception 'You cannot update the shopping list.';
  end if;
  if p_status not in ('ordered', 'fulfilled', 'closed') then
    raise exception 'Choose ordered, received, or dismissed.';
  end if;
  if v_row.status in ('fulfilled', 'closed') then
    raise exception 'That request is already finished.';
  end if;
  v_name := coalesce(v_row.item_name, 'Item');
  if p_status = 'fulfilled' then
    v_item := v_row.consumable_id;
    if v_item is null then
      v_item := gen_random_uuid();
      perform public.save_consumable(
        v_item, gen_random_uuid(), v_row.organization_id,
        jsonb_build_object('name', v_name, 'unit', 'each', 'reorder_point', 0, 'reorder_quantity', 0, 'active', true)
      );
      update public.supply_requests set consumable_id = v_item where id = p_id;
    end if;
    perform public.adjust_consumable_stock(
      v_item, gen_random_uuid(), 'receive', coalesce(v_row.quantity, 0),
      'Received from shopping list', null
    );
  end if;
  update public.supply_requests set status = p_status, updated_at = now() where id = p_id;
  perform public.write_event(
    p_event_id, v_row.organization_id, 'supply_request', p_id, 'updated',
    jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', p_status),
    null,
    jsonb_build_object('name', v_name)
  );
  return jsonb_build_object('status', p_status, 'name', v_name, 'organization_id', v_row.organization_id);
end;
$$;

drop policy if exists supply_requests_select on public.supply_requests;
create policy supply_requests_select on public.supply_requests
  for select to authenticated using (
    public.has_org_permission(organization_id, 'inventory.view')
    or public.has_org_permission(organization_id, 'inventory.edit')
    or public.has_org_permission(organization_id, 'inventory.manage')
    or public.has_org_permission(organization_id, 'kiosk.request')
  );

drop policy if exists request_files_storage_write on storage.objects;
create policy request_files_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'asset-files'
    and (storage.foldername(name))[2] = 'requests'
    and (
      public.has_org_permission(((storage.foldername(name))[1])::uuid, 'kiosk.request')
      or public.has_org_permission(((storage.foldername(name))[1])::uuid, 'inventory.edit')
    )
  );

grant execute on function public.kiosk_take(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.set_role_extra_permission(uuid, uuid, uuid, text, boolean) to authenticated;
create or replace function public.create_kiosk_item(
  p_id uuid,
  p_event_id uuid,
  p_organization_id uuid,
  p_name text,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.has_org_permission(p_organization_id, 'kiosk.create_item') then
    raise exception 'This kiosk cannot create inventory items.';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'Enter the item name.';
  end if;
  insert into public.consumables (
    id, organization_id, name, unit, quantity_on_hand, minimum_quantity, reorder_quantity, notes, active, bin_code
  ) values (
    p_id, p_organization_id, v_name, 'each', 0, 0, 0, nullif(btrim(coalesce(p_note, '')), ''), true, public.next_bin_code(p_organization_id)
  );
  perform public.write_event(
    p_event_id, p_organization_id, 'consumable', p_id, 'created',
    null, jsonb_build_object('name', v_name), null, jsonb_build_object('name', v_name)
  );
  return p_id;
end;
$$;

grant execute on function public.create_kiosk_item(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.submit_supply_request(uuid, uuid, uuid, text, numeric, text, text) to authenticated;
grant execute on function public.update_supply_request(uuid, uuid, text) to authenticated;
grant select on public.supply_requests to authenticated;
