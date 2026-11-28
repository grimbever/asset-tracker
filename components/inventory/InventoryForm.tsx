"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { saveConsumableRecord, type Consumable } from "@/lib/inventory/data";
import { STOCK_UNITS } from "@/lib/inventory/stock";
import { messageFrom } from "@/lib/data/errors";
import { newId } from "@/lib/ids";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function InventoryForm({
  organizationId,
  item,
  locations,
}: {
  organizationId: string;
  item?: Consumable;
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "each");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [locationId, setLocationId] = useState(item?.location_id ?? "");
  const [reorderPoint, setReorderPoint] = useState(String(item?.minimum_quantity ?? 0));
  const [reorderQuantity, setReorderQuantity] = useState(String(item?.reorder_quantity ?? 0));
  const [vendor, setVendor] = useState(item?.vendor ?? "");
  const [unitCost, setUnitCost] = useState(item?.unit_cost === null || item?.unit_cost === undefined ? "" : String(item.unit_cost));
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [active, setActive] = useState(item?.active ?? true);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    try {
      const id = item?.id ?? newId();
      await saveConsumableRecord(supabase, organizationId, id, {
        name, category, unit, sku, location_id: locationId, reorder_point: Number(reorderPoint || 0),
        reorder_quantity: Number(reorderQuantity || 0), vendor, unit_cost: unitCost, notes, active,
      });
      router.push(`/inventory/${id}`);
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void save(event)}>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Field label="Name"><TextInput required value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Category"><TextInput value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Snacks, paper, drinks" /></Field>
      <Field label="Unit">
        <select value={unit} onChange={(event) => setUnit(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
          {STOCK_UNITS.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        </select>
      </Field>
      <Field label="SKU or barcode"><TextInput value={sku} onChange={(event) => setSku(event.target.value)} /></Field>
      <Field label="Location">
        <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3">
          <option value="">None</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </Field>
      <Field label="Reorder point"><TextInput type="number" min={0} value={reorderPoint} onChange={(event) => setReorderPoint(event.target.value)} /></Field>
      <Field label="Reorder quantity"><TextInput type="number" min={0} value={reorderQuantity} onChange={(event) => setReorderQuantity(event.target.value)} /></Field>
      <Field label="Preferred vendor"><TextInput value={vendor} onChange={(event) => setVendor(event.target.value)} /></Field>
      <Field label="Unit cost"><TextInput type="number" min={0} step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></Field>
      <Field label="Notes"><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label>
      <Button type="submit" disabled={pending}>Save item</Button>
    </form>
  );
}
