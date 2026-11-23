import { describe, expect, it } from "vitest";
import { canHardDelete, fieldChanges, readFieldChanges } from "./audit";
import { PERMISSIONS, can, permissionsFor } from "./permissions";

describe("audit log", () => {
  it("records who changed which field, and skips unchanged fields", () => {
    const changes = fieldChanges(
      { name: "Impact driver", title: null, notes: "Demo" },
      { name: "Impact driver", title: "Shop", notes: "" },
    );
    expect(changes).toEqual([
      { field: "notes", before: "Demo", after: null },
      { field: "title", before: null, after: "Shop" },
    ]);
  });

  it("reads stored before/after values", () => {
    expect(readFieldChanges({ changes: [{ field: "status", before: "available", after: "missing" }] })).toEqual([
      { field: "status", before: "available", after: "missing" },
    ]);
    expect(readFieldChanges({})).toEqual([]);
  });

  it("refuses to hard-delete a record that history or another row still uses", () => {
    expect(canHardDelete({ events: 0, assets: 0, children: 0, photos: 0 })).toBe(true);
    expect(canHardDelete({ events: 1, assets: 0, children: 0, photos: 0 })).toBe(false);
    expect(canHardDelete({ events: 0, assets: 2, children: 0, photos: 0 })).toBe(false);
  });
});

describe("super user permission", () => {
  it("lets an admin manage people and settings, and stops an editor", () => {
    expect(can(permissionsFor("admin"), PERMISSIONS.settingsManage)).toBe(true);
    expect(can(permissionsFor("admin"), PERMISSIONS.peopleManage)).toBe(true);
    expect(can(permissionsFor("editor"), PERMISSIONS.settingsManage)).toBe(false);
    expect(can(permissionsFor("editor"), PERMISSIONS.peopleManage)).toBe(false);
    expect(can(permissionsFor("manager"), PERMISSIONS.settingsManage)).toBe(false);
  });
});
