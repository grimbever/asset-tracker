import { InventoryForm } from "@/components/inventory/InventoryForm";
import { listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewInventoryPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.inventoryEdit) && !can(active.permissions, PERMISSIONS.inventoryManage)) {
    return <main className="px-4 py-8">You cannot add inventory.</main>;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const locations = await listLocations(supabase, active.organization.id);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">New inventory item</h1>
      <InventoryForm organizationId={active.organization.id} locations={locations.filter((location) => !location.archived_at)} />
    </main>
  );
}
