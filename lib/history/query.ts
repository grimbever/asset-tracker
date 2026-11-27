import type { AssetEvent } from "@/lib/assets/events";
import { readFieldChanges } from "@/lib/audit";
import { isUuid } from "@/lib/ids";

export type HistoryFilters = {
  q: string;
  subjectType: string;
  subjectId: string;
  eventType: string;
  from: string;
  to: string;
};

export type NamedPerson = {
  id: string;
  name: string;
};

export type HistoryHit = {
  event: AssetEvent;
  assetName?: string | null;
  assetTag?: string | null;
  personName?: string | null;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function readHistoryFilters(raw: {
  q?: string;
  type?: string;
  action?: string;
  event?: string;
  from?: string;
  to?: string;
  id?: string;
}): HistoryFilters {
  const subjectId = raw.id?.trim() ?? "";
  return {
    q: raw.q?.trim() ?? "",
    subjectType: raw.type?.trim() ?? "",
    subjectId: isUuid(subjectId) ? subjectId : "",
    // `event` is the live query name. `action` is accepted so older links still filter.
    eventType: (raw.event ?? raw.action)?.trim() ?? "",
    from: validDate(raw.from),
    to: validDate(raw.to),
  };
}

export function historySearchParams(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.subjectType) params.set("type", filters.subjectType);
  if (filters.subjectType && filters.subjectId) params.set("id", filters.subjectId);
  if (filters.eventType) params.set("event", filters.eventType);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

export function historyHref(filters: HistoryFilters): string {
  const query = historySearchParams(filters);
  return query ? `/history?${query}` : "/history";
}

export function historyRange(from: string, to: string, timeZone: string): { start: string | null; end: string | null } {
  return {
    start: from ? zonedDayStart(from, timeZone).toISOString() : null,
    end: to ? zonedDayStart(nextIsoDate(to), timeZone).toISOString() : null,
  };
}

export function occurredInRange(occurredAt: string, range: { start: string | null; end: string | null }): boolean {
  const time = new Date(occurredAt).getTime();
  if (Number.isNaN(time)) return false;
  if (range.start && time < new Date(range.start).getTime()) return false;
  if (range.end && time >= new Date(range.end).getTime()) return false;
  return true;
}

/** Person id to store on an event that did not already have one. */
export function derivedEmployeeId(event: AssetEvent, people: readonly NamedPerson[] = []): string | null {
  if (event.subject_type === "employee") return event.subject_id;
  const explicit = payloadEmployeeId(event);
  if (explicit) return explicit;
  const from = stateEmployeeId(event.from_state);
  const to = stateEmployeeId(event.to_state);
  if (event.event_type === "checked_out" && to) return to;
  if (event.event_type === "checked_in" && from) return from;
  if ((event.event_type === "updated" || event.event_type === "status_changed") && from !== to) {
    return to ?? from;
  }
  return uniquePersonByAssigneeName(event, people);
}

export function eventMentionsEmployee(
  event: AssetEvent,
  employeeId: string,
  options?: { name?: string | null; nameIsUnique?: boolean },
): boolean {
  if (!employeeId) return false;
  if (event.related_employee_id === employeeId) return true;
  if (event.subject_type === "employee" && event.subject_id === employeeId) return true;
  if (payloadEmployeeId(event) === employeeId) return true;
  const from = stateEmployeeId(event.from_state);
  const to = stateEmployeeId(event.to_state);
  if (event.event_type === "checked_out" && to === employeeId) return true;
  if (event.event_type === "checked_in" && from === employeeId) return true;
  if (
    (event.event_type === "updated" || event.event_type === "status_changed") &&
    from !== to &&
    (from === employeeId || to === employeeId)
  ) {
    return true;
  }
  if (options?.nameIsUnique === false) return false;
  if (payloadEmployeeId(event) || event.subject_type === "employee") return false;
  if (event.event_type === "checked_out" && to) return false;
  if (event.event_type === "checked_in" && from) return false;
  const assignee = event.payload.assignee_name;
  const name = options?.name?.trim().toLowerCase();
  return Boolean(name && typeof assignee === "string" && assignee.trim().toLowerCase() === name);
}

export function historySearchText(hit: HistoryHit): string {
  const changes = readFieldChanges(hit.event.payload);
  return [
    hit.event.notes,
    hit.event.actor_name,
    hit.assetName,
    hit.assetTag,
    hit.personName,
    textValue(hit.event.payload.assignee_name),
    textValue(hit.event.payload.name),
    textValue(hit.event.payload.tag_id),
    textValue(hit.event.payload.location_name),
    ...changes.flatMap((change) => [change.field, change.before, change.after]),
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ")
    .toLowerCase();
}

/** Case-insensitive substring match. `%` and `_` in the query stay literal, same as an escaped ilike. */
export function eventMatchesQuery(hit: HistoryHit, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return historySearchText(hit).includes(needle);
}

export function historyHitVisible(
  hit: HistoryHit,
  filters: HistoryFilters,
  timeZone: string,
  people: readonly NamedPerson[] = [],
): boolean {
  if (filters.eventType && hit.event.event_type !== filters.eventType) return false;
  if (filters.subjectType === "employee" && filters.subjectId) {
    const person = people.find((item) => item.id === filters.subjectId);
    const sameName = person
      ? people.filter((item) => item.name.trim().toLowerCase() === person.name.trim().toLowerCase()).length
      : 0;
    if (!eventMentionsEmployee(hit.event, filters.subjectId, { name: person?.name, nameIsUnique: sameName === 1 })) {
      return false;
    }
  } else if (filters.subjectType) {
    if (hit.event.subject_type !== filters.subjectType) return false;
    if (filters.subjectId && hit.event.subject_id !== filters.subjectId) return false;
  }
  if (!occurredInRange(hit.event.occurred_at, historyRange(filters.from, filters.to, timeZone))) return false;
  return eventMatchesQuery(hit, filters.q);
}

export function searchPersonId(event: AssetEvent): string | null {
  if (event.related_employee_id) return event.related_employee_id;
  if (event.subject_type === "employee") return event.subject_id;
  const explicit = payloadEmployeeId(event);
  if (explicit) return explicit;
  return stateEmployeeId(event.to_state) ?? stateEmployeeId(event.from_state);
}

export const HISTORY_LOAD_ERROR = "History could not be loaded. Refresh the page and try again.";

export function isMissingHistorySearch(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const message = error.message ?? "";
  return /search_events/i.test(message) && /could not find|does not exist|schema cache/i.test(message);
}

/** The database search runs as the signed-in user. A helper-permission or missing-function error can use the in-app filter. */
export function historyRpcPlan(error: { code?: string; message?: string } | null | undefined): "ok" | "denied" | "fallback" {
  if (!error) return "ok";
  if (/cannot view history/i.test(error.message ?? "")) return "denied";
  return "fallback";
}

function payloadEmployeeId(event: AssetEvent): string | null {
  return uuidField(event.payload, "employee_id") ?? uuidField(event.payload, "assignee_employee_id") ?? uuidField(event.payload, "related_employee_id");
}

function stateEmployeeId(state: Record<string, unknown> | null): string | null {
  return uuidField(state, "assigned_employee_id");
}

function uuidField(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && isUuid(value) ? value : null;
}

function uniquePersonByAssigneeName(event: AssetEvent, people: readonly NamedPerson[]): string | null {
  const assignee = event.payload.assignee_name;
  if (typeof assignee !== "string" || !assignee.trim()) return null;
  const matches = people.filter((person) => person.name.trim().toLowerCase() === assignee.trim().toLowerCase());
  return matches.length === 1 ? matches[0].id : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function validDate(value: string | undefined): string {
  if (!value) return "";
  const match = DATE.exec(value.trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function nextIsoDate(isoDate: string): string {
  const match = DATE.exec(isoDate);
  if (!match) return isoDate;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return utc.toISOString().slice(0, 10);
}

function zonedDayStart(isoDate: string, timeZone: string): Date {
  const zone = safeTimeZone(timeZone);
  let utc = new Date(`${isoDate}T00:00:00.000Z`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = new Date(new Date(`${isoDate}T00:00:00.000Z`).getTime() - timeZoneOffsetMs(utc, zone));
    if (next.getTime() === utc.getTime()) break;
    utc = next;
  }
  return utc;
}

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return asUtc - date.getTime();
}
