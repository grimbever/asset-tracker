import { notFound } from "next/navigation";
import { AssetForm } from "@/components/assets/AssetForm";
import { getAsset, inputFromAsset, listAssets, listLocations } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  if (!workspace) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();
  const asset = await getAsset(supabase, id);
  if (!asset) notFound();
  const membership = workspace.organizations.find((item) => item.organization.id === asset.organization_id);
  if (!membership || !can(membership.permissions, PERMISSIONS.assetsWrite)) notFound();
  const [locations, assets] = await Promise.all([
    listLocations(supabase, asset.organization_id),
    listAssets(supabase, asset.organization_id),
  ]);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Edit {asset.name}</h1>
      <AssetForm
        organizationId={asset.organization_id}
        assetId={asset.id}
        initial={inputFromAsset(asset)}
        locations={locations}
        parents={assets.map((item) => ({ id: item.id, name: item.name, tag_id: item.tag_id }))}
      />
    </main>
  );
}
