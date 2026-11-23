"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { createLocation, deleteLocation } from "@/lib/data";
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
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <ul className="grid gap-2">
        {locations.map((location) => (
          <li key={location.id} className="flex items-center justify-between rounded-2xl bg-card px-4 py-3">
            <span>{location.name}</span>
            {canManage ? (
              <button
                type="button"
                className="text-sm underline"
                onClick={() => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  void deleteLocation(supabase, location.id)
                    .then(() => router.refresh())
                    .catch(() => setError("That location is still used by an asset. Move the asset first."));
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const supabase = getBrowserSupabase();
            if (!supabase) return;
            void createLocation(supabase, organizationId, name, "")
              .then(() => {
                setName("");
                router.refresh();
              })
              .catch((caught: unknown) => setError(messageFrom(caught)));
          }}
        >
          <Field label="New location" hint="Shop, yard, job site, storeroom, office, or a vehicle. No default named 1.">
            <TextInput required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Button type="submit">Add location</Button>
        </form>
      ) : null}
    </div>
  );
}
