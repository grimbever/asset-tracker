import { describe, expect, it } from "vitest";
import { historyNames, presentHistoryChange } from "./display";
import { eventMatchesQuery, type HistoryHit } from "./query";
import type { AssetEvent } from "@/lib/assets/events";

const BARBARA = "f3d0a6ae-5891-4b6d-8b6a-85815808469c";
const MISSING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP = "66666666-6666-4666-8666-666666666666";
const KIT = "55555555-5555-4555-8555-555555555555";

const names = historyNames({
  people: [{ id: BARBARA, name: "Barbara (archived)" }],
  locations: [{ id: SHOP, name: "Shop" }],
  assets: [{ id: KIT, name: "PAA dosing skid" }],
  statuses: [
    { id: "status-available", key: "available", label: "Available" },
    { id: "status-out", key: "checked_out", label: "Checked out" },
  ],
  types: [{ id: "type-tool", key: "tool", label: "Tool" }],
});

describe("history display", () => {
  it("turns checkout ids and status slugs into names and labels", () => {
    const assigned = presentHistoryChange(
      { field: "assigned_employee_id", before: null, after: BARBARA },
      names,
    );
    const status = presentHistoryChange(
      { field: "status", before: "available", after: "checked_out" },
      names,
    );
    expect(assigned).toEqual({ label: "Assigned to", before: "—", after: "Barbara (archived)" });
    expect(status).toEqual({ label: "Status", before: "Available", after: "Checked out" });
    expect(JSON.stringify(assigned)).not.toContain(BARBARA);
    expect(JSON.stringify(status)).not.toContain("checked_out");
  });

  it("names locations, kits, and types, and hides a missing record", () => {
    expect(presentHistoryChange({ field: "location_id", before: null, after: SHOP }, names).after).toBe("Shop");
    expect(presentHistoryChange({ field: "parent_asset_id", before: null, after: KIT }, names)).toEqual({
      label: "Part of",
      before: "—",
      after: "PAA dosing skid",
    });
    expect(presentHistoryChange({ field: "type", before: "tool", after: "trailer" }, names).before).toBe("Tool");
    expect(presentHistoryChange({ field: "assigned_employee_id", before: MISSING, after: null }, names).before).toBe(
      "Unknown (deleted)",
    );
  });

  it("lets search match the readable status and the person's name", () => {
    const event: AssetEvent = {
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: "22222222-2222-4222-8222-222222222222",
      subject_type: "asset",
      subject_id: KIT,
      event_type: "checked_out",
      occurred_at: "2026-11-23T18:00:00.000Z",
      actor_user_id: null,
      actor_name: "Jonathan",
      notes: null,
      from_state: null,
      to_state: null,
      payload: {
        changes: [
          { field: "assigned_employee_id", before: null, after: BARBARA },
          { field: "status", before: "available", after: "checked_out" },
        ],
      },
    };
    const hit: HistoryHit = { event, names };
    expect(eventMatchesQuery(hit, "Barbara")).toBe(true);
    expect(eventMatchesQuery(hit, "Checked out")).toBe(true);
    expect(eventMatchesQuery(hit, "Assigned to")).toBe(true);
  });
});
