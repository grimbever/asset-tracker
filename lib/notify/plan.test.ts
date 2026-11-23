import { describe, expect, it } from "vitest";
import { notificationRecipients, notifySkipReason, shouldEmail } from "./plan";

describe("notification plan", () => {
  it("emails check-out, check-in, and statuses flagged to notify", () => {
    expect(shouldEmail({ eventType: "checked_out" })).toBe(true);
    expect(shouldEmail({ eventType: "checked_in" })).toBe(true);
    expect(shouldEmail({ eventType: "status_changed", statusKey: "broken" })).toBe(true);
    expect(shouldEmail({ eventType: "status_changed", statusKey: "missing" })).toBe(true);
    expect(shouldEmail({ eventType: "status_changed", statusKey: "in_repair" })).toBe(true);
    expect(shouldEmail({ eventType: "status_changed", statusKey: "custom", statusNotify: true })).toBe(true);
    expect(shouldEmail({ eventType: "status_changed", statusKey: "retired" })).toBe(false);
    expect(shouldEmail({ eventType: "updated" })).toBe(false);
  });

  it("uses the org list when one is saved, otherwise the admins", () => {
    expect(notificationRecipients([" Pat@Example.com "], ["admin@example.com"])).toEqual(["pat@example.com"]);
    expect(notificationRecipients([], [" Admin@Example.com ", "admin@example.com"])).toEqual(["admin@example.com"]);
    expect(notificationRecipients([], [])).toEqual([]);
  });

  it("skips sending when Resend is not configured", () => {
    expect(notifySkipReason("", "assets@example.com", ["a@example.com"])).toMatch(/RESEND_API_KEY/);
    expect(notifySkipReason("re_key", "", ["a@example.com"])).toMatch(/NOTIFY_FROM/);
    expect(notifySkipReason("re_key", "assets@example.com", [])).toBe("no recipients");
    expect(notifySkipReason("re_key", "assets@example.com", ["a@example.com"])).toBeNull();
  });
});
