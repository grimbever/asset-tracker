import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AssetEvent } from "@/lib/assets/events";
import {
  derivedEmployeeId,
  eventMatchesQuery,
  eventMentionsEmployee,
  historyHitVisible,
  historyHref,
  historyRange,
  isMissingHistorySearch,
  readHistoryFilters,
  type HistoryHit,
} from "./query";

const BARBARA = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const ASSET = "55555555-5555-4555-8555-555555555555";

function event(partial: Partial<AssetEvent> & Pick<AssetEvent, "event_type" | "subject_type" | "subject_id">): AssetEvent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    occurred_at: "2026-11-23T18:00:00.000Z",
    actor_user_id: null,
    actor_name: "Jonathan",
    notes: null,
    from_state: null,
    to_state: null,
    payload: {},
    ...partial,
  };
}

function hit(partial: Partial<AssetEvent> & Pick<AssetEvent, "event_type" | "subject_type" | "subject_id">, extra: Omit<HistoryHit, "event"> = {}): HistoryHit {
  return { event: event(partial), ...extra };
}

describe("history query params", () => {
  it("reads filters and writes event instead of action", () => {
    const filters = readHistoryFilters({
      q: " driver ",
      type: "asset",
      action: "checked_out",
      from: "2026-11-01",
      to: "2026-11-30",
      id: ASSET,
    });
    expect(filters.eventType).toBe("checked_out");
    expect(filters.q).toBe("driver");
    expect(historyHref(filters)).toBe(
      `/history?q=driver&type=asset&id=${ASSET}&event=checked_out&from=2026-11-01&to=2026-11-30`,
    );
    expect(historyHref(filters)).not.toContain("action=");
  });

  it("drops blank, invalid, and unnamed filters", () => {
    expect(readHistoryFilters({ q: "  ", from: "2026-13-40", id: "not-a-uuid", event: "" })).toEqual({
      q: "",
      subjectType: "",
      subjectId: "",
      eventType: "",
      from: "",
      to: "",
    });
    expect(historyHref(readHistoryFilters({}))).toBe("/history");
  });

  it("prefers the event query over a legacy action query", () => {
    expect(readHistoryFilters({ event: "checked_in", action: "checked_out" }).eventType).toBe("checked_in");
  });

  it("does not give the history form a field named action", () => {
    const source = readFileSync("components/history/HistoryFilters.tsx", "utf8");
    expect(source).not.toMatch(/name=["']action["']/);
    expect(source).toContain('name="event"');
    expect(source).toContain("300");
  });
});

describe("history dates", () => {
  it("treats the from and to dates as whole days in the organization timezone", () => {
    const range = historyRange("2026-11-23", "2026-11-23", "America/Chicago");
    expect(range.start).toBe("2026-11-23T06:00:00.000Z");
    expect(range.end).toBe("2026-11-24T06:00:00.000Z");
    const filters = readHistoryFilters({ from: "2026-11-23", to: "2026-11-23" });
    expect(
      historyHitVisible(hit({ event_type: "created", subject_type: "asset", subject_id: ASSET, occurred_at: "2026-11-23T02:00:00.000Z" }), filters, "America/Chicago"),
    ).toBe(false);
    expect(
      historyHitVisible(hit({ event_type: "created", subject_type: "asset", subject_id: ASSET, occurred_at: "2026-11-23T18:00:00.000Z" }), filters, "America/Chicago"),
    ).toBe(true);
  });
});

describe("history search text", () => {
  const row = hit(
    {
      event_type: "updated",
      subject_type: "asset",
      subject_id: ASSET,
      notes: "Shop note",
      payload: {
        changes: [
          { field: "title", before: "Tech", after: "Lead" },
          { field: "serial", before: null, after: "ZZ-9" },
        ],
      },
    },
    { assetName: "Impact driver", assetTag: "AT-1002", personName: "Barbara" },
  );

  it("matches asset name, tag, person, field, and before/after without regard to case", () => {
    expect(eventMatchesQuery(row, "IMPACT")).toBe(true);
    expect(eventMatchesQuery(row, "at-1002")).toBe(true);
    expect(eventMatchesQuery(row, "barbara")).toBe(true);
    expect(eventMatchesQuery(row, "title")).toBe(true);
    expect(eventMatchesQuery(row, "tech")).toBe(true);
    expect(eventMatchesQuery(row, "lead")).toBe(true);
    expect(eventMatchesQuery(row, "zz-9")).toBe(true);
  });

  it("keeps percent and underscore characters literal", () => {
    const noted = hit({
      event_type: "updated",
      subject_type: "asset",
      subject_id: ASSET,
      notes: "save 100% done",
    });
    expect(eventMatchesQuery(noted, "100%")).toBe(true);
    expect(eventMatchesQuery(hit({ event_type: "updated", subject_type: "asset", subject_id: ASSET, notes: "save 1000" }), "100%")).toBe(false);
  });

  it("does not match an unrelated event", () => {
    expect(eventMatchesQuery(row, "trailer")).toBe(false);
  });
});

describe("person history", () => {
  const people = [
    { id: BARBARA, name: "Barbara" },
    { id: OTHER, name: "Pat" },
  ];

  it("includes a checkout whose subject is the asset when Barbara is the assignee", () => {
    const checkout = event({
      event_type: "checked_out",
      subject_type: "asset",
      subject_id: ASSET,
      payload: { assignee_name: "Barbara", due_on: "2026-11-30" },
      to_state: { assigned_employee_id: BARBARA, status: "checked_out" },
      from_state: { assigned_employee_id: null, status: "available" },
    });
    expect(checkout.subject_type).not.toBe("employee");
    expect(eventMentionsEmployee(checkout, BARBARA, { name: "Barbara", nameIsUnique: true })).toBe(true);
    expect(derivedEmployeeId(checkout, people)).toBe(BARBARA);
    expect(eventMentionsEmployee(checkout, OTHER, { name: "Pat", nameIsUnique: true })).toBe(false);
  });

  it("includes check-in, the person record, and an assignment change", () => {
    const checkin = event({
      event_type: "checked_in",
      subject_type: "asset",
      subject_id: ASSET,
      from_state: { assigned_employee_id: BARBARA },
      to_state: { assigned_employee_id: null },
    });
    const edited = event({
      event_type: "updated",
      subject_type: "employee",
      subject_id: BARBARA,
      payload: { name: "Barbara" },
    });
    const reassigned = event({
      event_type: "updated",
      subject_type: "asset",
      subject_id: ASSET,
      from_state: { assigned_employee_id: BARBARA },
      to_state: { assigned_employee_id: OTHER },
    });
    expect(eventMentionsEmployee(checkin, BARBARA)).toBe(true);
    expect(derivedEmployeeId(checkin, people)).toBe(BARBARA);
    expect(eventMentionsEmployee(edited, BARBARA)).toBe(true);
    expect(eventMentionsEmployee(reassigned, BARBARA)).toBe(true);
    expect(eventMentionsEmployee(reassigned, OTHER)).toBe(true);
    expect(derivedEmployeeId(reassigned, people)).toBe(OTHER);
  });

  it("derives a person from assignee_name when the event has no person id", () => {
    const legacy = event({
      event_type: "checked_out",
      subject_type: "asset",
      subject_id: ASSET,
      payload: { assignee_name: "Barbara" },
    });
    expect(derivedEmployeeId(legacy, people)).toBe(BARBARA);
    expect(eventMentionsEmployee(legacy, BARBARA, { name: "Barbara", nameIsUnique: true })).toBe(true);
    expect(derivedEmployeeId(legacy, [...people, { id: OTHER, name: "Barbara" }])).toBeNull();
    expect(eventMentionsEmployee(legacy, BARBARA, { name: "Barbara", nameIsUnique: false })).toBe(false);
  });

  it("filters the person page by those links, the action, and the search words", () => {
    const checkout = hit(
      {
        event_type: "checked_out",
        subject_type: "asset",
        subject_id: ASSET,
        to_state: { assigned_employee_id: BARBARA },
        payload: { assignee_name: "Barbara" },
      },
      { assetName: "Impact driver", assetTag: "AT-1002", personName: "Barbara" },
    );
    const other = hit({
      event_type: "created",
      subject_type: "asset",
      subject_id: ASSET,
      payload: { name: "Trailer" },
    });
    const filters = readHistoryFilters({ type: "employee", id: BARBARA, q: "impact", event: "checked_out" });
    expect(historyHitVisible(checkout, filters, "America/Chicago", people)).toBe(true);
    expect(historyHitVisible(other, filters, "America/Chicago", people)).toBe(false);
    expect(historyHitVisible(checkout, { ...filters, eventType: "checked_in" }, "America/Chicago", people)).toBe(false);
  });
});

describe("missing search function", () => {
  it("recognizes the schema-cache miss and ignores other errors", () => {
    expect(isMissingHistorySearch({ code: "PGRST202", message: "Could not find the function public.search_events" })).toBe(true);
    expect(isMissingHistorySearch({ message: "You cannot view history." })).toBe(false);
  });
});
