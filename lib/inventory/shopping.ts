export type ShoppingStatus = "open" | "ordered";

export function shoppingListHref(status?: ShoppingStatus | null): string {
  if (status === "open") return "/inventory/requests?status=open";
  if (status === "ordered") return "/inventory/requests?status=ordered";
  return "/inventory/requests";
}

export function shoppingCounts(requests: readonly { status: string }[]): { open: number; ordered: number } {
  return {
    open: requests.filter((request) => request.status === "open").length,
    ordered: requests.filter((request) => request.status === "ordered").length,
  };
}

export function canSeeShoppingList(permissions: readonly string[]): boolean {
  return permissions.includes("shopping.view") || permissions.includes("inventory.edit") || permissions.includes("inventory.manage");
}
