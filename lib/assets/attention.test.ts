import { describe, expect, it } from "vitest";
import { attentionForAsset, daysUntil } from "./attention";
import type { AssetRecord } from "./types";

const now = new Date("2026-11-23T18:00:00Z");

function asset(overrides: Partial<AssetRecord>): AssetRecord {
  return {
    id: "a",
    organization_id: "o",
    name: "Trailer",
    tag_id: "AT-1001",
    type: "trailer",
    status: "available",
    location_id: null,
    assigned_employee_id: null,
    due_on: null,
    group_label: null,
    brand: null,
    model: null,
    serial: null,
    vendor: null,
    purchase_date: null,
    cost: null,
    notes: null,
    parent_asset_id: null,
    checkout_as_unit: false,
    custom_fields: {},
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

describe("attention", () => {
  it("uses the organization timezone for the calendar day", () => {
    expect(daysUntil("2026-11-23", "America/Chicago", now)).toBe(0);
    expect(daysUntil("2026-11-22", "America/Chicago", now)).toBe(-1);
  });

  it("flags overdue checkouts and upcoming registration", () => {
    const items = attentionForAsset(
      asset({
        status: "checked_out",
        due_on: "2026-11-20",
        custom_fields: { registration_expiry: "2026-12-01" },
      }),
      "America/Chicago",
      now,
    );
    expect(items.map((item) => item.kind)).toEqual(["overdue_checkout", "registration"]);
  });
});
