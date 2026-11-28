import type { AssetRecord } from "@/lib/assets/types";
import { warrantyExpiringSoon } from "@/lib/warranty/reminders";

const END_OF_LIFE = new Set(["disposed", "destroyed"]);

export type AssetListFilters = {
  query: string;
  status: string;
  showArchived: boolean;
  personId: string | null;
  locationId: string | null;
  locationNames: Record<string, string>;
  warrantySoon?: boolean;
  today?: string;
};

/** Disposed and destroyed stay on the filtered list even when the asset is archived. */
export function statusKeepsArchived(status: string): boolean {
  return END_OF_LIFE.has(status);
}

export function resolveStatusKey(
  raw: string | undefined,
  statuses: readonly { id: string; key: string }[],
): string | null {
  const value = raw?.trim() ?? "";
  if (!value || value === "all") return null;
  const match = statuses.find((status) => status.key === value || status.id === value);
  if (match) return match.key;
  if (/^[0-9a-f-]{36}$/i.test(value)) return null;
  return value;
}

export function filterAssets(assets: readonly AssetRecord[], filters: AssetListFilters): AssetRecord[] {
  const needle = filters.query.trim().toLowerCase();
  const keepArchived = statusKeepsArchived(filters.status);
  return assets.filter((asset) => {
    if (asset.archived_at && !filters.showArchived && !keepArchived) return false;
    if (filters.personId && asset.assigned_employee_id !== filters.personId) return false;
    if (filters.locationId && asset.location_id !== filters.locationId) return false;
    if (filters.status !== "all" && asset.status !== filters.status) return false;
    if (filters.warrantySoon && !warrantyExpiringSoon(asset.warranty_end ?? null, filters.today ?? "1970-01-01")) return false;
    if (!needle) return true;
    const location = asset.location_id ? filters.locationNames[asset.location_id] : "";
    return [asset.name, asset.tag_id, asset.serial, asset.brand, asset.model, location]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
}

export function assetsHref(filters: { personId?: string | null; locationId?: string | null; status?: string | null; warranty?: boolean }): string {
  const params = new URLSearchParams();
  if (filters.personId) params.set("person", filters.personId);
  if (filters.locationId) params.set("location", filters.locationId);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.warranty) params.set("warranty", "soon");
  const query = params.toString();
  return query ? `/assets?${query}` : "/assets";
}
