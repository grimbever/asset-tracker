import { LocationManager } from "@/components/locations/LocationManager";
import { listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LocationsPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const allowed = can(active.permissions, PERMISSIONS.assetsView) || can(active.permissions, PERMISSIONS.settingsManage);
  if (!allowed) return <main className="px-4 py-8">You cannot view locations.</main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const locations = await listLocations(supabase, active.organization.id);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Locations</h1>
      <LocationManager
        organizationId={active.organization.id}
        locations={locations}
        canManage={can(active.permissions, PERMISSIONS.settingsManage)}
      />
    </main>
  );
}
