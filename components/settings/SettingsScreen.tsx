"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { sendInviteEmail } from "@/app/invite/actions";
import { CreateOrgForm } from "@/components/shell/CreateOrgForm";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { APP_NAME, TIMEZONES } from "@/lib/config";
import { SEND_INVITE_BY_EMAIL_DEFAULT, inviteFeedback } from "@/lib/notify/invite";
import {
  createInvite,
  deleteInvite,
  removeMember,
  updateDisplayName,
  updateMemberRole,
  updateOrganization,
} from "@/lib/data";
import type { InviteRecord, MemberRecord, OrgRecord, RoleRecord } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function SettingsScreen({
  userId,
  email,
  displayName,
  organization,
  roles,
  members,
  invites,
  canManage,
  canSetup = false,
}: {
  userId: string;
  email: string;
  displayName: string;
  organization: OrgRecord;
  roles: RoleRecord[];
  members: MemberRecord[];
  invites: InviteRecord[];
  canManage: boolean;
  canSetup?: boolean;
}) {
  const [name, setName] = useState(displayName);
  const [orgName, setOrgName] = useState(organization.name);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendByEmail, setSendByEmail] = useState(SEND_INVITE_BY_EMAIL_DEFAULT);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState(roles.find((role) => role.assignable)?.id ?? "");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assignable = roles.filter((role) => role.assignable && role.active);
  const inactive = roles.filter((role) => !role.active);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    try {
      await updateDisplayName(supabase, userId, name);
      setMessage("Name saved.");
      setError(null);
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  async function saveOrg(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    try {
      await updateOrganization(supabase, organization.id, orgName, timezone);
      setMessage("Organization saved. Refresh if the header still shows the old name.");
      setError(null);
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  function showInviteFeedback(address: string, wantedEmail: boolean, result: Awaited<ReturnType<typeof sendInviteEmail>> | null, again = false) {
    const feedback = inviteFeedback({ email: address, wantedEmail, result, again });
    if (feedback.tone === "ok") {
      setMessage(feedback.text);
      setError(null);
    } else {
      setMessage(null);
      setError(feedback.text);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const address = inviteEmail.trim();
    try {
      const created = await createInvite(supabase, organization.id, address, roleId, userId);
      const link = `${window.location.origin}/invite/${created.token}`;
      setInvitedEmail(created.email || address);
      setInviteLink(link);
      setInviteEmail("");
      if (!sendByEmail) {
        showInviteFeedback(created.email || address, false, null);
        return;
      }
      const result = await sendInviteEmail(created.id, window.location.origin);
      showInviteFeedback(created.email || address, true, result);
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  async function resendInvite(inviteId: string, address: string) {
    setSendingId(inviteId);
    setMessage(null);
    setError(null);
    try {
      const result = await sendInviteEmail(inviteId, window.location.origin);
      showInviteFeedback(address, true, result, true);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setSendingId(null);
    }
  }

  const flags = Object.entries(organization.feature_flags);

  return (
    <div className="grid gap-8">
      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <form className="grid gap-3" onSubmit={(event) => void saveProfile(event)}>
        <h2 className="font-serif text-2xl">You</h2>
        <p className="text-sm text-muted">{email}</p>
        <Field label="Display name"><TextInput value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Button type="submit" variant="ink">Save name</Button>
      </form>

      <section className="grid gap-2 rounded-3xl bg-card p-4 text-sm">
        <h2 className="font-serif text-2xl">Plan</h2>
        <p>
          Stored plan: <strong>{organization.plan_id}</strong>. Up to {organization.max_items.toLocaleString()} items and{" "}
          {organization.max_users.toLocaleString()} users.
        </p>
        <p className="text-muted">
          These numbers are saved for later and are not enforced. Nothing on this screen bills anyone. New organizations start on the Internal plan so your own register is not blocked.
        </p>
        {flags.length ? (
          <ul className="mt-2 grid gap-1">
            {flags.map(([key, enabled]) => (
              <li key={key}>
                {key.replaceAll("_", " ")}: {enabled ? "on" : "off"}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {canSetup ? (
        <section className="rounded-3xl bg-card p-4">
          <h2 className="font-serif text-2xl">Company setup</h2>
          <p className="mt-2 text-sm text-muted">Roles, permissions, tags, notifications, and the other organization defaults.</p>
          <Link href="/settings/company" className="mt-3 inline-flex min-h-12 items-center rounded-full bg-ink px-4 text-white">Open company setup</Link>
        </section>
      ) : null}

      {canManage ? (
        <form className="grid gap-3" onSubmit={(event) => void saveOrg(event)}>
          <h2 className="font-serif text-2xl">Organization</h2>
          <Field label="Name"><TextInput value={orgName} onChange={(event) => setOrgName(event.target.value)} /></Field>
          <Field label="Timezone">
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
              {TIMEZONES.includes(timezone as (typeof TIMEZONES)[number]) ? null : <option value={timezone}>{timezone}</option>}
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </Field>
          <Button type="submit">Save organization</Button>
        </form>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Team</h2>
        <ul className="grid gap-2">
          {members.map((member) => (
            <li key={member.id} className="rounded-2xl bg-card px-4 py-3 text-sm">
              <p className="font-medium">{member.display_name}</p>
              <p className="text-muted">{member.email}</p>
              {canManage && member.user_id !== userId ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <select
                    defaultValue={member.role_id}
                    className="rounded-xl border border-line bg-paper px-2 py-2"
                    onChange={(event) => {
                      const supabase = getBrowserSupabase();
                      if (!supabase) return;
                      void updateMemberRole(supabase, member.id, event.target.value).catch((caught: unknown) =>
                        setError(messageFrom(caught)),
                      );
                    }}
                  >
                    {assignable.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => {
                      const supabase = getBrowserSupabase();
                      if (!supabase) return;
                      void removeMember(supabase, member.id)
                        .then(() => window.location.reload())
                        .catch((caught: unknown) => setError(messageFrom(caught)));
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p className="mt-1">{member.role_name}</p>
              )}
            </li>
          ))}
        </ul>
        {inactive.length ? (
          <p className="text-sm text-muted">
            Not available yet: {inactive.map((role) => role.name).join(", ")}. They are saved so they can be turned on later without a code change.
          </p>
        ) : null}
      </section>

      {canManage ? (
        <form className="grid gap-3" onSubmit={(event) => void invite(event)}>
          <h2 className="font-serif text-2xl">Invite by email</h2>
          <Field label="Email"><TextInput type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></Field>
          <Field label="Role">
            <select value={roleId} onChange={(event) => setRoleId(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
              {assignable.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendByEmail} onChange={(event) => setSendByEmail(event.target.checked)} />
            Send invite by email
          </label>
          <Button type="submit">Create invite</Button>
          {inviteLink ? (
            <div className="grid gap-2 rounded-2xl bg-paper-deep p-3 text-sm">
              <p>Copy this link if you want to send it yourself. It expires in 14 days and only works for the invited email.</p>
              <TextInput readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} aria-label="Invite link" />
              <a className="underline" href={`mailto:${invitedEmail}?subject=${encodeURIComponent(`Join ${organization.name} on ${APP_NAME}`)}&body=${encodeURIComponent(`Join ${organization.name}:\n${inviteLink}`)}`}>
                Open an email with this link
              </a>
            </div>
          ) : null}
          <ul className="grid gap-2 text-sm">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>{invite.email} · {invite.role_name}</span>
                <span className="flex gap-3">
                  <button type="button" className="underline" disabled={sendingId === invite.id} onClick={() => void resendInvite(invite.id, invite.email)}>
                    {sendingId === invite.id ? "Sending…" : "Resend invite"}
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      const supabase = getBrowserSupabase();
                      if (!supabase) return;
                      void deleteInvite(supabase, invite.id).then(() => window.location.reload());
                    }}
                  >
                    Revoke
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </form>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Another organization</h2>
        <p className="text-sm text-muted">Use a separate organization for a separate business, such as a shop and a field company.</p>
        <CreateOrgForm additional />
      </section>
    </div>
  );
}
