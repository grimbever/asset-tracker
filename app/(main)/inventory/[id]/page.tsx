import { notFound } from "next/navigation";
import { InventoryDetail } from "@/components/inventory/InventoryDetail";
import { listConsumables, listStockAdjustments } from "@/lib/inventory/data";
import { listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, workspace] = await Promise.all([params, loadWorkspace()]);
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const allowed = can(active.permissions, PERMISSIONS.inventoryView) || can(active.permissions, PERMISSIONS.inventoryEdit) || can(active.permissions, PERMISSIONS.inventoryManage);
  if (!allowed) return <main className="px-4 py-8">You cannot view inventory.</main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [items, locations, history] = await Promise.all([
    listConsumables(supabase, active.organization.id),
    listLocations(supabase, active.organization.id),
    listStockAdjustments(supabase, id),
  ]);
  const item = items.find((entry) => entry.id === id);
  if (!item) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <InventoryDetail
        item={item}
        locationName={locations.find((location) => location.id === item.location_id)?.name ?? null}
        history={history}
        canEdit={can(active.permissions, PERMISSIONS.inventoryEdit) || can(active.permissions, PERMISSIONS.inventoryManage)}
      />
    </main>
  );
}
