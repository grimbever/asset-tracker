import { isUuid } from "@/lib/ids";

export type HistoryNames = {
  people: Record<string, string>;
  locations: Record<string, string>;
  assets: Record<string, string>;
  statuses: Record<string, string>;
  types: Record<string, string>;
  roles: Record<string, string>;
};

export const EMPTY_HISTORY_NAMES: HistoryNames = {
  people: {},
  locations: {},
  assets: {},
  statuses: {},
  types: {},
  roles: {},
};

const FIELD_LABELS: Record<string, string> = {
  assigned_employee_id: "Assigned to",
  related_employee_id: "Person",
  employee_id: "Person",
  invited_by: "Invited by",
  user_id: "Person",
  location_id: "Location",
  parent_asset_id: "Part of",
  asset_id: "Asset",
  status: "Status",
  status_id: "Status",
  type: "Type",
  type_id: "Type",
  role_id: "Role",
  tag_id: "Tag",
  due_on: "Due",
  checkout_as_unit: "Check out as a kit",
  archived_at: "Archived",
  hire_date: "Hired",
  termination_date: "Leaving",
  leaving_date: "Leaving",
  group_label: "Group",
  purchase_date: "Purchased",
  name: "Name",
  title: "Title",
  email: "Email",
  phone: "Phone",
  notes: "Notes",
  brand: "Brand",
  model: "Model",
  serial: "Serial",
  vendor: "Vendor",
  cost: "Cost",
  active: "Active",
};

const PEOPLE_FIELDS = new Set(["assigned_employee_id", "related_employee_id", "employee_id", "invited_by", "user_id"]);
const LOCATION_FIELDS = new Set(["location_id"]);
const ASSET_FIELDS = new Set(["parent_asset_id", "asset_id"]);
const STATUS_FIELDS = new Set(["status", "status_id"]);
const TYPE_FIELDS = new Set(["type", "type_id"]);
const ROLE_FIELDS = new Set(["role_id"]);

export function historyNames(input: {
  people?: readonly { id: string; name: string }[];
  locations?: readonly { id: string; name: string }[];
  assets?: readonly { id: string; name: string }[];
  statuses?: readonly { id: string; key: string; label: string }[];
  types?: readonly { id: string; key: string; label: string }[];
  roles?: readonly { id: string; name: string }[];
}): HistoryNames {
  return {
    people: byId(input.people),
    locations: byId(input.locations),
    assets: byId(input.assets),
    statuses: byKeyAndId(input.statuses),
    types: byKeyAndId(input.types),
    roles: byId(input.roles),
  };
}

export function historyFieldLabel(field: string): string {
  const key = field.startsWith("custom.") ? field.slice("custom.".length) : field;
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const words = key.replace(/_id$/, "").replaceAll("_", " ").trim();
  return words
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function presentHistoryValue(field: string, value: string | null, names: HistoryNames = EMPTY_HISTORY_NAMES): string {
  if (!value) return "—";
  const key = field.startsWith("custom.") ? field.slice("custom.".length) : field;
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  if (isUuid(value)) {
    const found = lookupId(key, value, names);
    return found ?? "Unknown (deleted)";
  }
  if (STATUS_FIELDS.has(key)) return names.statuses[value] ?? humanize(value);
  if (TYPE_FIELDS.has(key)) return names.types[value] ?? humanize(value);
  return value;
}

export function presentHistoryChange(
  change: { field: string; before: string | null; after: string | null },
  names: HistoryNames = EMPTY_HISTORY_NAMES,
): { label: string; before: string; after: string } {
  return {
    label: historyFieldLabel(change.field),
    before: presentHistoryValue(change.field, change.before, names),
    after: presentHistoryValue(change.field, change.after, names),
  };
}

function lookupId(field: string, id: string, names: HistoryNames): string | undefined {
  if (PEOPLE_FIELDS.has(field)) return names.people[id];
  if (LOCATION_FIELDS.has(field)) return names.locations[id];
  if (ASSET_FIELDS.has(field)) return names.assets[id];
  if (STATUS_FIELDS.has(field)) return names.statuses[id];
  if (TYPE_FIELDS.has(field)) return names.types[id];
  if (ROLE_FIELDS.has(field)) return names.roles[id];
  return names.people[id] ?? names.locations[id] ?? names.assets[id] ?? names.statuses[id] ?? names.types[id] ?? names.roles[id];
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function byId(rows: readonly { id: string; name: string }[] | undefined): Record<string, string> {
  const names: Record<string, string> = {};
  for (const row of rows ?? []) names[row.id] = row.name;
  return names;
}

function byKeyAndId(rows: readonly { id: string; key: string; label: string }[] | undefined): Record<string, string> {
  const names: Record<string, string> = {};
  for (const row of rows ?? []) {
    names[row.id] = row.label;
    names[row.key] = row.label;
  }
  return names;
}
