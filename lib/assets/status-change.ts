export type StatusChoice = {
  key: string;
  label: string;
  position?: number;
  archivedAt?: string | null;
};

export const END_OF_LIFE_STATUSES = ["disposed", "destroyed"] as const;

const SERVICE_BLOCK = new Set(["available", "checked_out", "disposed", "destroyed"]);

export function isEndOfLife(status: string): boolean {
  return status === "disposed" || status === "destroyed";
}

/** Statuses an editor can move to. Checked out stays on the check-out button. Retired is archived. */
export function changeableStatuses(statuses: readonly StatusChoice[], current: string): StatusChoice[] {
  return statuses
    .filter((status) => !status.archivedAt && status.key !== "checked_out" && status.key !== "retired" && status.key !== current)
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0) || left.label.localeCompare(right.label));
}

export function showReturnToService(status: string): boolean {
  return !SERVICE_BLOCK.has(status);
}

export function statusChangeBlocker(input: {
  next: string;
  note: string;
  confirmed: boolean;
  requireNoteBroken?: boolean;
  requireNoteMissing?: boolean;
}): string | null {
  if (!input.next) return "Choose a status.";
  if (input.next === "checked_out") return "Use check out to issue this item.";
  if (input.next === "retired") return "Retired is no longer used. Choose disposed or destroyed.";
  if (input.next === "broken" && input.requireNoteBroken && !input.note.trim()) return "This status needs a note.";
  if (input.next === "missing" && input.requireNoteMissing && !input.note.trim()) return "This status needs a note.";
  if (!isEndOfLife(input.next)) return null;
  if (!input.note.trim()) return "Disposed and destroyed need a note.";
  if (!input.confirmed) return "Confirm this end-of-life change.";
  return null;
}

export function statusSaveLabel(next: string): string {
  if (next === "disposed") return "Confirm disposed";
  if (next === "destroyed") return "Confirm destroyed";
  if (next === "available") return "Mark available";
  return "Save status";
}
