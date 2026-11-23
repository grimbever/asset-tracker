import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261123000000_init.sql", "utf8");
const setup = readFileSync("supabase/setup.sql", "utf8");

const tables = [...migration.matchAll(/create table if not exists public\.(\w+)/g)].map((match) => match[1]);

describe("schema", () => {
  it("keeps setup.sql in step with the migration", () => {
    expect(setup.startsWith("-- Asset Tracker setup")).toBe(true);
    expect(setup).toContain("Paste this whole file into the Supabase SQL Editor");
    expect(setup).toContain(migration);
  });

  it("scopes tenant tables by organization and enables row level security", () => {
    const shared = new Set(["plan_templates", "profiles", "organizations"]);
    expect(tables.length).toBeGreaterThan(20);
    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      if (shared.has(table)) continue;
      const body = tableBody(table);
      expect(body).toContain("organization_id uuid not null");
    }
  });

  it("prepares later workflows without building them", () => {
    for (const table of [
      "consumables",
      "kiosk_devices",
      "approval_policies",
      "supply_requests",
      "work_requests",
      "work_orders",
      "maintenance_schedules",
      "disposal_records",
      "procedures",
      "onboarding_kit_templates",
      "offboarding_checklists",
    ]) {
      expect(tables).toContain(table);
    }
    expect(migration).toContain("append-only");
    expect(migration).toContain("events_no_update");
    expect(migration).toContain("disposal_no_update");
  });

  it("stores plans and does not treat them as prices", () => {
    expect(migration).toContain("'internal'");
    expect(migration).toContain("Not a price and not enforced");
    expect(migration).toContain("Limits are stored and not enforced");
  });
});

function tableBody(name: string): string {
  const match = new RegExp(`create table if not exists public\\.${name} \\(([\\s\\S]*?)\\n\\);`).exec(migration);
  return match?.[1] ?? "";
}
