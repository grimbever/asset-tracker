import { describe, expect, it } from "vitest";
import { warrantyExpiringSoon, warrantyReminderDay } from "./reminders";

describe("warranty reminders", () => {
  it("matches the default 30 and 7 day notices once each", () => {
    expect(warrantyReminderDay("2026-12-28", "2026-11-28", [30, 7])).toBe(30);
    expect(warrantyReminderDay("2026-12-05", "2026-11-28", [30, 7])).toBe(7);
    expect(warrantyReminderDay("2026-12-05", "2026-11-28", [30, 7], [7])).toBeNull();
    expect(warrantyReminderDay("2026-12-20", "2026-11-28", [30, 7])).toBeNull();
  });

  it("includes overdue warranties in the expiring-soon list", () => {
    expect(warrantyExpiringSoon("2026-12-20", "2026-11-28", 30)).toBe(true);
    expect(warrantyExpiringSoon("2026-11-01", "2026-11-28", 30)).toBe(true);
    expect(warrantyExpiringSoon("2027-02-01", "2026-11-28", 30)).toBe(false);
    expect(warrantyExpiringSoon(null, "2026-11-28", 30)).toBe(false);
  });
});
