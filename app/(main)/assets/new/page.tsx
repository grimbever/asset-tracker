import { AssetForm } from "@/components/assets/AssetForm";
import { blankAssetInput, listAssets, listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewAssetPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.assetsWrite)) {
    return <main className="px-4 py-8">You cannot add equipment.</main>;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [locations, assets] = await Promise.all([
    listLocations(supabase, active.organization.id),
    listAssets(supabase, active.organization.id),
  ]);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Add asset</h1>
      <p className="mb-4 text-sm text-muted">Name and type are enough to save. Everything else can wait.</p>
      <AssetForm
        organizationId={active.organization.id}
        initial={blankAssetInput()}
        locations={locations}
        parents={assets.map((asset) => ({ id: asset.id, name: asset.name, tag_id: asset.tag_id }))}
      />
    </main>
  );
}
