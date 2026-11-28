export const STOCK_UNITS = [
  { id: "each", label: "Each" },
  { id: "box", label: "Box" },
  { id: "case", label: "Case" },
  { id: "pack", label: "Pack" },
] as const;

export type StockMove = "receive" | "use" | "correction";

export function applyStockMove(onHand: number, move: StockMove, amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a quantity of zero or more.");
  if (move === "correction") return roundQty(amount);
  if (amount <= 0) throw new Error("Enter a quantity greater than zero.");
  if (move === "receive") return roundQty(onHand + amount);
  if (onHand < amount) throw new Error("That is more than you have on hand.");
  return roundQty(onHand - amount);
}

export function crossedReorder(before: number, after: number, reorderPoint: number): boolean {
  return before > reorderPoint && after <= reorderPoint;
}

export function isLowStock(onHand: number, reorderPoint: number): boolean {
  return onHand <= reorderPoint;
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}
