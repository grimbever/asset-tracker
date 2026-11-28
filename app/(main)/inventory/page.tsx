import { InventoryList } from "@/components/inventory/InventoryList";
import { listConsumables } from "@/lib/inventory/data";
import { listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ low?: string }> }) {
  const [{ low }, workspace] = await Promise.all([searchParams, loadWorkspace()]);
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const allowed = can(active.permissions, PERMISSIONS.inventoryView) || can(active.permissions, PERMISSIONS.inventoryEdit) || can(active.permissions, PERMISSIONS.inventoryManage);
  if (!allowed) return <main className="px-4 py-8">You cannot view inventory.</main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [items, locations] = await Promise.all([
    listConsumables(supabase, active.organization.id),
    listLocations(supabase, active.organization.id),
  ]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Inventory</h1>
      <InventoryList
        items={items}
        locationNames={Object.fromEntries(locations.map((location) => [location.id, location.name]))}
        canEdit={can(active.permissions, PERMISSIONS.inventoryEdit) || can(active.permissions, PERMISSIONS.inventoryManage)}
        lowOnly={low === "1"}
      />
    </main>
  );
}
