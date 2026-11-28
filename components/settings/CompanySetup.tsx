"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReminderSettings } from "@/components/subscriptions/ReminderSettings";
import { WarrantyAlertSettings } from "@/components/settings/WarrantyAlertSettings";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import type { CompanyForm, CompanyRole } from "@/lib/company/data";
import { copyRole, saveCompanySettings, saveRoleActive, saveRoleExtra, saveRoleModule, saveRoleName } from "@/lib/company/data";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ACCESS_MODULES,
  DATE_FORMATS,
  inferLevel,
  levelLabel,
  normalizeCompanySettings,
  previewRoleChange,
  type AccessLevel,
} from "@/lib/company/matrix";
import { TIMEZONES } from "@/lib/config";
import { messageFrom } from "@/lib/data/errors";
import { LABEL_TEMPLATES } from "@/lib/labels/templates";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const ROLE_ORDER = ["admin", "manager", "editor", "requester", "viewer", "kiosk", "field_tech", "auditor"];

export function CompanySetup({
  organizationId,
  settings,
  roles,
  assignedRoleIds,
  pendingRoleIds,
  actorRoleId,
  reminderDays,
}: {
  organizationId: string;
  settings: CompanyForm;
  roles: CompanyRole[];
  assignedRoleIds: string[];
  pendingRoleIds: string[];
  actorRoleId: string;
  reminderDays: number[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copyName, setCopyName] = useState("");
  const [copyFrom, setCopyFrom] = useState(roles[0]?.id ?? "");
  const ordered = [...roles].sort((left, right) => {
    const leftIndex = ROLE_ORDER.indexOf(left.key);
    const rightIndex = ROLE_ORDER.indexOf(right.key);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex) || left.name.localeCompare(right.name);
  });

  function patch<K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function run(work: (supabase: NonNullable<ReturnType<typeof getBrowserSupabase>>) => Promise<void>) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await work(supabase);
      setMessage("Saved.");
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setPending(false);
    }
  }

  async function saveSettings() {
    const parsed = normalizeCompanySettings(form);
    if (!parsed.ok) {
      setError(parsed.error);
      setMessage(null);
      return;
    }
    const next = { ...form, ...parsed.value, name: form.name.trim(), timezone: form.timezone, approverRoleId: form.approverRoleId };
    setForm(next);
    await run((supabase) => saveCompanySettings(supabase, organizationId, next));
  }

  function guard(role: CompanyRole, nextPermissions?: string[], nextActive?: boolean) {
    return previewRoleChange({
      roles: roles.map((item) => ({ id: item.id, active: item.active, permissions: item.permissions })),
      actorRoleId,
      roleId: role.id,
      nextPermissions,
      nextActive,
      assigned: assignedRoleIds.includes(role.id),
      pendingInvites: pendingRoleIds.includes(role.id),
    });
  }

  return (
    <div className="grid gap-8">
      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Company</h2>
        <Field label="Name">
          <TextInput value={form.name} onChange={(event) => patch("name", event.target.value)} />
        </Field>
        <Field label="Time zone">
          <select value={form.timezone} onChange={(event) => patch("timezone", event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
            {TIMEZONES.includes(form.timezone as (typeof TIMEZONES)[number]) ? null : <option value={form.timezone}>{form.timezone}</option>}
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>
        </Field>
        <Field label="Date format">
          <select value={form.dateFormat} onChange={(event) => patch("dateFormat", event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
            {DATE_FORMATS.map((format) => (
              <option key={format.id} value={format.id}>{format.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Accent color" hint="Used on the sidebar and in notification email.">
          <input type="color" value={form.accentColor} onChange={(event) => patch("accentColor", event.target.value)} className="h-12 w-20 rounded-xl border border-line bg-card" aria-label="Accent color" />
        </Field>
        <Field label="Logo address" hint="Optional https link. Shown in the sidebar.">
          <TextInput value={form.logoUrl} onChange={(event) => patch("logoUrl", event.target.value)} placeholder="https://" />
        </Field>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Tags, labels, and check out</h2>
        <Field label="Tag prefix" hint="New tags look like AT-1001. Existing tags stay as they are.">
          <TextInput value={form.tagPrefix} onChange={(event) => patch("tagPrefix", event.target.value.toUpperCase())} />
        </Field>
        <Field label="Default label">
          <select value={form.labelTemplate} onChange={(event) => patch("labelTemplate", event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
            {LABEL_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Default check-out length" hint="0 leaves the due date blank, which is the current behavior.">
          <TextInput type="number" min={0} max={365} value={String(form.defaultCheckoutDays)} onChange={(event) => patch("defaultCheckoutDays", Number(event.target.value))} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.checkoutDueRequired} onChange={(event) => patch("checkoutDueRequired", event.target.checked)} />
          Require a due date on check out
        </label>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Notifications</h2>
        <Field label="Extra recipients" hint="Leave blank to email organization admins, as today.">
          <TextInput value={form.notifyEmails} onChange={(event) => patch("notifyEmails", event.target.value)} placeholder="shop@example.com" />
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notifyCheckout} onChange={(event) => patch("notifyCheckout", event.target.checked)} /> Email on check out</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notifyCheckin} onChange={(event) => patch("notifyCheckin", event.target.checked)} /> Email on check in</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notifyStatus} onChange={(event) => patch("notifyStatus", event.target.checked)} /> Email on flagged status changes</label>
        <ReminderSettings organizationId={organizationId} days={reminderDays} />
        <WarrantyAlertSettings organizationId={organizationId} />
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Thresholds and rules</h2>
        <Field label="Low-stock threshold">
          <TextInput type="number" min={0} value={String(form.lowStockThreshold)} onChange={(event) => patch("lowStockThreshold", Number(event.target.value))} />
        </Field>
        <Field label="Maintenance reminder, days">
          <TextInput type="number" min={0} max={365} value={String(form.maintenanceReminderDays)} onChange={(event) => patch("maintenanceReminderDays", Number(event.target.value))} />
        </Field>
        <Field label="Upcoming windows" hint="Up to four day counts, shortest first. 7, 30, 90, 180 is the default.">
          <TextInput
            value={form.upcomingDays.join(", ")}
            onChange={(event) => patch("upcomingDays", event.target.value.split(/[^0-9]+/).filter(Boolean).map((day) => Number(day)))}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requireNoteBroken} onChange={(event) => patch("requireNoteBroken", event.target.checked)} /> Require a note when marking Broken</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requireNoteMissing} onChange={(event) => patch("requireNoteMissing", event.target.checked)} /> Require a note when marking Missing</label>
        <Field label="Who can approve" hint="This role keeps approval access. Other roles that already approve are left as they are.">
          <select value={form.approverRoleId} onChange={(event) => patch("approverRoleId", event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
            <option value="">No default</option>
            {ordered.filter((role) => role.active).map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Invite link lasts, days">
          <TextInput type="number" min={1} max={90} value={String(form.inviteExpiryDays)} onChange={(event) => patch("inviteExpiryDays", Number(event.target.value))} />
        </Field>
        <Button type="button" disabled={pending} onClick={() => void saveSettings()}>Save company settings</Button>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Roles</h2>
        <p className="text-sm text-muted">The internal key stays the same when you rename a role. Field Tech and Auditor start off. Turn one on when you are ready to assign it. A role that is assigned to someone, or has an open invite, cannot be turned off.</p>
        <ul className="grid gap-3">
          {ordered.map((role) => (
            <li key={role.id} className="grid gap-2 rounded-3xl bg-card p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Name">
                  <TextInput defaultValue={role.name} id={`role-name-${role.id}`} />
                </Field>
                <Field label="Description">
                  <TextInput defaultValue={role.description} id={`role-description-${role.id}`} />
                </Field>
              </div>
              <p className="text-xs text-muted">Key {role.key}{role.active ? "" : " · off"}{role.key === "kiosk" ? " · sign the tablet in with this role" : ""}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" disabled={pending} onClick={() => {
                  const name = (document.getElementById(`role-name-${role.id}`) as HTMLInputElement | null)?.value ?? role.name;
                  const description = (document.getElementById(`role-description-${role.id}`) as HTMLInputElement | null)?.value ?? role.description;
                  void run((supabase) => saveRoleName(supabase, organizationId, role.id, name, description));
                }}>Save name</Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => {
                  const blocked = guard(role, undefined, !role.active);
                  if (blocked) {
                    setError(blocked);
                    return;
                  }
                  void run((supabase) => saveRoleActive(supabase, organizationId, role.id, !role.active));
                }}>{role.active ? "Turn off" : "Turn on"}</Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 rounded-3xl border border-line p-4">
          <h3 className="font-medium">New role</h3>
          <Field label="Copy from">
            <select value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
              {ordered.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <TextInput value={copyName} onChange={(event) => setCopyName(event.target.value)} />
          </Field>
          <Button type="button" disabled={pending || !copyFrom} onClick={() => void run(async (supabase) => {
            await copyRole(supabase, organizationId, copyFrom, copyName);
            setCopyName("");
          })}>Create role</Button>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Permissions</h2>
        <p className="text-sm text-muted">None, View, Edit, or Manage. License keys follow Subscriptions Manage. Kiosk and work orders stay off until those screens exist. Your own role has to keep company setup.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr>
                <th className="px-2 text-left font-medium">Area</th>
                {ordered.map((role) => (
                  <th key={role.id} className="px-2 text-left font-medium">{role.name}{role.active ? "" : " (off)"}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACCESS_MODULES.map((module) => (
                <tr key={module.id} className={module.enabled ? "" : "text-muted"}>
                  <th className="px-2 text-left font-medium">
                    {module.label}
                    <span className="mt-1 block text-xs font-normal text-muted">{module.hint}</span>
                  </th>
                  {ordered.map((role) => {
                    const level = inferLevel(role.permissions, module);
                    return (
                      <td key={role.id} className="px-2">
                        <select
                          aria-label={`${module.label} for ${role.name}`}
                          disabled={!module.enabled || pending}
                          value={level}
                          className="min-h-11 rounded-xl border border-line bg-card px-2 disabled:opacity-60"
                          onChange={(event) => {
                            const nextLevel = event.target.value as AccessLevel;
                            const blocked = guard(role);
                            if (module.id === "settings" && nextLevel === "none" && role.id === actorRoleId) {
                              setError("You cannot remove your own access to company setup.");
                              return;
                            }
                            if (blocked && module.id === "settings" && nextLevel === "none") {
                              setError(blocked);
                              return;
                            }
                            void run((supabase) => saveRoleModule(supabase, organizationId, role.id, module.id, nextLevel));
                          }}
                        >
                          {module.levels.map((choice) => (
                            <option key={choice} value={choice}>{levelLabel(choice)}</option>
                          ))}
                        </select>
                        {module.id === "kiosk" ? (
                          <div className="mt-2 grid gap-1 text-xs">
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={role.permissions.includes(PERMISSIONS.kioskRequest)}
                                onChange={(event) => void run((supabase) => saveRoleExtra(supabase, organizationId, role.id, PERMISSIONS.kioskRequest, event.target.checked))}
                              />
                              Can request items
                            </label>
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={role.permissions.includes(PERMISSIONS.kioskCreateItem)}
                                onChange={(event) => void run((supabase) => saveRoleExtra(supabase, organizationId, role.id, PERMISSIONS.kioskCreateItem, event.target.checked))}
                              />
                              Can create items
                            </label>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
