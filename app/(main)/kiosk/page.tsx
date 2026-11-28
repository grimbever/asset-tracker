import { KioskScreen } from "@/components/kiosk/KioskScreen";
import { listAssets } from "@/lib/data";
import { listConsumables } from "@/lib/inventory/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function KioskPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const allowed = can(active.permissions, PERMISSIONS.kioskUse) || can(active.permissions, PERMISSIONS.kioskManage);
  if (!allowed) return <main className="px-4 py-8">This sign-in cannot open the kiosk. Assign the Kiosk role, or turn Kiosk on for your role in Company setup.</main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [peopleRows, items, assets] = await Promise.all([
    supabase.from("employees").select("id, name, active, archived_at, kiosk_pin_hash").eq("organization_id", active.organization.id).order("name"),
    listConsumables(supabase, active.organization.id),
    can(active.permissions, PERMISSIONS.assetsCheckout) ? listAssets(supabase, active.organization.id) : Promise.resolve([]),
  ]);
  const people = ((peopleRows.data ?? []) as { id: string; name: string; active: boolean; archived_at: string | null; kiosk_pin_hash: string | null }[])
    .filter((person) => person.active && !person.archived_at)
    .map((person) => ({ id: person.id, name: person.name, hasPin: Boolean(person.kiosk_pin_hash) }));
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <KioskScreen
        people={people}
        items={items}
        assets={assets}
        canSetPin={can(active.permissions, PERMISSIONS.kioskManage) || can(active.permissions, PERMISSIONS.peopleManage)}
        canRequest={can(active.permissions, PERMISSIONS.kioskRequest)}
        canCreateItem={can(active.permissions, PERMISSIONS.kioskCreateItem)}
        organizationId={active.organization.id}
      />
    </main>
  );
}
