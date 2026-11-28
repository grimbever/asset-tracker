import { describe, expect, it } from "vitest";
import { canSeeShoppingList, shoppingCounts, shoppingListHref } from "./shopping";

describe("shopping list cards", () => {
  it("counts requests that are not ordered separately from ones on order", () => {
    expect(shoppingCounts([
      { status: "open" },
      { status: "open" },
      { status: "ordered" },
      { status: "fulfilled" },
      { status: "closed" },
    ])).toEqual({ open: 2, ordered: 1 });
    expect(shoppingListHref("open")).toBe("/inventory/requests?status=open");
    expect(shoppingListHref("ordered")).toBe("/inventory/requests?status=ordered");
    expect(shoppingListHref(null)).toBe("/inventory/requests");
  });

  it("shows the list to shopping view, and still to people who can update it", () => {
    expect(canSeeShoppingList(["shopping.view"])).toBe(true);
    expect(canSeeShoppingList(["inventory.edit"])).toBe(true);
    expect(canSeeShoppingList(["inventory.view"])).toBe(false);
    expect(canSeeShoppingList(["kiosk.use"])).toBe(false);
  });
});
