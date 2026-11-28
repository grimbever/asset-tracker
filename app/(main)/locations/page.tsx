import { LocationManager } from "@/components/locations/LocationManager";
import { permissionReady } from "@/lib/company/data";
import { modulePageAllowed } from "@/lib/company/matrix";
import { listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LocationsPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [ready, locations] = await Promise.all([
    permissionReady(supabase, active.organization.id, PERMISSIONS.locationsView),
    listLocations(supabase, active.organization.id),
  ]);
  const allowed = modulePageAllowed({
    ready,
    permissions: active.permissions,
    required: [PERMISSIONS.locationsView, PERMISSIONS.locationsManage, PERMISSIONS.settingsManage],
    legacy: [PERMISSIONS.assetsView, PERMISSIONS.settingsManage],
  });
  if (!allowed) return <main className="px-4 py-8">You cannot view locations.</main>;
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Locations</h1>
      <LocationManager
        organizationId={active.organization.id}
        locations={locations}
        canManage={can(active.permissions, PERMISSIONS.locationsManage) || can(active.permissions, PERMISSIONS.settingsManage)}
      />
    </main>
  );
}
