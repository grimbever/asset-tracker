"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TextInput } from "@/components/ui";
import { isLowStock } from "@/lib/inventory/stock";
import type { Consumable } from "@/lib/inventory/data";
import { saveLabelJob } from "@/lib/labels/job";
import { DEFAULT_TEMPLATE_ID } from "@/lib/labels/templates";

export function InventoryList({
  items,
  locationNames,
  canEdit,
  lowOnly,
}: {
  items: Consumable[];
  locationNames: Record<string, string>;
  canEdit: boolean;
  lowOnly: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))] as string[];
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.archived_at) return false;
      if (lowOnly && !isLowStock(item.quantity_on_hand, item.minimum_quantity)) return false;
      if (category !== "all" && item.category !== category) return false;
      if (locationId !== "all" && item.location_id !== locationId) return false;
      if (!needle) return true;
      return [item.name, item.sku, item.bin_code, item.vendor, item.category].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [items, query, category, locationId, lowOnly]);

  function printLabels() {
    saveLabelJob({
      templateId: DEFAULT_TEMPLATE_ID,
      showType: true,
      showLocation: true,
      customWidth: 2,
      customHeight: 1,
      labels: shown.map((item) => ({
        tagId: item.bin_code ?? item.id,
        name: item.name,
        typeLabel: item.category ?? item.unit,
        location: item.location_id ? locationNames[item.location_id] ?? null : null,
      })),
    });
    router.push("/labels/print");
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU, or bin" aria-label="Search inventory" />
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3" aria-label="Category">
          <option value="all">All categories</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-card px-3" aria-label="Location">
          <option value="all">All locations</option>
          {Object.entries(locationNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <Link href={lowOnly ? "/inventory" : "/inventory?low=1"} className={`inline-flex min-h-12 items-center rounded-full px-4 ${lowOnly ? "bg-ink text-paper" : "bg-card"}`}>
          Low stock
        </Link>
        <button type="button" className="inline-flex min-h-12 items-center rounded-full bg-card px-4" onClick={printLabels}>Print bin labels</button>
        {canEdit ? <Link href="/inventory/new" className="inline-flex min-h-12 items-center rounded-full bg-ember px-4 text-white">Add item</Link> : null}
      </div>
      <ul className="grid gap-2">
        {shown.map((item) => {
          const low = isLowStock(item.quantity_on_hand, item.minimum_quantity);
          return (
            <li key={item.id}>
              <Link href={`/inventory/${item.id}`} className="grid gap-1 rounded-3xl bg-card px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <span>
                  <span className="font-medium">{item.name}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {[item.category, item.bin_code, item.location_id ? locationNames[item.location_id] : null, item.sku].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-sm">
                  {item.quantity_on_hand} {item.unit}
                  {low ? <span className="ml-2 rounded-full bg-ember-soft px-2 py-0.5 text-ember">Low</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? <p className="text-sm text-muted">No inventory matches.</p> : null}
    </div>
  );
}
