"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { saveLocationRecord } from "@/lib/data";
import type { LocationRecord } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function LocationManager({
  organizationId,
  locations,
  canManage,
}: {
  organizationId: string;
  locations: LocationRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<LocationRecord | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = locations.filter((location) => showArchived || !location.archived_at);

  async function save(event: FormEvent, location?: LocationRecord, archived = false) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    try {
      await saveLocationRecord(supabase, organizationId, {
        id: location?.id,
        name: location && archived ? location.name : editing?.name ?? name,
        notes: location && archived ? (location.notes ?? "") : editing?.notes ?? notes,
        archived,
      });
      setName("");
      setNotes("");
      setEditing(null);
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  return (
    <div className="grid gap-4">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        Show archived
      </label>
      <ul className="grid gap-2">
        {visible.map((location) => (
          <li key={location.id} className="rounded-2xl bg-card px-4 py-3">
            {editing?.id === location.id ? (
              <form className="grid gap-3" onSubmit={(event) => void save(event, location)}>
                <Field label="Name"><TextInput value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></Field>
                <Field label="Notes"><TextInput value={editing.notes ?? ""} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></Field>
                <Button type="submit">Save location</Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {location.name}
                  {location.archived_at ? <span className="ml-2 text-sm text-muted">Archived</span> : null}
                </span>
                {canManage ? (
                  <span className="flex gap-2">
                    <button type="button" className="text-sm underline" onClick={() => setEditing(location)}>Edit</button>
                    <button type="button" className="text-sm underline" onClick={(event) => void save(event, location, !location.archived_at)}>
                      {location.archived_at ? "Restore" : "Archive"}
                    </button>
                  </span>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form className="grid gap-3" onSubmit={(event) => void save(event)}>
          <Field label="New location" hint="Shop, yard, job site, storeroom, office, or a vehicle.">
            <TextInput required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Button type="submit">Add location</Button>
        </form>
      ) : (
        <p className="text-sm text-muted">Only a super user can edit locations.</p>
      )}
    </div>
  );
}
