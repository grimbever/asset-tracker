import { describe, expect, it } from "vitest";
import { applyStockMove, crossedReorder, isLowStock } from "./stock";

describe("consumable stock", () => {
  it("receives, uses, and corrects a count", () => {
    expect(applyStockMove(4, "receive", 6)).toBe(10);
    expect(applyStockMove(10, "use", 3)).toBe(7);
    expect(applyStockMove(7, "correction", 12)).toBe(12);
    expect(() => applyStockMove(2, "use", 5)).toThrow(/on hand/);
  });

  it("alerts only when stock crosses the reorder point downward", () => {
    expect(crossedReorder(8, 5, 5)).toBe(true);
    expect(crossedReorder(5, 4, 5)).toBe(false);
    expect(crossedReorder(3, 9, 5)).toBe(false);
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });
});
