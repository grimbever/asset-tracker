import { AssetList } from "@/components/assets/AssetList";
import { listAssets, listEmployees, listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AssetsPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.assetsView)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="font-serif text-4xl">Assets</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Your role looks items up by scan instead of browsing the full register.</p>
        <Link href="/scan" className="mt-4 inline-flex min-h-12 items-center rounded-full bg-ember px-4 text-white">Scan</Link>
      </main>
    );
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [assets, locations, employees] = await Promise.all([
    listAssets(supabase, active.organization.id),
    listLocations(supabase, active.organization.id),
    listEmployees(supabase, active.organization.id),
  ]);
  const locationNames = Object.fromEntries(locations.map((location) => [location.id, location.name]));
  const assigneeNames = Object.fromEntries(employees.map((person) => [person.id, person.name]));
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Assets</h1>
      <AssetList
        assets={assets}
        locationNames={locationNames}
        assigneeNames={assigneeNames}
        canWrite={can(active.permissions, PERMISSIONS.assetsWrite)}
      />
    </main>
  );
}
