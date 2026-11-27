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

grant execute on function public.search_events(uuid, text, text, uuid, text, timestamptz, timestamptz) to authenticated;
