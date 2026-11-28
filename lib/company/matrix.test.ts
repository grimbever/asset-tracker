import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_SEEDS } from "@/lib/permissions";
import {
  ACCESS_MODULES,
  applyLevel,
  checkoutDueBlocker,
  defaultDueDate,
  formatTag,
  inferLevel,
  isLowStock,
  moduleById,
  modulePageAllowed,
  normalizeCompanySettings,
  previewRoleChange,
  seededLevel,
  DEFAULT_COMPANY_SETTINGS,
} from "./matrix";

const assets = moduleById("assets")!;
const settings = moduleById("settings")!;
const subscriptions = moduleById("subscriptions")!;
const kiosk = moduleById("kiosk")!;

describe("company permission matrix", () => {
  it("shows the current seeds as view, edit, or manage", () => {
    expect(seededLevel("viewer", "assets")).toBe("view");
    expect(seededLevel("editor", "assets")).toBe("edit");
    expect(seededLevel("admin", "subscriptions")).toBe("manage");
    expect(seededLevel("viewer", "subscriptions")).toBe("view");
    expect(seededLevel("editor", "subscriptions")).toBe("none");
    expect(seededLevel("admin", "settings")).toBe("manage");
    expect(seededLevel("manager", "settings")).toBe("none");
    expect(seededLevel("manager", "users")).toBe("none");
    expect(seededLevel("field_tech", "assets")).toBe("edit");
    expect(seededLevel("auditor", "reports")).toBe("manage");
  });

  it("replaces only the permissions for that module", () => {
    const viewer = ROLE_SEEDS.find((role) => role.key === "viewer")!.permissions;
    const next = applyLevel(viewer, assets, "none");
    expect(next).not.toContain(PERMISSIONS.assetsView);
    expect(next).not.toContain(PERMISSIONS.assetsScan);
    expect(next).toContain(PERMISSIONS.subscriptionsView);
    expect(next).toContain(PERMISSIONS.reportsRun);
    const edited = applyLevel(next, subscriptions, "manage");
    expect(edited).toContain(PERMISSIONS.subscriptionsManage);
    expect(edited).toContain(PERMISSIONS.subscriptionsView);
    expect(edited).not.toContain(PERMISSIONS.assetsView);
  });

  it("keeps assigned-only access when the asset cell is saved again", () => {
    const field = ROLE_SEEDS.find((role) => role.key === "field_tech")!.permissions;
    const next = applyLevel(field, assets, inferLevel(field, assets));
    expect(next).toContain(PERMISSIONS.assetsViewAssigned);
    expect(next).toContain(PERMISSIONS.assetsCheckout);
    expect(next).toContain(PERMISSIONS.workOrdersComplete);
  });

  it("refuses a disabled module", () => {
    expect(() => applyLevel([], kiosk, "manage")).toThrow(/not available/);
  });

  it("uses the new permission once the database has it, and the old rule until then", () => {
    expect(
      modulePageAllowed({
        ready: false,
        permissions: [PERMISSIONS.assetsView],
        required: [PERMISSIONS.peopleView],
        legacy: [PERMISSIONS.assetsView],
      }),
    ).toBe(true);
    expect(
      modulePageAllowed({
        ready: true,
        permissions: [PERMISSIONS.assetsView],
        required: [PERMISSIONS.peopleView, PERMISSIONS.peopleManage],
        legacy: [PERMISSIONS.assetsView],
      }),
    ).toBe(false);
    expect(
      modulePageAllowed({
        ready: true,
        permissions: [PERMISSIONS.peopleView],
        required: [PERMISSIONS.peopleView],
        legacy: [PERMISSIONS.assetsView],
      }),
    ).toBe(true);
  });

  it("blocks a lockout of company setup", () => {
    const admin = { id: "admin", active: true, permissions: [PERMISSIONS.settingsManage, PERMISSIONS.orgManage] };
    const manager = { id: "manager", active: true, permissions: [PERMISSIONS.assetsView] };
    expect(
      previewRoleChange({
        roles: [admin, manager],
        actorRoleId: "admin",
        roleId: "admin",
        nextPermissions: applyLevel(admin.permissions, settings, "none"),
      }),
    ).toMatch(/at least one active role/);
    expect(
      previewRoleChange({
        roles: [admin, { ...manager, permissions: [PERMISSIONS.settingsManage] }],
        actorRoleId: "admin",
        roleId: "admin",
        nextPermissions: applyLevel(admin.permissions, settings, "none"),
      }),
    ).toMatch(/own access/);
    expect(
      previewRoleChange({
        roles: [admin, { ...manager, permissions: [PERMISSIONS.settingsManage] }],
        actorRoleId: "admin",
        roleId: "manager",
        nextPermissions: [],
      }),
    ).toBeNull();
    expect(
      previewRoleChange({
        roles: [admin, manager],
        actorRoleId: "admin",
        roleId: "manager",
        nextActive: false,
        assigned: true,
      }),
    ).toMatch(/assigned/);
    expect(
      previewRoleChange({
        roles: [admin],
        actorRoleId: "admin",
        roleId: "admin",
        nextActive: false,
        pendingInvites: true,
      }),
    ).toMatch(/open invite/);
  });
});

describe("company setting rules", () => {
  it("keeps the defaults that match today's behavior", () => {
    const parsed = normalizeCompanySettings(DEFAULT_COMPANY_SETTINGS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.checkoutDueRequired).toBe(false);
    expect(parsed.value.defaultCheckoutDays).toBe(0);
    expect(parsed.value.tagPrefix).toBe("AT");
    expect(parsed.value.inviteExpiryDays).toBe(14);
    expect(parsed.value.upcomingDays).toEqual([7, 30, 90, 180]);
    expect(parsed.value.requireNoteBroken).toBe(false);
    expect(parsed.value.notifyCheckout).toBe(true);
  });

  it("rejects a bad color, prefix, and overlapping windows", () => {
    expect(normalizeCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, accentColor: "green" }).ok).toBe(false);
    expect(normalizeCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, tagPrefix: "AT-" }).ok).toBe(false);
    expect(normalizeCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, logoUrl: "http://cdn.example/logo.png" }).ok).toBe(false);
    expect(normalizeCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, upcomingDays: [30, 7] }).ok).toBe(false);
    const emails = normalizeCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, notifyEmails: " Pat@Example.com, pat@example.com " });
    expect(emails.ok && emails.value.notifyEmails).toBe("pat@example.com");
  });

  it("formats tags and checkout due dates", () => {
    expect(formatTag("at", 1001)).toBe("AT-1001");
    expect(formatTag("shop!", 12)).toBe("SHOP-12");
    expect(defaultDueDate("2026-11-27", 0)).toBe("");
    expect(defaultDueDate("2026-11-27", 14)).toBe("2026-12-11");
    expect(checkoutDueBlocker("", true)).toMatch(/required/);
    expect(checkoutDueBlocker("", false)).toBeNull();
    expect(isLowStock(1, 1)).toBe(true);
    expect(isLowStock(2, 1)).toBe(false);
  });
});

describe("module list", () => {
  it("keeps future modules visible but disabled", () => {
    expect(ACCESS_MODULES.find((module) => module.id === "kiosk")?.enabled).toBe(false);
    expect(ACCESS_MODULES.find((module) => module.id === "work_orders")?.enabled).toBe(false);
    expect(ACCESS_MODULES.filter((module) => module.enabled).length).toBeGreaterThan(8);
  });
});
