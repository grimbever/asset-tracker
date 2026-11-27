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
  for select to authenticated using (
    public.has_org_permission(organization_id, 'subscriptions.view')
    or public.has_org_permission(organization_id, 'subscriptions.manage')
  );

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
