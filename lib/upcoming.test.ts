import { describe, expect, it } from "vitest";
import { bucketForDays, collectUpcoming, groupUpcoming } from "./upcoming";

const now = new Date("2026-11-23T18:00:00Z");
const zone = "America/Chicago";

describe("upcoming buckets", () => {
  it("puts overdue first and keeps later windows exclusive", () => {
    expect(bucketForDays(-1)).toBe("overdue");
    expect(bucketForDays(0)).toBe("7");
    expect(bucketForDays(7)).toBe("7");
    expect(bucketForDays(8)).toBe("30");
    expect(bucketForDays(30)).toBe("30");
    expect(bucketForDays(31)).toBe("90");
    expect(bucketForDays(90)).toBe("90");
    expect(bucketForDays(91)).toBe("180");
    expect(bucketForDays(180)).toBe("180");
    expect(bucketForDays(181)).toBeNull();
  });

  it("collects checkout returns, calibration, registration, maintenance, and leaving dates", () => {
    const items = collectUpcoming(
      {
        assets: [
          {
            id: "trailer",
            name: "Trailer",
            status: "available",
            due_on: "2026-11-20",
            archived_at: null,
            custom_fields: { registration_expiry: "2026-12-20", last_calibration: "2026-10-01" },
          },
          {
            id: "skid",
            name: "PAA dosing skid",
            status: "checked_out",
            due_on: "2026-11-25",
            archived_at: null,
            custom_fields: { next_calibration: "2027-02-01" },
          },
          {
            id: "old",
            name: "Retired pump",
            status: "checked_out",
            due_on: "2026-11-24",
            archived_at: "2026-11-01",
            custom_fields: { next_calibration: "2026-11-24" },
          },
        ],
        people: [
          { id: "pat", name: "Pat", termination_date: "2026-11-22", archived_at: null },
          { id: "gone", name: "Gone", termination_date: "2026-11-22", archived_at: "2026-01-01" },
        ],
        fields: [
          { key: "registration_expiry", label: "Registration expiry", kind: "date", archived_at: null },
          { key: "last_calibration", label: "Last calibration", kind: "date", archived_at: null },
          { key: "next_calibration", label: "Next calibration", kind: "date", archived_at: null },
        ],
        maintenance: [
          {
            id: "m1",
            title: "Annual service",
            due_on: "2027-05-01",
            completed_at: null,
            asset_id: "trailer",
            assetName: "Trailer",
            assetArchived: false,
          },
          {
            id: "m2",
            title: "Done already",
            due_on: "2026-11-24",
            completed_at: "2026-11-01",
            asset_id: "trailer",
            assetName: "Trailer",
            assetArchived: false,
          },
        ],
      },
      zone,
      now,
    );
    const byId = Object.fromEntries(items.map((item) => [item.id, item.bucket]));
    expect(byId["leave-pat"]).toBe("overdue");
    expect(byId["due-skid"]).toBe("7");
    expect(byId["field-trailer-registration_expiry"]).toBe("30");
    expect(byId["field-skid-next_calibration"]).toBe("90");
    expect(byId["maint-m1"]).toBe("180");
    expect(byId["field-trailer-last_calibration"]).toBeUndefined();
    expect(byId["due-trailer"]).toBeUndefined();
    expect(byId["due-old"]).toBeUndefined();
    expect(byId["leave-gone"]).toBeUndefined();
    expect(byId["maint-m2"]).toBeUndefined();
    expect(items.find((item) => item.id === "leave-pat")?.what).toMatch(/assets to recover/);
    expect(groupUpcoming(items).overdue.map((item) => item.id)).toEqual(["leave-pat"]);
  });
});
