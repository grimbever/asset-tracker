-- Records an emailed invite in the history log.
-- Safe to run again. It does not erase equipment, people, or invites.

create or replace function public.log_invite_sent(
  p_invite_id uuid,
  p_event_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_role text;
  v_org text;
begin
  if p_invite_id is null or p_event_id is null then
    raise exception 'Invite id and event id are required';
  end if;
  select * into v_invite from public.invites where id = p_invite_id;
  if not found then
    raise exception 'That invite was not found.';
  end if;
  if not public.has_org_permission(v_invite.organization_id, 'org.manage') then
    raise exception 'You cannot invite people.';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite was already accepted.';
  end if;
  select r.name into v_role from public.roles r where r.id = v_invite.role_id;
  select o.name into v_org from public.organizations o where o.id = v_invite.organization_id;
  perform public.write_event(
    p_event_id,
    v_invite.organization_id,
    'invite',
    v_invite.id,
    'invite_sent',
    null,
    null,
    'Invite emailed to ' || v_invite.email,
    jsonb_build_object(
      'name', v_invite.email,
      'email', v_invite.email,
      'role', coalesce(v_role, ''),
      'organization', coalesce(v_org, ''),
      'expires_at', v_invite.expires_at
    )
  );
end;
$$;

revoke all on function public.log_invite_sent(uuid, uuid) from public, anon;
grant execute on function public.log_invite_sent(uuid, uuid) to authenticated;
