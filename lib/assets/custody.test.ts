import { describe, expect, it } from "vitest";
import { assertCanCheckIn, assertCanCheckout, checkInPatch, checkoutPatch, parseCost } from "./custody";

describe("custody", () => {
  it("checks an available item out to a person and keeps its location", () => {
    expect(() => assertCanCheckout("available")).not.toThrow();
    expect(checkoutPatch("loc-1", { kind: "employee", employeeId: "emp-1", dueOn: "2026-12-01" })).toEqual({
      status: "checked_out",
      assignedEmployeeId: "emp-1",
      locationId: "loc-1",
      dueOn: "2026-12-01",
    });
  });

  it("checks an item out to a location", () => {
    expect(checkoutPatch("old", { kind: "location", locationId: "yard", dueOn: null })).toEqual({
      status: "checked_out",
      assignedEmployeeId: null,
      locationId: "yard",
      dueOn: null,
    });
  });

  it("refuses a second checkout and a closed item", () => {
    expect(() => assertCanCheckout("checked_out")).toThrow(/Already checked out/);
    expect(() => assertCanCheckout("disposed")).toThrow(/not checked out/);
    expect(() => assertCanCheckout("in_repair")).toThrow(/available/);
  });

  it("checks in with one clear result", () => {
    expect(() => assertCanCheckIn("checked_out")).not.toThrow();
    expect(() => assertCanCheckIn("available")).toThrow(/not checked out/);
    expect(checkInPatch("yard")).toEqual({
      status: "available",
      assignedEmployeeId: null,
      locationId: "yard",
      dueOn: null,
    });
  });

  it("parses cost and rejects junk", () => {
    expect(parseCost("")).toBeNull();
    expect(parseCost("12.345")).toBe(12.35);
    expect(() => parseCost("-1")).toThrow(/zero or more/);
  });
});
