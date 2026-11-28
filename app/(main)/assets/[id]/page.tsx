import { notFound } from "next/navigation";
import { AssetView } from "@/components/assets/AssetView";
import { WarrantyPanel } from "@/components/assets/WarrantyPanel";
import { PERMISSIONS, can } from "@/lib/permissions";
import { getAsset } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  if (!workspace) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();
  const asset = await getAsset(supabase, id);
  if (!asset) notFound();
  const membership = workspace.organizations.find((item) => item.organization.id === asset.organization_id);
  if (!membership) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <AssetView
        asset={asset}
        membership={membership}
        userId={workspace.userId}
        displayName={workspace.displayName}
      />
      <div className="px-4 pb-6">
        <WarrantyPanel asset={asset} canEdit={can(membership.permissions, PERMISSIONS.assetsWrite)} />
      </div>
    </div>
  );
}
