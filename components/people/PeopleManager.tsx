"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { saveEmployeeRecord } from "@/lib/data";
import type { EmployeeRecord } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const empty = { name: "", title: "", email: "", phone: "", hireDate: "", leavingDate: "", notes: "" };

export function PeopleManager({
  organizationId,
  people,
  canManage,
}: {
  organizationId: string;
  people: EmployeeRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);

  const visible = people.filter((person) => showArchived || !person.archived_at);

  async function save(event: FormEvent, id?: string, archived = false) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const person = id ? people.find((item) => item.id === id) : null;
    try {
      await saveEmployeeRecord(supabase, organizationId, {
        id,
        name: person && archived ? person.name : draft.name,
        title: person && archived ? (person.title ?? "") : draft.title,
        email: person && archived ? (person.email ?? "") : draft.email,
        phone: person && archived ? (person.phone ?? "") : draft.phone,
        hireDate: person && archived ? (person.hire_date ?? "") : draft.hireDate,
        leavingDate: person && archived ? (person.termination_date ?? "") : draft.leavingDate,
        notes: person && archived ? (person.notes ?? "") : draft.notes,
        active: archived ? false : true,
        archived,
      });
      setDraft(empty);
      setEditing(null);
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  return (
    <div className="grid gap-6">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        Show archived
      </label>
      <ul className="grid gap-3">
        {visible.map((person) => (
          <li key={person.id} className="rounded-2xl bg-card p-4">
            {editing === person.id && canManage ? (
              <PersonForm
                value={{
                  name: person.name,
                  title: person.title ?? "",
                  email: person.email ?? "",
                  phone: person.phone ?? "",
                  hireDate: person.hire_date ?? "",
                  leavingDate: person.termination_date ?? "",
                  notes: person.notes ?? "",
                }}
                onChange={setDraft}
                onSubmit={(event) => void save(event, person.id)}
                submitLabel="Save person"
              />
            ) : (
              <>
                <p className="font-medium">{person.name}</p>
                <p className="text-sm text-muted">
                  {[person.title, person.archived_at ? "Archived" : person.active ? "Active" : "Inactive", person.email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-sm text-muted">
                  {person.hire_date ? `Hired ${person.hire_date}` : "No hire date"}
                  {person.termination_date ? ` · Leaving ${person.termination_date}` : ""}
                </p>
                <Link className="mt-2 inline-block text-sm underline" href={`/history?type=employee&id=${person.id}`}>History</Link>
                {canManage ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditing(person.id);
                        setDraft({
                          name: person.name,
                          title: person.title ?? "",
                          email: person.email ?? "",
                          phone: person.phone ?? "",
                          hireDate: person.hire_date ?? "",
                          leavingDate: person.termination_date ?? "",
                          notes: person.notes ?? "",
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button type="button" variant="ghost" onClick={(event) => void save(event, person.id, !person.archived_at)}>
                      {person.archived_at ? "Restore" : "Archive"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {canManage && !editing ? (
        <form className="grid gap-3 rounded-3xl border border-line p-4" onSubmit={(event) => void save(event)}>
          <h2 className="font-serif text-2xl">Add a person</h2>
          <PersonForm value={draft} onChange={setDraft} submitLabel="Save person" />
        </form>
      ) : canManage ? null : (
        <p className="text-sm text-muted">Only a super user can edit people. That permission is settings.manage, and Admins have it.</p>
      )}
    </div>
  );
}

function PersonForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
}: {
  value: typeof empty;
  onChange: (value: typeof empty) => void;
  onSubmit?: (event: FormEvent) => void;
  submitLabel: string;
}) {
  const fields = (
    <div className="grid gap-3">
      <Field label="Name"><TextInput required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></Field>
      <Field label="Title"><TextInput value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} /></Field>
      <Field label="Email"><TextInput type="email" value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })} /></Field>
      <Field label="Phone"><TextInput value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} /></Field>
      <Field label="Hire date"><TextInput type="date" value={value.hireDate} onChange={(event) => onChange({ ...value, hireDate: event.target.value })} /></Field>
      <Field label="Leaving date"><TextInput type="date" value={value.leavingDate} onChange={(event) => onChange({ ...value, leavingDate: event.target.value })} /></Field>
      <Field label="Notes"><TextInput value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} /></Field>
      <Button type="submit">{submitLabel}</Button>
    </div>
  );
  if (!onSubmit) return fields;
  return <form className="grid gap-3" onSubmit={onSubmit}>{fields}</form>;
}
