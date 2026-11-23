export const EVENT_LABELS: Record<string, string> = {
  created: "Added",
  updated: "Updated",
  checked_out: "Checked out",
  checked_in: "Checked in",
  moved: "Moved",
  status_changed: "Status changed",
  photo_added: "Photo added",
  photo_removed: "Photo removed",
  deleted: "Deleted",
};

export type AssetEvent = {
  id: string;
  organization_id: string;
  subject_type: string;
  subject_id: string;
  event_type: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  notes: string | null;
  from_state: Record<string, unknown> | null;
  to_state: Record<string, unknown> | null;
  payload: Record<string, unknown>;
};

export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}

export function eventSummary(event: Pick<AssetEvent, "event_type" | "notes" | "to_state" | "payload">): string {
  if (event.notes?.trim()) return event.notes.trim();
  const to = event.to_state ?? {};
  if (event.event_type === "checked_out") {
    const who = stringValue(event.payload.assignee_name) ?? stringValue(event.payload.location_name);
    return who ? `Checked out to ${who}` : "Checked out";
  }
  if (event.event_type === "checked_in") return "Checked in";
  if (event.event_type === "moved") {
    const where = stringValue(event.payload.location_name);
    return where ? `Moved to ${where}` : "Location changed";
  }
  if (event.event_type === "status_changed") {
    const status = stringValue(to.status);
    return status ? `Marked ${status.replaceAll("_", " ")}` : "Status changed";
  }
  if (event.event_type === "created") return "Added to the register";
  return eventLabel(event.event_type);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
