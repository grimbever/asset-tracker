import Link from "next/link";
import { ShoppingList, type ShoppingRequest } from "@/components/inventory/ShoppingList";
import { canSeeShoppingList, type ShoppingStatus } from "@/lib/inventory/shopping";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ShoppingRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ status: statusParam }, workspace] = await Promise.all([searchParams, loadWorkspace()]);
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const status: ShoppingStatus | null = statusParam === "open" || statusParam === "ordered" ? statusParam : null;
  const allowed = canSeeShoppingList(active.permissions);
  if (!allowed) return <main className="px-4 py-8">You cannot open the shopping list.</main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("supply_requests")
    .select("id, item_name, quantity, notes, status, requester_name, created_at")
    .eq("organization_id", active.organization.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <p className="text-sm"><Link href="/inventory" className="underline">Inventory</Link></p>
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Shopping list</h1>
      <p className="mb-4 text-sm text-muted">Requests from the kiosk. Received adds the quantity to stock, or creates the item if it is new.</p>
      <ShoppingList
        requests={(data ?? []) as ShoppingRequest[]}
        status={status}
        canUpdate={can(active.permissions, PERMISSIONS.inventoryEdit) || can(active.permissions, PERMISSIONS.inventoryManage)}
      />
    </main>
  );
}
