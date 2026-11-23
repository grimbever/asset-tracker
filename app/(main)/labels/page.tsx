import { LabelPicker } from "@/components/labels/LabelPicker";
import { listAssets, listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LabelsPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.assetsView)) {
    return <main className="px-4 py-8">Labels are available when you can view the register.</main>;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [assets, locations] = await Promise.all([
    listAssets(supabase, active.organization.id),
    listLocations(supabase, active.organization.id),
  ]);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="font-serif text-4xl tracking-tight">Labels</h1>
      <p className="mt-2 mb-4 text-sm leading-6 text-muted">
        Pick a sheet or roll, then print from the browser. No printer driver is installed by this app. Avery 5163 is a comfortable default for a QR code.
      </p>
      <LabelPicker
        assets={assets}
        locationNames={Object.fromEntries(locations.map((location) => [location.id, location.name]))}
      />
    </main>
  );
}
