import { notFound } from "next/navigation";
import { AssetScreen } from "@/components/assets/AssetScreen";
import type { AssetRecord } from "@/lib/assets/types";
import { listAssets, listAttachments, listEmployees, listEvents, listFieldDefinitions, listLocations, listStatuses, listTypes } from "@/lib/data";
import { defaultDueDate } from "@/lib/company/matrix";
import { todayInZone } from "@/lib/format";
import { historyNames } from "@/lib/history/display";
import type { MembershipContext } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function AssetView({
  asset,
  membership,
  userId,
  displayName,
}: {
  asset: AssetRecord;
  membership: MembershipContext;
  userId: string;
  displayName: string;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();
  if (asset.organization_id !== membership.organization.id) notFound();
  const [assets, events, photos, locations, employees, statuses, types, fieldDefinitions, company] = await Promise.all([
    listAssets(supabase, membership.organization.id, { includeArchived: true }),
    listEvents(supabase, asset.id),
    listAttachments(supabase, asset.id),
    listLocations(supabase, membership.organization.id),
    listEmployees(supabase, membership.organization.id),
    listStatuses(supabase, membership.organization.id),
    listTypes(supabase, membership.organization.id),
    listFieldDefinitions(supabase, membership.organization.id),
    supabase
      .from("organization_settings")
      .select("checkout_due_required, default_checkout_days, require_note_broken, require_note_missing")
      .eq("organization_id", membership.organization.id)
      .maybeSingle(),
  ]);
  const parent = asset.parent_asset_id ? assets.find((item) => item.id === asset.parent_asset_id) : undefined;
  const policy = company.data as {
    checkout_due_required?: boolean;
    default_checkout_days?: number;
    require_note_broken?: boolean;
    require_note_missing?: boolean;
  } | null;
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
      names={historyNames({ people: employees, locations, assets, statuses, types })}
      statuses={statuses.map((status) => ({
        key: status.key,
        label: status.label,
        archived_at: status.archived_at,
        position: status.position,
        counts_as_available: Boolean(status.counts_as_available),
        needs_attention: Boolean(status.needs_attention),
        notify: Boolean(status.notify),
      }))}
      fieldDefinitions={fieldDefinitions}
      checkoutDueRequired={Boolean(policy?.checkout_due_required)}
      defaultDue={defaultDueDate(todayInZone(membership.organization.timezone), Number(policy?.default_checkout_days ?? 0))}
      requireNoteBroken={Boolean(policy?.require_note_broken)}
      requireNoteMissing={Boolean(policy?.require_note_missing)}
    />
  );
}
