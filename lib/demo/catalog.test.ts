import { describe, expect, it } from "vitest";
import { demoAssets } from "./catalog";

describe("demo catalog", () => {
  it("includes a trailer, an impact driver, and a PAA dosing skid", () => {
    const assets = demoAssets(new Date("2026-11-23T12:00:00Z"));
    const names = assets.map((asset) => asset.name);
    expect(names).toContain("16 ft equipment trailer");
    expect(names).toContain("Impact driver");
    expect(names).toContain("PAA dosing skid");
    const skid = assets.find((asset) => asset.name === "PAA dosing skid");
    const pump = assets.find((asset) => asset.parentKey === "skid");
    expect(skid).toMatchObject({ type: "dosing_gear", checkoutAsUnit: true, customFields: { chemical: "PAA" } });
    expect(pump?.name).toBe("PAA feed pump");
    const trailer = assets.find((asset) => asset.type === "trailer");
    expect(trailer?.customFields?.vin).toBe("DEMO0000000000001");
    expect(trailer?.customFields?.registration_expiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
