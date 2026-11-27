export const BILLING_CYCLES = [
  { id: "monthly", label: "Monthly", months: 1 },
  { id: "quarterly", label: "Quarterly", months: 3 },
  { id: "yearly", label: "Yearly", months: 12 },
  { id: "multi_year", label: "Multi-year", months: 24 },
  { id: "one_time", label: "One-time", months: 0 },
] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number]["id"];

export const SUBSCRIPTION_STATUSES = [
  { id: "active", label: "Active" },
  { id: "pending_renewal", label: "Pending renewal" },
  { id: "cancelled", label: "Cancelled" },
  { id: "expired", label: "Expired" },
] as const;

export const DEFAULT_REMINDER_DAYS = [30, 7] as const;

export function nextRenewalDate(renewsOn: string, cycle: string): string | null {
  const months = BILLING_CYCLES.find((item) => item.id === cycle)?.months ?? 0;
  if (months <= 0) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(renewsOn);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  const result = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(day, lastDay)));
  return result.toISOString().slice(0, 10);
}

export function annualizedCost(cost: number | null, cycle: string): number {
  if (cost === null || Number.isNaN(cost)) return 0;
  if (cycle === "monthly") return cost * 12;
  if (cycle === "quarterly") return cost * 4;
  if (cycle === "yearly") return cost;
  if (cycle === "multi_year") return cost / 2;
  return 0;
}

export function renewalAttentionDate(renewsOn: string | null, noticeDays: number | null): string | null {
  if (!renewsOn) return null;
  const days = noticeDays && noticeDays > 0 ? Math.floor(noticeDays) : 0;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(renewsOn);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - days));
  return date.toISOString().slice(0, 10);
}

export function displaySubscriptionStatus(input: {
  status: string;
  renewsOn: string | null;
  noticeDays: number | null;
  today: string;
}): string {
  if (input.status === "cancelled") return "cancelled";
  if (input.renewsOn && input.renewsOn < input.today) return "expired";
  const attention = renewalAttentionDate(input.renewsOn, input.noticeDays);
  if (input.renewsOn && attention && attention <= input.today && input.renewsOn >= input.today) return "pending_renewal";
  return input.status === "expired" ? "expired" : "active";
}

export function statusLabel(status: string): string {
  return SUBSCRIPTION_STATUSES.find((item) => item.id === status)?.label ?? status;
}

export function cycleLabel(cycle: string): string {
  return BILLING_CYCLES.find((item) => item.id === cycle)?.label ?? cycle;
}

/** Block a full card number. A label such as "Visa ending 4242" is allowed. */
export function cardNumberWarning(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 13 && digits.length <= 19) {
    return "Don't store a card number. Use a short label such as Visa ending 4242.";
  }
  return null;
}

export function dueReminderDay(input: { renewsOn: string; today: string; days: readonly number[]; alreadySent: readonly number[] }): number | null {
  const start = Date.parse(`${input.today}T00:00:00Z`);
  const end = Date.parse(`${input.renewsOn}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const until = Math.round((end - start) / 86_400_000);
  if (!input.days.includes(until)) return null;
  if (input.alreadySent.includes(until)) return null;
  return until;
}
