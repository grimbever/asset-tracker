import { notFound } from "next/navigation";
import { InventoryForm } from "@/components/inventory/InventoryForm";
import { listConsumables } from "@/lib/inventory/data";
import { listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, workspace] = await Promise.all([params, loadWorkspace()]);
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.inventoryEdit) && !can(active.permissions, PERMISSIONS.inventoryManage)) {
    return <main className="px-4 py-8">You cannot edit inventory.</main>;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [items, locations] = await Promise.all([
    listConsumables(supabase, active.organization.id),
    listLocations(supabase, active.organization.id),
  ]);
  const item = items.find((entry) => entry.id === id);
  if (!item) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Edit {item.name}</h1>
      <InventoryForm organizationId={active.organization.id} item={item} locations={locations.filter((location) => !location.archived_at)} />
    </main>
  );
}
