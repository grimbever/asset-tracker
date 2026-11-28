"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deliverLowStockAlert } from "@/app/notify/low-stock";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { adjustStock, saveConsumableRecord, type Consumable, type StockAdjustment } from "@/lib/inventory/data";
import { isLowStock, type StockMove } from "@/lib/inventory/stock";
import { messageFrom } from "@/lib/data/errors";
import { saveLabelJob } from "@/lib/labels/job";
import { DEFAULT_TEMPLATE_ID } from "@/lib/labels/templates";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const MOVES: { id: StockMove; label: string }[] = [
  { id: "receive", label: "Receive" },
  { id: "use", label: "Use" },
  { id: "correction", label: "Count correction" },
];

export function InventoryDetail({
  item,
  locationName,
  history,
  canEdit,
}: {
  item: Consumable;
  locationName: string | null;
  history: StockAdjustment[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [move, setMove] = useState<StockMove>("receive");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const low = isLowStock(item.quantity_on_hand, item.minimum_quantity);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    try {
      const result = await adjustStock(supabase, item.id, move, Number(quantity), reason);
      if (result.crossed) await deliverLowStockAlert({ organizationId: result.organization_id, name: result.name });
      setQuantity("");
      setReason("");
      setMessage("Stock updated.");
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <div>
        <p className="text-sm text-muted">{item.bin_code}{locationName ? ` · ${locationName}` : ""}</p>
        <h1 className="font-serif text-4xl tracking-tight">{item.name}</h1>
        <p className="mt-2 text-lg">{item.quantity_on_hand} {item.unit}{low ? " · Low stock" : ""}</p>
        <p className="mt-1 text-sm text-muted">Reorder at {item.minimum_quantity}. Order {item.reorder_quantity}. {item.vendor ? `Vendor ${item.vendor}.` : ""}</p>
        {item.notes ? <p className="mt-2 text-sm">{item.notes}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {canEdit ? <Link href={`/inventory/${item.id}/edit`} className="inline-flex min-h-12 items-center rounded-full bg-card px-4">Edit</Link> : null}
          <button type="button" className="inline-flex min-h-12 items-center rounded-full bg-card px-4" onClick={() => {
            saveLabelJob({
              templateId: DEFAULT_TEMPLATE_ID,
              showType: true,
              showLocation: true,
              customWidth: 2,
              customHeight: 1,
              labels: [{ tagId: item.bin_code ?? item.id, name: item.name, typeLabel: item.category ?? item.unit, location: locationName }],
            });
            router.push("/labels/print");
          }}>Print bin label</button>
          {canEdit ? <Button variant="ghost" onClick={() => {
            const supabase = getBrowserSupabase();
            if (!supabase) return;
            void saveConsumableRecord(supabase, item.organization_id, item.id, {
              name: item.name, category: item.category, unit: item.unit, sku: item.sku, location_id: item.location_id,
              reorder_point: item.minimum_quantity, reorder_quantity: item.reorder_quantity, vendor: item.vendor,
              unit_cost: item.unit_cost, notes: item.notes, active: item.active, archived: !item.archived_at,
            }).then(() => router.refresh());
          }}>{item.archived_at ? "Restore" : "Archive"}</Button> : null}
        </div>
      </div>
      {canEdit ? (
        <form className="grid gap-3 rounded-3xl bg-card p-4" onSubmit={(event) => void submit(event)}>
          <h2 className="font-serif text-2xl">Adjust stock</h2>
          <div className="flex flex-wrap gap-2">
            {MOVES.map((choice) => (
              <button key={choice.id} type="button" className={`min-h-12 rounded-full px-4 ${move === choice.id ? "bg-ink text-paper" : "bg-paper"}`} onClick={() => setMove(choice.id)}>{choice.label}</button>
            ))}
          </div>
          <Field label={move === "correction" ? "Counted quantity" : "Quantity"}><TextInput type="number" min={0} step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
          <Field label="Reason"><TextInput value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          <Button type="submit" disabled={pending}>Save adjustment</Button>
        </form>
      ) : null}
      <section className="grid gap-2">
        <h2 className="font-serif text-2xl">Stock history</h2>
        {history.length === 0 ? <p className="text-sm text-muted">No adjustments yet.</p> : null}
        <ul className="grid gap-2">
          {history.map((entry) => (
            <li key={entry.id} className="rounded-2xl bg-card px-4 py-3 text-sm">
              <span className="font-medium">{entry.kind}</span> {Number(entry.quantity_delta) > 0 ? "+" : ""}{entry.quantity_delta}
              {entry.notes ? <span className="mt-1 block text-muted">{entry.notes}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
