import { notFound } from "next/navigation";
import { AssetScreen } from "@/components/assets/AssetScreen";
import { getAsset, listAssets, listAttachments, listEmployees, listEvents, listLocations } from "@/lib/data";
import type { MembershipContext } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function AssetView({
  assetId,
  membership,
  userId,
  displayName,
}: {
  assetId: string;
  membership: MembershipContext;
  userId: string;
  displayName: string;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();
  const asset = await getAsset(supabase, assetId);
  if (!asset || asset.organization_id !== membership.organization.id) notFound();
  const [assets, events, photos, locations, employees] = await Promise.all([
    listAssets(supabase, membership.organization.id),
    listEvents(supabase, asset.id),
    listAttachments(supabase, asset.id),
    listLocations(supabase, membership.organization.id),
    listEmployees(supabase, membership.organization.id),
  ]);
  const parent = asset.parent_asset_id ? assets.find((item) => item.id === asset.parent_asset_id) : undefined;
  return (
    <AssetScreen
      asset={asset}
      pieces={assets.filter((item) => item.parent_asset_id === asset.id)}
      events={events}
      photos={photos}
      locations={locations}
      employees={employees}
      locationName={locations.find((location) => location.id === asset.location_id)?.name ?? null}
      assigneeName={employees.find((person) => person.id === asset.assigned_employee_id)?.name ?? null}
      parent={parent ? { id: parent.id, name: parent.name, tag_id: parent.tag_id } : null}
      permissions={membership.permissions}
      userId={userId}
      displayName={displayName}
      timeZone={membership.organization.timezone}
    />
  );
}
