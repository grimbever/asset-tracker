import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261123000000_init.sql", "utf8");
const milestone2 = readFileSync("supabase/migrations/20261124000000_milestone2.sql", "utf8");
const historyLinks = readFileSync("supabase/migrations/20261125000000_history_links.sql", "utf8");
const inviteSent = readFileSync("supabase/migrations/20261127000000_invite_sent.sql", "utf8");
const statusChange = readFileSync("supabase/migrations/20261127000000_status_change.sql", "utf8");
const historyLabels = readFileSync("supabase/migrations/20261128000000_history_labels.sql", "utf8");
const subscriptions = readFileSync("supabase/migrations/20261129000000_subscriptions.sql", "utf8");
const companySetup = readFileSync("supabase/migrations/20261130000000_company_setup.sql", "utf8");
const setup = readFileSync("supabase/setup.sql", "utf8");

const tables = [...migration.matchAll(/create table if not exists public\.(\w+)/g)].map((match) => match[1]);

describe("schema", () => {
  it("keeps setup.sql in step with the migration", () => {
    expect(setup.startsWith("-- Asset Tracker setup")).toBe(true);
    expect(setup).toContain("Paste this whole file into the Supabase SQL Editor");
    expect(setup).toContain(migration);
    expect(setup).toContain(milestone2);
    expect(setup).toContain(historyLinks);
    expect(setup).toContain(inviteSent);
    expect(inviteSent).toContain("function public.log_invite_sent");
    expect(inviteSent).toContain("'invite_sent'");
    expect(setup).toContain(statusChange);
    expect(statusChange).toContain("key = 'retired'");
    expect(statusChange).toContain("status = 'disposed'");
    expect(statusChange).not.toContain("('retired', 'Retired'");
    expect(setup).toContain(historyLabels);
    expect(historyLabels).toContain("function public.resolve_history_value");
    expect(historyLabels).toContain("Unknown (deleted)");
    expect(setup).toContain(subscriptions);
    expect(subscriptions).toContain("subscriptions.manage");
    expect(subscriptions).toContain("function public.renew_subscription");
    expect(subscriptions).toContain("subscription_secrets");
    expect(subscriptions).toContain("from public.subscription_categories c");
    expect(subscriptions).toContain("Pending renewal");
    expect(setup.indexOf(historyLabels)).toBeLessThan(setup.indexOf(subscriptions));
    expect(setup).toContain(companySetup);
    expect(companySetup).toContain("function public.save_company_settings");
    expect(companySetup).toContain("You cannot remove your own access to company setup.");
    expect(companySetup).toContain("Keep company setup on at least one active role.");
    expect(setup.indexOf(subscriptions)).toBeLessThan(setup.indexOf(companySetup));
    expect(historyLinks).toContain("related_employee_id");
    expect(historyLinks).toContain("function public.search_events");
    expect(historyLinks).toContain("ilike");
    expect(historyLinks).toContain("event_mentions_employee");
    expect(historyLinks).toContain("grant execute on function public.event_mentions_employee(public.events, uuid) to authenticated");
    expect(historyLinks).toContain("grant execute on function public.event_search_text(public.events) to authenticated");
    expect(historyLinks).toContain("grant execute on function public.uuid_or_null(text) to authenticated");
    expect(historyLinks).toContain("grant execute on function public.derive_event_employee(uuid, text, uuid, text, jsonb, jsonb, jsonb) to authenticated");
    expect(milestone2).toContain("add column if not exists title");
    expect(milestone2).toContain("settings.manage");
    expect(milestone2).toContain("archived_at");
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

  it("creates SQL helper functions only after the tables they read", () => {
    const memberFn = migration.indexOf("function public.is_org_member");
    const permissionFn = migration.indexOf("function public.has_org_permission");
    const memberships = migration.indexOf("create table if not exists public.memberships");
    const permissions = migration.indexOf("create table if not exists public.role_permissions");
    const assetState = migration.indexOf("function public.asset_state");
    const assets = migration.indexOf("create table if not exists public.assets");
    expect(memberFn).toBeGreaterThan(memberships);
    expect(permissionFn).toBeGreaterThan(permissions);
    expect(permissionFn).toBeGreaterThan(memberships);
    expect(assetState).toBeGreaterThan(assets);
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
