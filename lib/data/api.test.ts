import { describe, expect, it } from "vitest";
import { assetPayload, kitCheckInIds, kitCheckoutIds, parseAsset } from "./api";
import type { AssetRecord } from "@/lib/assets/types";

describe("asset payload", () => {
  it("drops blank custom fields that do not belong to the type", () => {
    const payload = assetPayload({
      name: " Skid ",
      tagId: "",
      type: "dosing_gear",
      locationId: null,
      groupLabel: "",
      brand: "",
      model: "",
      serial: "",
      vendor: "",
      purchaseDate: "",
      cost: "",
      notes: "",
      parentAssetId: null,
      checkoutAsUnit: true,
      customFields: { chemical: " PAA ", vin: "nope", pump_model: "" },
    });
    expect(payload.name).toBe("Skid");
    expect(payload.custom_fields).toEqual({ chemical: "PAA" });
    expect(payload.cost).toBeNull();
  });

  it("parses a server row", () => {
    const asset = parseAsset({
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: "22222222-2222-4222-8222-222222222222",
      name: "Impact driver",
      tag_id: "AT-1002",
      type: "tool",
      status: "available",
      location_id: null,
      assigned_employee_id: null,
      due_on: null,
      group_label: null,
      brand: "Milwaukee",
      model: null,
      serial: null,
      vendor: null,
      purchase_date: null,
      cost: "179.00",
      notes: null,
      parent_asset_id: null,
      checkout_as_unit: false,
      custom_fields: {},
      created_at: "2026-11-23T00:00:00Z",
      updated_at: "2026-11-23T00:00:00Z",
    });
    expect(asset.cost).toBe(179);
    expect(asset.type).toBe("tool");
  });

  it("builds kit event ids only when the parent checks out as a unit", () => {
    expect(kitCheckoutIds(false, ["child"])).toEqual([]);
    const events = kitCheckoutIds(true, ["child"]);
    expect(events).toHaveLength(1);
    expect(events[0]?.asset_id).toBe("child");
    const parent = { checkout_as_unit: true, assigned_employee_id: "p", due_on: null, status: "checked_out" } as AssetRecord;
    const child = { ...parent, id: "c", status: "checked_out" } as AssetRecord;
    const other = { ...parent, id: "o", assigned_employee_id: "someone-else" } as AssetRecord;
    expect(kitCheckInIds(parent, [child, other]).map((item) => item.asset_id)).toEqual(["c"]);
  });
});
