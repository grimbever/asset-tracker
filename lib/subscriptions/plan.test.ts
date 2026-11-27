import { describe, expect, it } from "vitest";
import { PERMISSIONS, can, permissionsFor } from "@/lib/permissions";
import {
  annualizedCost,
  cardNumberWarning,
  displaySubscriptionStatus,
  dueReminderDay,
  nextRenewalDate,
  renewalAttentionDate,
} from "./plan";

describe("subscription renew rollover", () => {
  it("moves the renewal date forward one billing cycle", () => {
    expect(nextRenewalDate("2026-01-15", "monthly")).toBe("2026-02-15");
    expect(nextRenewalDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextRenewalDate("2026-11-23", "quarterly")).toBe("2027-02-23");
    expect(nextRenewalDate("2026-11-23", "yearly")).toBe("2027-11-23");
    expect(nextRenewalDate("2026-11-23", "multi_year")).toBe("2028-11-23");
    expect(nextRenewalDate("2026-11-23", "one_time")).toBeNull();
  });

  it("turns the price into a yearly amount and ignores one-time purchases", () => {
    expect(annualizedCost(10, "monthly")).toBe(120);
    expect(annualizedCost(30, "quarterly")).toBe(120);
    expect(annualizedCost(99, "yearly")).toBe(99);
    expect(annualizedCost(200, "multi_year")).toBe(100);
    expect(annualizedCost(500, "one_time")).toBe(0);
  });

  it("pulls the attention date forward by the cancellation notice", () => {
    expect(renewalAttentionDate("2026-12-31", 14)).toBe("2026-12-17");
    expect(renewalAttentionDate("2026-12-31", null)).toBe("2026-12-31");
    expect(displaySubscriptionStatus({ status: "active", renewsOn: "2026-11-20", noticeDays: 0, today: "2026-11-23" })).toBe("expired");
    expect(displaySubscriptionStatus({ status: "active", renewsOn: "2026-12-01", noticeDays: 14, today: "2026-11-23" })).toBe("pending_renewal");
    expect(displaySubscriptionStatus({ status: "cancelled", renewsOn: "2026-11-01", noticeDays: 0, today: "2026-11-23" })).toBe("cancelled");
  });

  it("sends the 30 and 7 day reminders once", () => {
    expect(dueReminderDay({ renewsOn: "2026-12-23", today: "2026-11-23", days: [30, 7], alreadySent: [] })).toBe(30);
    expect(dueReminderDay({ renewsOn: "2026-11-30", today: "2026-11-23", days: [30, 7], alreadySent: [] })).toBe(7);
    expect(dueReminderDay({ renewsOn: "2026-11-30", today: "2026-11-23", days: [30, 7], alreadySent: [7] })).toBeNull();
    expect(dueReminderDay({ renewsOn: "2026-12-01", today: "2026-11-23", days: [30], alreadySent: [] })).toBeNull();
  });

  it("refuses a full card number and allows a short label", () => {
    expect(cardNumberWarning("4242424242424242")).toMatch(/card number/);
    expect(cardNumberWarning("Visa ending 4242")).toBeNull();
  });
});

describe("subscription permissions", () => {
  it("lets admins and managers manage subscriptions and lets viewers look only", () => {
    expect(can(permissionsFor("admin"), PERMISSIONS.subscriptionsManage)).toBe(true);
    expect(can(permissionsFor("manager"), PERMISSIONS.subscriptionsManage)).toBe(true);
    expect(can(permissionsFor("manager"), PERMISSIONS.subscriptionsView)).toBe(true);
    expect(can(permissionsFor("viewer"), PERMISSIONS.subscriptionsView)).toBe(true);
    expect(can(permissionsFor("viewer"), PERMISSIONS.subscriptionsManage)).toBe(false);
    expect(can(permissionsFor("editor"), PERMISSIONS.subscriptionsView)).toBe(false);
    expect(can(permissionsFor("editor"), PERMISSIONS.subscriptionsManage)).toBe(false);
  });
});
