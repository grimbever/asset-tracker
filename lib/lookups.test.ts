import { describe, expect, it } from "vitest";
import { statusCards } from "./lookups";

describe("status cards", () => {
  it("shows every current status, including missing and in repair at zero", () => {
    const cards = statusCards(
      [
        { key: "available", label: "Available", position: 10 },
        { key: "checked_out", label: "Checked out", position: 20 },
        { key: "in_repair", label: "In repair", position: 30, needsAttention: true },
        { key: "broken", label: "Broken", position: 40, needsAttention: true },
        { key: "missing", label: "Missing", position: 50, needsAttention: true },
        { key: "old", label: "Old", position: 60, archivedAt: "2026-11-01" },
      ],
      [{ status: "available" }, { status: "broken" }],
    );
    expect(cards.map((card) => card.key)).toEqual(["available", "checked_out", "in_repair", "broken", "missing"]);
    expect(cards.find((card) => card.key === "missing")?.count).toBe(0);
    expect(cards.find((card) => card.key === "in_repair")?.count).toBe(0);
    expect(cards.find((card) => card.key === "broken")?.count).toBe(1);
  });
});
