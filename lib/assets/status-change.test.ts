import { describe, expect, it } from "vitest";
import {
  changeableStatuses,
  showReturnToService,
  statusChangeBlocker,
  statusSaveLabel,
} from "./status-change";

const statuses = [
  { key: "available", label: "Available", position: 10 },
  { key: "checked_out", label: "Checked out", position: 20 },
  { key: "in_repair", label: "In repair", position: 30 },
  { key: "broken", label: "Broken", position: 40 },
  { key: "missing", label: "Missing", position: 50 },
  { key: "retired", label: "Retired", position: 60, archivedAt: "2026-11-27T00:00:00Z" },
  { key: "disposed", label: "Disposed", position: 70 },
  { key: "destroyed", label: "Destroyed", position: 80 },
];

describe("change status", () => {
  it("offers every other active status, including available, and hides retired and checked out", () => {
    expect(changeableStatuses(statuses, "broken").map((status) => status.key)).toEqual([
      "available",
      "in_repair",
      "missing",
      "disposed",
      "destroyed",
    ]);
    expect(changeableStatuses(statuses, "available").map((status) => status.key)).not.toContain("available");
    expect(changeableStatuses(statuses, "in_repair").map((status) => status.key)).toContain("broken");
  });

  it("offers return to service only while the item is down, not at end of life", () => {
    expect(showReturnToService("in_repair")).toBe(true);
    expect(showReturnToService("broken")).toBe(true);
    expect(showReturnToService("missing")).toBe(true);
    expect(showReturnToService("available")).toBe(false);
    expect(showReturnToService("checked_out")).toBe(false);
    expect(showReturnToService("disposed")).toBe(false);
    expect(showReturnToService("destroyed")).toBe(false);
  });

  it("requires a note and a confirmation before disposed or destroyed", () => {
    expect(statusChangeBlocker({ next: "available", note: "", confirmed: false })).toBeNull();
    expect(statusChangeBlocker({ next: "in_repair", note: "", confirmed: false })).toBeNull();
    expect(statusChangeBlocker({ next: "disposed", note: "", confirmed: true })).toMatch(/note/);
    expect(statusChangeBlocker({ next: "destroyed", note: "Crushed", confirmed: false })).toMatch(/Confirm/);
    expect(statusChangeBlocker({ next: "disposed", note: "Sold", confirmed: true })).toBeNull();
    expect(statusSaveLabel("disposed")).toBe("Confirm disposed");
    expect(statusSaveLabel("destroyed")).toBe("Confirm destroyed");
    expect(statusSaveLabel("available")).toBe("Mark available");
  });
});
