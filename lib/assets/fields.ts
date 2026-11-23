import type { BuiltinAssetType, CustomFieldDef } from "./types";

const NONE: CustomFieldDef[] = [];

export const CUSTOM_FIELDS: Record<BuiltinAssetType, readonly CustomFieldDef[]> = {
  equipment: NONE,
  tool: NONE,
  trailer: [
    { key: "vin", label: "VIN", kind: "text" },
    { key: "plate", label: "Plate", kind: "text" },
    { key: "registration_expiry", label: "Registration expiry", kind: "date" },
    { key: "gvwr", label: "GVWR", kind: "text" },
  ],
  dosing_gear: [
    { key: "pump_model", label: "Pump model", kind: "text" },
    { key: "chemical", label: "Chemical", kind: "text" },
    { key: "last_calibration", label: "Last calibration", kind: "date" },
    { key: "next_calibration", label: "Next calibration", kind: "date" },
  ],
  it: [
    { key: "wipe_standard", label: "Wipe / sanitization standard", kind: "text" },
  ],
};

export function fieldsFor(type: string): readonly CustomFieldDef[] {
  if (type in CUSTOM_FIELDS) return CUSTOM_FIELDS[type as BuiltinAssetType];
  return NONE;
}

/** Keep only known keys for the type. Blank values are dropped. */
export function cleanCustomFields(type: string, input: Record<string, string>): Record<string, string> {
  const allowed = new Map(fieldsFor(type).map((field) => [field.key, field]));
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const field = allowed.get(key);
    if (!field) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    cleaned[key] = trimmed;
  }
  return cleaned;
}

export function emptyCustomFields(type: string): Record<string, string> {
  return Object.fromEntries(fieldsFor(type).map((field) => [field.key, ""]));
}
