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
