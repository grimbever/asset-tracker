import type { AssetRecord } from "@/lib/assets/types";

export type AssetListFilters = {
  query: string;
  status: string;
  showArchived: boolean;
  personId: string | null;
  locationId: string | null;
  locationNames: Record<string, string>;
};

export function filterAssets(assets: readonly AssetRecord[], filters: AssetListFilters): AssetRecord[] {
  const needle = filters.query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (!filters.showArchived && asset.archived_at) return false;
    if (filters.personId && asset.assigned_employee_id !== filters.personId) return false;
    if (filters.locationId && asset.location_id !== filters.locationId) return false;
    if (filters.status !== "all" && asset.status !== filters.status) return false;
    if (!needle) return true;
    const location = asset.location_id ? filters.locationNames[asset.location_id] : "";
    return [asset.name, asset.tag_id, asset.serial, asset.brand, asset.model, location]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
}

export function assetsHref(filters: { personId?: string | null; locationId?: string | null }): string {
  const params = new URLSearchParams();
  if (filters.personId) params.set("person", filters.personId);
  if (filters.locationId) params.set("location", filters.locationId);
  const query = params.toString();
  return query ? `/assets?${query}` : "/assets";
}
