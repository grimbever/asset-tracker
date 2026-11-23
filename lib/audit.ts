export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

function asText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Field-level before/after for one edit. Unchanged fields are omitted. */
export function fieldChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): FieldChange[] {
  const left = before ?? {};
  const right = after ?? {};
  const fields = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changes: FieldChange[] = [];
  for (const field of [...fields].sort()) {
    const previous = asText(left[field]);
    const next = asText(right[field]);
    if (previous === next) continue;
    changes.push({ field, before: previous, after: next });
  }
  return changes;
}

export function readFieldChanges(payload: Record<string, unknown> | null | undefined): FieldChange[] {
  const raw = payload?.changes;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.field !== "string" || !row.field) return [];
    return [{ field: row.field, before: asText(row.before), after: asText(row.after) }];
  });
}

export type ReferenceCounts = {
  events: number;
  assets: number;
  children: number;
  photos: number;
};

/** Hard delete is allowed only when nothing in the register or the log points at the record. */
export function canHardDelete(references: ReferenceCounts): boolean {
  return references.events + references.assets + references.children + references.photos === 0;
}
