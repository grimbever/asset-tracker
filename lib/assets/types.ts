export const ASSET_TYPES = [
  { id: "equipment", label: "Equipment" },
  { id: "tool", label: "Tool" },
  { id: "trailer", label: "Trailer" },
  { id: "dosing_gear", label: "Dosing gear" },
  { id: "it", label: "IT / electronics" },
] as const;

export type AssetType = (typeof ASSET_TYPES)[number]["id"];

export const ASSET_STATUSES = [
  { id: "available", label: "Available" },
  { id: "checked_out", label: "Checked out" },
  { id: "in_repair", label: "In repair" },
  { id: "broken", label: "Broken" },
  { id: "missing", label: "Missing" },
  { id: "retired", label: "Retired" },
  { id: "disposed", label: "Disposed" },
  { id: "destroyed", label: "Destroyed" },
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number]["id"];

export type CustomFieldKind = "text" | "date";

export type CustomFieldDef = {
  key: string;
  label: string;
  kind: CustomFieldKind;
};

export type AssetRecord = {
  id: string;
  organization_id: string;
  name: string;
  tag_id: string;
  type: AssetType;
  status: AssetStatus;
  location_id: string | null;
  assigned_employee_id: string | null;
  due_on: string | null;
  group_label: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  vendor: string | null;
  purchase_date: string | null;
  cost: number | null;
  notes: string | null;
  parent_asset_id: string | null;
  checkout_as_unit: boolean;
  custom_fields: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type AssetInput = {
  name: string;
  tagId: string;
  type: AssetType;
  locationId: string | null;
  groupLabel: string;
  brand: string;
  model: string;
  serial: string;
  vendor: string;
  purchaseDate: string;
  cost: string;
  notes: string;
  parentAssetId: string | null;
  checkoutAsUnit: boolean;
  customFields: Record<string, string>;
  status?: AssetStatus;
};

export function assetTypeLabel(type: string): string {
  return ASSET_TYPES.find((item) => item.id === type)?.label ?? type;
}

export function assetStatusLabel(status: string): string {
  return ASSET_STATUSES.find((item) => item.id === status)?.label ?? status;
}

export function isAssetType(value: string): value is AssetType {
  return ASSET_TYPES.some((item) => item.id === value);
}

export function isAssetStatus(value: string): value is AssetStatus {
  return ASSET_STATUSES.some((item) => item.id === value);
}
