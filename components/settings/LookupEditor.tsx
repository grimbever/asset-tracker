"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { saveFieldRecord, saveNotificationEmails, saveStatusRecord, saveTypeRecord } from "@/lib/data";
import type { FieldDefinition, LookupRecord } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function LookupEditor({
  organizationId,
  statuses,
  types,
  fields,
  emails,
}: {
  organizationId: string;
  statuses: LookupRecord[];
  types: LookupRecord[];
  fields: FieldDefinition[];
  emails: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const [statusKey, setStatusKey] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [typeKey, setTypeKey] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState(types[0]?.key ?? "equipment");
  const [fieldKind, setFieldKind] = useState<"text" | "date">("text");
  const [recipientText, setRecipientText] = useState(emails.join("\n"));

  async function run(action: () => Promise<void>) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  const visibleStatuses = statuses.filter((item) => showArchived || !item.archived_at);
  const visibleTypes = types.filter((item) => showArchived || !item.archived_at);
  const visibleFields = fields.filter((item) => showArchived || !item.archived_at);

  return (
    <div className="grid gap-8">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        Show archived
      </label>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Statuses</h2>
        <ul className="grid gap-2">
          {visibleStatuses.map((status, index) => (
            <li key={status.id} className="rounded-2xl bg-card px-3 py-3 text-sm">
              <p className="font-medium">{status.label} <span className="font-mono text-xs text-muted">{status.key}</span></p>
              <p className="text-muted">
                {status.counts_as_available ? "Counts as available" : "Not available"}
                {status.needs_attention ? " · Needs attention" : ""}
                {status.notify ? " · Email on change" : ""}
                {status.archived_at ? " · Archived" : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="underline" onClick={() => void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  const swap = visibleStatuses[index - 1];
                  if (!swap) return;
                  await saveStatusRecord(supabase, organizationId, { ...status, position: swap.position });
                  await saveStatusRecord(supabase, organizationId, { ...swap, position: status.position });
                })}>Up</button>
                <button type="button" className="underline" onClick={() => void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  await saveStatusRecord(supabase, organizationId, { ...status, notify: !status.notify });
                })}>{status.notify ? "Stop email" : "Email"}</button>
                <button type="button" className="underline" onClick={() => void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  await saveStatusRecord(supabase, organizationId, { ...status, archived: !status.archived_at });
                })}>{status.archived_at ? "Restore" : "Archive"}</button>
              </div>
            </li>
          ))}
        </ul>
        <form className="grid gap-3" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const supabase = getBrowserSupabase();
            if (!supabase) return;
            await saveStatusRecord(supabase, organizationId, { key: statusKey, label: statusLabel, position: (statuses.at(-1)?.position ?? 0) + 10, notify: false, counts_as_available: false, needs_attention: false });
            setStatusKey("");
            setStatusLabel("");
          });
        }}>
          <Field label="New status name"><TextInput required value={statusLabel} onChange={(event) => setStatusLabel(event.target.value)} /></Field>
          <Field label="Key" hint="Short id, such as loaned_out. It cannot be changed later."><TextInput required value={statusKey} onChange={(event) => setStatusKey(event.target.value)} /></Field>
          <Button type="submit">Add status</Button>
        </form>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Types</h2>
        <ul className="grid gap-2">
          {visibleTypes.map((type, index) => (
            <li key={type.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-3 py-3 text-sm">
              <span>{type.label} <span className="font-mono text-xs text-muted">{type.key}</span>{type.archived_at ? " · Archived" : ""}</span>
              <span className="flex gap-2">
                <button type="button" className="underline" onClick={() => void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase || !visibleTypes[index - 1]) return;
                  const swap = visibleTypes[index - 1];
                  await saveTypeRecord(supabase, organizationId, { ...type, position: swap.position });
                  await saveTypeRecord(supabase, organizationId, { ...swap, position: type.position });
                })}>Up</button>
                <button type="button" className="underline" onClick={() => void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  await saveTypeRecord(supabase, organizationId, { ...type, archived: !type.archived_at });
                })}>{type.archived_at ? "Restore" : "Archive"}</button>
              </span>
            </li>
          ))}
        </ul>
        <form className="grid gap-3" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const supabase = getBrowserSupabase();
            if (!supabase) return;
            await saveTypeRecord(supabase, organizationId, { key: typeKey, label: typeLabel, position: (types.at(-1)?.position ?? 0) + 10 });
            setTypeKey("");
            setTypeLabel("");
          });
        }}>
          <Field label="New type name"><TextInput required value={typeLabel} onChange={(event) => setTypeLabel(event.target.value)} /></Field>
          <Field label="Key"><TextInput required value={typeKey} onChange={(event) => setTypeKey(event.target.value)} /></Field>
          <Button type="submit">Add type</Button>
        </form>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Custom fields</h2>
        <ul className="grid gap-2">
          {visibleFields.map((field) => (
            <li key={field.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-3 py-3 text-sm">
              <span>{field.label} <span className="text-muted">{field.type_key} · {field.kind}</span>{field.archived_at ? " · Archived" : ""}</span>
              <button type="button" className="underline" onClick={() => void run(async () => {
                const supabase = getBrowserSupabase();
                if (!supabase) return;
                await saveFieldRecord(supabase, organizationId, { ...field, archived: !field.archived_at });
              })}>{field.archived_at ? "Restore" : "Archive"}</button>
            </li>
          ))}
        </ul>
        <form className="grid gap-3" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const supabase = getBrowserSupabase();
            if (!supabase) return;
            await saveFieldRecord(supabase, organizationId, { key: fieldKey, label: fieldLabel, type_key: fieldType, kind: fieldKind, position: 100 });
            setFieldKey("");
            setFieldLabel("");
          });
        }}>
          <Field label="Field label"><TextInput required value={fieldLabel} onChange={(event) => setFieldLabel(event.target.value)} /></Field>
          <Field label="Key"><TextInput required value={fieldKey} onChange={(event) => setFieldKey(event.target.value)} /></Field>
          <Field label="Type">
            <select value={fieldType} onChange={(event) => setFieldType(event.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-card px-3">
              {types.filter((type) => !type.archived_at).map((type) => <option key={type.id} value={type.key}>{type.label}</option>)}
            </select>
          </Field>
          <Field label="Kind">
            <select value={fieldKind} onChange={(event) => setFieldKind(event.target.value as "text" | "date")} className="min-h-12 w-full rounded-2xl border border-line bg-card px-3">
              <option value="text">Text</option>
              <option value="date">Date</option>
            </select>
          </Field>
          <Button type="submit">Add field</Button>
        </form>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Notification emails</h2>
        <p className="text-sm text-muted">One address per line. Leave this blank to email organization admins. Check-out, check-in, and statuses marked “Email” send a message when Resend is configured.</p>
        <textarea value={recipientText} onChange={(event) => setRecipientText(event.target.value)} className="min-h-28 rounded-2xl border border-line bg-card px-3 py-3" />
        <Button onClick={() => void run(async () => {
          const supabase = getBrowserSupabase();
          if (!supabase) return;
          await saveNotificationEmails(supabase, organizationId, recipientText.split(/\n|,/).map((item) => item.trim()).filter(Boolean));
        })}>Save recipients</Button>
      </section>
    </div>
  );
}
