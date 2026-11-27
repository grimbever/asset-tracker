import { describe, expect, it } from "vitest";
import type { AssetRecord } from "@/lib/assets/types";
import { assetsHref, filterAssets } from "./filter";

const PERSON = "33333333-3333-4333-8333-333333333333";
const SHOP = "66666666-6666-4666-8666-666666666666";
const YARD = "77777777-7777-4777-8777-777777777777";

function asset(partial: Partial<AssetRecord> & Pick<AssetRecord, "id" | "name">): AssetRecord {
  return {
    organization_id: "22222222-2222-4222-8222-222222222222",
    tag_id: "AT-1",
    type: "tool",
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
    archived_at: null,
    created_at: "2026-11-23T00:00:00Z",
    updated_at: "2026-11-23T00:00:00Z",
    ...partial,
  };
}

const assets = [
  asset({ id: "a", name: "Impact driver", tag_id: "AT-1002", assigned_employee_id: PERSON, location_id: SHOP, status: "checked_out" }),
  asset({ id: "b", name: "Trailer", tag_id: "AT-1001", location_id: YARD, status: "available" }),
  asset({ id: "c", name: "Old pump", tag_id: "AT-1003", assigned_employee_id: PERSON, location_id: SHOP, archived_at: "2026-11-01T00:00:00Z" }),
];

describe("asset list filters", () => {
  it("limits the list to one person or one location and hides archived rows", () => {
    expect(filterAssets(assets, { query: "", status: "all", showArchived: false, personId: PERSON, locationId: null, locationNames: {} }).map((item) => item.id)).toEqual(["a"]);
    expect(filterAssets(assets, { query: "", status: "all", showArchived: false, personId: null, locationId: SHOP, locationNames: {} }).map((item) => item.id)).toEqual(["a"]);
    expect(filterAssets(assets, { query: "", status: "all", showArchived: true, personId: PERSON, locationId: SHOP, locationNames: {} }).map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("builds a removable filter link", () => {
    expect(assetsHref({ personId: PERSON })).toBe(`/assets?person=${PERSON}`);
    expect(assetsHref({ locationId: SHOP })).toBe(`/assets?location=${SHOP}`);
    expect(assetsHref({ personId: PERSON, locationId: null })).toBe(`/assets?person=${PERSON}`);
    expect(assetsHref({})).toBe("/assets");
  });
});
