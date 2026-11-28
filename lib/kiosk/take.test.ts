import { describe, expect, it } from "vitest";
import { takeQuantity } from "./take";

describe("kiosk take quantity", () => {
  it("accepts a positive whole number up to what is on hand", () => {
    expect(takeQuantity("1", 4)).toEqual({ ok: true, quantity: 1 });
    expect(takeQuantity("4", 4)).toEqual({ ok: true, quantity: 4 });
  });

  it("rejects blanks, fractions, zero, and more than on hand", () => {
    expect(takeQuantity("", 4).ok).toBe(false);
    expect(takeQuantity("0", 4).ok).toBe(false);
    expect(takeQuantity("1.5", 4).ok).toBe(false);
    expect(takeQuantity("5", 4).ok).toBe(false);
  });
});
