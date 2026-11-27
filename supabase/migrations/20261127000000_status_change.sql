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
