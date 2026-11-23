import type { AssetStatus } from "./types";

export type CheckoutTarget =
  | { kind: "employee"; employeeId: string; dueOn: string | null }
  | { kind: "location"; locationId: string; dueOn: string | null };

export type CustodyPatch = {
  status: AssetStatus;
  assignedEmployeeId: string | null;
  locationId: string | null;
  dueOn: string | null;
};

const CLOSED: ReadonlySet<AssetStatus> = new Set(["retired", "disposed", "destroyed"]);

export function assertCanCheckout(status: AssetStatus): void {
  if (status === "checked_out") throw new Error("Already checked out.");
  if (CLOSED.has(status)) throw new Error("Retired, disposed, and destroyed items stay on the register and are not checked out.");
  if (status !== "available") throw new Error("Check this item in, or mark it available, before checking it out.");
}

export function assertCanCheckIn(status: AssetStatus): void {
  if (status !== "checked_out") throw new Error("This item is not checked out.");
}

export function checkoutPatch(currentLocationId: string | null, target: CheckoutTarget): CustodyPatch {
  if (target.kind === "employee") {
    if (!target.employeeId) throw new Error("Choose a person.");
    return {
      status: "checked_out",
      assignedEmployeeId: target.employeeId,
      locationId: currentLocationId,
      dueOn: target.dueOn,
    };
  }
  if (!target.locationId) throw new Error("Choose a location.");
  return {
    status: "checked_out",
    assignedEmployeeId: null,
    locationId: target.locationId,
    dueOn: target.dueOn,
  };
}

export function checkInPatch(currentLocationId: string | null): CustodyPatch {
  return {
    status: "available",
    assignedEmployeeId: null,
    locationId: currentLocationId,
    dueOn: null,
  };
}

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseCost(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Cost must be a number that is zero or more.");
  return Math.round(amount * 100) / 100;
}
