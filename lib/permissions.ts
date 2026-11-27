/**
 * Capability keys and the built-in role matrix.
 * The database is the source at runtime: each organization copies this matrix
 * into its own roles and role_permissions rows. The app checks those rows.
 * Field Tech and Auditor are seeded inactive so they can be turned on later
 * without a code change. Kiosk is active but not assigned to a person.
 */

export const PERMISSIONS = {
  assetsView: "assets.view",
  assetsViewAssigned: "assets.view_assigned",
  assetsScan: "assets.scan",
  assetsWrite: "assets.write",
  assetsCheckout: "assets.checkout",
  assetsMove: "assets.move",
  assetsMaintain: "assets.maintain",
  stockAdjust: "stock.adjust",
  stockTake: "stock.take",
  requestsSubmit: "requests.submit",
  workOrdersConvert: "work_orders.convert",
  workOrdersComplete: "work_orders.complete",
  approvalsAct: "approvals.act",
  approvalsConfigure: "approvals.configure",
  reportsRun: "reports.run",
  exportsFull: "exports.full",
  importRun: "import.run",
  orgManage: "org.manage",
  kioskManage: "kiosk.manage",
  planManage: "plan.manage",
  peopleManage: "people.manage",
  locationsManage: "locations.manage",
  settingsManage: "settings.manage",
  subscriptionsView: "subscriptions.view",
  subscriptionsManage: "subscriptions.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type RoleKey =
  | "admin"
  | "manager"
  | "editor"
  | "requester"
  | "viewer"
  | "kiosk"
  | "field_tech"
  | "auditor";

export type RoleSeed = {
  key: RoleKey;
  name: string;
  active: boolean;
  assignable: boolean;
  permissions: readonly Permission[];
};

const admin: Permission[] = [
  "approvals.act",
  "approvals.configure",
  "assets.checkout",
  "assets.maintain",
  "assets.move",
  "assets.scan",
  "assets.view",
  "assets.write",
  "exports.full",
  "import.run",
  "kiosk.manage",
  "locations.manage",
  "org.manage",
  "people.manage",
  "plan.manage",
  "reports.run",
  "requests.submit",
  "settings.manage",
  "stock.adjust",
  "subscriptions.manage",
  "subscriptions.view",
  "stock.take",
  "work_orders.complete",
  "work_orders.convert",
];

export const ROLE_SEEDS: readonly RoleSeed[] = [
  { key: "admin", name: "Admin", active: true, assignable: true, permissions: admin },
  {
    key: "manager",
    name: "Manager",
    active: true,
    assignable: true,
    permissions: [
      "approvals.act",
      "assets.checkout",
      "assets.maintain",
      "assets.move",
      "assets.scan",
      "assets.view",
      "assets.write",
      "reports.run",
      "requests.submit",
      "stock.adjust",
      "stock.take",
      "subscriptions.manage",
      "subscriptions.view",
      "work_orders.complete",
      "work_orders.convert",
    ],
  },
  {
    key: "editor",
    name: "Editor",
    active: true,
    assignable: true,
    permissions: [
      "assets.checkout",
      "assets.maintain",
      "assets.move",
      "assets.scan",
      "assets.view",
      "assets.write",
      "reports.run",
      "requests.submit",
      "stock.adjust",
      "stock.take",
      "work_orders.complete",
    ],
  },
  {
    key: "requester",
    name: "Requester",
    active: true,
    assignable: true,
    permissions: ["assets.scan", "requests.submit"],
  },
  {
    key: "viewer",
    name: "Viewer",
    active: true,
    assignable: true,
    permissions: ["assets.scan", "assets.view", "reports.run", "subscriptions.view"],
  },
  {
    key: "kiosk",
    name: "Kiosk",
    active: true,
    assignable: false,
    permissions: ["assets.scan", "requests.submit", "stock.take"],
  },
  {
    key: "field_tech",
    name: "Field Tech",
    active: false,
    assignable: false,
    permissions: ["assets.checkout", "assets.scan", "assets.view_assigned", "work_orders.complete"],
  },
  {
    key: "auditor",
    name: "Auditor",
    active: false,
    assignable: false,
    permissions: ["assets.scan", "assets.view", "exports.full", "reports.run"],
  },
];

export function permissionsFor(roleKey: string): readonly Permission[] {
  return ROLE_SEEDS.find((role) => role.key === roleKey)?.permissions ?? [];
}

export function can(permissions: readonly string[] | Set<string>, permission: Permission): boolean {
  if (permissions instanceof Set) return permissions.has(permission);
  return permissions.includes(permission);
}

export function canViewRegister(permissions: readonly string[] | Set<string>): boolean {
  return can(permissions, PERMISSIONS.assetsView);
}
