import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_SEEDS, can, canViewRegister } from "./permissions";

describe("role matrix", () => {
  it("gives admins every capability except the assigned-only restriction", () => {
    const admin = ROLE_SEEDS.find((role) => role.key === "admin");
    const all = Object.values(PERMISSIONS);
    expect(admin?.permissions).not.toContain(PERMISSIONS.assetsViewAssigned);
    expect(new Set(admin?.permissions)).toEqual(new Set(all.filter((item) => item !== PERMISSIONS.assetsViewAssigned)));
  });

  it("keeps field tech and auditor defined but not assignable", () => {
    const field = ROLE_SEEDS.find((role) => role.key === "field_tech");
    const auditor = ROLE_SEEDS.find((role) => role.key === "auditor");
    expect(field).toMatchObject({ active: false, assignable: false });
    expect(auditor).toMatchObject({ active: false, assignable: false });
    expect(field?.permissions).toContain(PERMISSIONS.assetsCheckout);
    expect(auditor?.permissions).toContain(PERMISSIONS.exportsFull);
  });

  it("does not assign the kiosk role to a person", () => {
    const kiosk = ROLE_SEEDS.find((role) => role.key === "kiosk");
    expect(kiosk).toMatchObject({ active: true, assignable: false });
    expect(kiosk?.permissions).toContain(PERMISSIONS.stockTake);
    expect(kiosk?.permissions).not.toContain(PERMISSIONS.assetsView);
  });

  it("lets viewers look and stops them from editing", () => {
    const viewer = ROLE_SEEDS.find((role) => role.key === "viewer")?.permissions ?? [];
    expect(canViewRegister(viewer)).toBe(true);
    expect(can(viewer, PERMISSIONS.assetsWrite)).toBe(false);
    expect(can(viewer, PERMISSIONS.orgManage)).toBe(false);
  });

  it("matches the role rows seeded in SQL", () => {
    const sql = readFileSync("supabase/migrations/20261123000000_init.sql", "utf8");
    const found = new Map<string, { name: string; active: boolean; assignable: boolean; permissions: string[] }>();
    const pattern =
      /seed_role\(p_id, '([^']+)', '([^']+)', '([^']*)', (true|false), (true|false), array\[([^\]]+)\]\)/g;
    for (const match of sql.matchAll(pattern)) {
      found.set(match[1], {
        name: match[2],
        active: match[4] === "true",
        assignable: match[5] === "true",
        permissions: match[6].split(",").map((part) => part.trim().replaceAll("'", "")),
      });
    }
    expect(found.size).toBe(ROLE_SEEDS.length);
    for (const role of ROLE_SEEDS) {
      const seeded = found.get(role.key);
      expect(seeded?.name).toBe(role.name);
      expect(seeded?.active).toBe(role.active);
      expect(seeded?.assignable).toBe(role.assignable);
      expect(seeded?.permissions.sort()).toEqual([...role.permissions].sort());
    }
  });
});
