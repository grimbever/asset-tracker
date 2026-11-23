"use client";

import { useState, type FormEvent } from "react";
import { selectOrganization } from "@/app/actions";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { DEFAULT_TIMEZONE, TIMEZONES } from "@/lib/config";
import { createOrganization } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function CreateOrgForm({ additional = false }: { additional?: boolean }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    let id = "";
    try {
      id = await createOrganization(supabase, { name, timezone, additional });
    } catch (caught) {
      setError(messageFrom(caught));
      setPending(false);
      return;
    }
    const data = new FormData();
    data.set("organizationId", id);
    await selectOrganization(data);
  }

  return (
    <form className="grid max-w-md gap-4" onSubmit={(event) => void submit(event)}>
      <Field label="Organization name">
        <TextInput required value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Timezone">
        <select
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          className="min-h-12 w-full rounded-2xl border border-line bg-card px-3"
        >
          {TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </Field>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Button type="submit" disabled={pending}>
        {additional ? "Add organization" : "Create organization"}
      </Button>
    </form>
  );
}
