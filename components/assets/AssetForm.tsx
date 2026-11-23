"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { fieldsFor } from "@/lib/assets/fields";
import { ASSET_TYPES, type AssetInput, type AssetType } from "@/lib/assets/types";
import { createAsset, updateAsset } from "@/lib/data";
import type { LocationRecord } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type ParentOption = { id: string; name: string; tag_id: string };

export function AssetForm({
  organizationId,
  assetId,
  initial,
  locations,
  parents,
}: {
  organizationId: string;
  assetId?: string;
  initial: AssetInput;
  locations: LocationRecord[];
  parents: ParentOption[];
}) {
  const router = useRouter();
  const [input, setInput] = useState<AssetInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fields = useMemo(() => fieldsFor(input.type), [input.type]);

  function patch(partial: Partial<AssetInput>) {
    setInput((current) => ({ ...current, ...partial }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    try {
      const saved = assetId
        ? await updateAsset(supabase, assetId, input)
        : await createAsset(supabase, organizationId, input);
      router.push(`/assets/${saved.id}`);
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Field label="Name">
        <TextInput required value={input.name} onChange={(event) => patch({ name: event.target.value })} />
      </Field>
      <Field label="Type">
        <select
          required
          value={input.type}
          onChange={(event) => patch({ type: event.target.value as AssetType, customFields: {} })}
          className="min-h-12 w-full rounded-2xl border border-line bg-card px-3"
        >
          {ASSET_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tag" hint="Leave blank to assign the next tag, such as AT-1001. Or type a tag that is already on the item.">
        <TextInput value={input.tagId} onChange={(event) => patch({ tagId: event.target.value })} className="font-mono" />
      </Field>
      <details className="rounded-2xl border border-line bg-card p-4" open={Boolean(assetId)}>
        <summary className="cursor-pointer text-base font-medium">More details</summary>
        <div className="mt-4 grid gap-4">
          <Field label="Location">
            <select
              value={input.locationId ?? ""}
              onChange={(event) => patch({ locationId: event.target.value || null })}
              className="min-h-12 w-full rounded-2xl border border-line bg-paper px-3"
            >
              <option value="">No location yet</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand"><TextInput value={input.brand} onChange={(event) => patch({ brand: event.target.value })} /></Field>
            <Field label="Model"><TextInput value={input.model} onChange={(event) => patch({ model: event.target.value })} /></Field>
            <Field label="Serial"><TextInput value={input.serial} onChange={(event) => patch({ serial: event.target.value })} /></Field>
            <Field label="Vendor"><TextInput value={input.vendor} onChange={(event) => patch({ vendor: event.target.value })} /></Field>
            <Field label="Purchase date">
              <TextInput type="date" value={input.purchaseDate} onChange={(event) => patch({ purchaseDate: event.target.value })} />
            </Field>
            <Field label="Cost">
              <TextInput inputMode="decimal" value={input.cost} onChange={(event) => patch({ cost: event.target.value })} />
            </Field>
          </div>
          <Field label="Group" hint="Optional label such as Field kit, shop, or office.">
            <TextInput value={input.groupLabel} onChange={(event) => patch({ groupLabel: event.target.value })} />
          </Field>
          <Field label="Part of">
            <select
              value={input.parentAssetId ?? ""}
              onChange={(event) => patch({ parentAssetId: event.target.value || null })}
              className="min-h-12 w-full rounded-2xl border border-line bg-paper px-3"
            >
              <option value="">Not part of a kit</option>
              {parents.filter((parent) => parent.id !== assetId).map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name} ({parent.tag_id})
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={input.checkoutAsUnit}
              onChange={(event) => patch({ checkoutAsUnit: event.target.checked })}
            />
            <span>Check out as a unit. Checking out this item also checks out the pieces attached to it.</span>
          </label>
          {fields.map((field) => (
            <Field key={field.key} label={field.label}>
              <TextInput
                type={field.kind === "date" ? "date" : "text"}
                value={input.customFields[field.key] ?? ""}
                onChange={(event) =>
                  patch({ customFields: { ...input.customFields, [field.key]: event.target.value } })
                }
              />
            </Field>
          ))}
          <Field label="Notes">
            <textarea
              value={input.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              className="min-h-28 w-full rounded-2xl border border-line bg-paper px-3 py-3"
            />
          </Field>
        </div>
      </details>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Button type="submit" disabled={pending}>
        {assetId ? "Save changes" : "Add asset"}
      </Button>
    </form>
  );
}
