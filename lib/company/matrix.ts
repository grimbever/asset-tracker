import { PERMISSIONS, ROLE_SEEDS, type Permission } from "@/lib/permissions";

export const LEVELS = ["none", "view", "edit", "use", "manage"] as const;
export type AccessLevel = (typeof LEVELS)[number];

export type AccessModule = {
  id: string;
  label: string;
  hint: string;
  levels: readonly AccessLevel[];
  /** Permissions this cell replaces. Other permissions on the role stay. */
  universe: readonly Permission[];
  grants: Partial<Record<AccessLevel, readonly Permission[]>>;
  /** Kept when the chosen level is not None, so assigned-only access is not wiped. */
  sticky?: readonly Permission[];
  enabled: boolean;
};

const viewAssets = [PERMISSIONS.assetsView, PERMISSIONS.assetsScan] as const;
const editAssets = [...viewAssets, PERMISSIONS.assetsWrite, PERMISSIONS.assetsCheckout, PERMISSIONS.assetsMove] as const;

export const ACCESS_MODULES: readonly AccessModule[] = [
  {
    id: "assets",
    label: "Assets",
    hint: "The register, scan, check out, and edits.",
    levels: ["none", "view", "edit"],
    universe: [...editAssets, PERMISSIONS.assetsViewAssigned],
    grants: { none: [], view: viewAssets, edit: editAssets },
    sticky: [PERMISSIONS.assetsViewAssigned],
    enabled: true,
  },
  {
    id: "kits",
    label: "Kits",
    hint: "Which items are part of a kit, and checking a kit out as one unit.",
    levels: ["none", "view", "edit"],
    universe: [PERMISSIONS.kitsView, PERMISSIONS.kitsWrite],
    grants: { none: [], view: [PERMISSIONS.kitsView], edit: [PERMISSIONS.kitsView, PERMISSIONS.kitsWrite] },
    enabled: true,
  },
  {
    id: "people",
    label: "People",
    hint: "The people list. Manage includes adding and archiving people.",
    levels: ["none", "view", "manage"],
    universe: [PERMISSIONS.peopleView, PERMISSIONS.peopleManage],
    grants: { none: [], view: [PERMISSIONS.peopleView], manage: [PERMISSIONS.peopleView, PERMISSIONS.peopleManage] },
    enabled: true,
  },
  {
    id: "locations",
    label: "Locations",
    hint: "Places. Manage includes adding and archiving locations.",
    levels: ["none", "view", "manage"],
    universe: [PERMISSIONS.locationsView, PERMISSIONS.locationsManage],
    grants: {
      none: [],
      view: [PERMISSIONS.locationsView],
      manage: [PERMISSIONS.locationsView, PERMISSIONS.locationsManage],
    },
    enabled: true,
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    hint: "Renewals. Manage includes the license key or account ID.",
    levels: ["none", "view", "manage"],
    universe: [PERMISSIONS.subscriptionsView, PERMISSIONS.subscriptionsManage],
    grants: {
      none: [],
      view: [PERMISSIONS.subscriptionsView],
      manage: [PERMISSIONS.subscriptionsView, PERMISSIONS.subscriptionsManage],
    },
    enabled: true,
  },
  {
    id: "history",
    label: "History",
    hint: "The change log.",
    levels: ["none", "view"],
    universe: [PERMISSIONS.historyView],
    grants: { none: [], view: [PERMISSIONS.historyView] },
    enabled: true,
  },
  {
    id: "reports",
    label: "Reports and labels",
    hint: "Labels, reports, and full exports.",
    levels: ["none", "view", "manage"],
    universe: [PERMISSIONS.reportsRun, PERMISSIONS.exportsFull],
    grants: { none: [], view: [PERMISSIONS.reportsRun], manage: [PERMISSIONS.reportsRun, PERMISSIONS.exportsFull] },
    enabled: true,
  },
  {
    id: "maintenance",
    label: "Maintenance",
    hint: "Service records and status changes.",
    levels: ["none", "view", "edit"],
    universe: [PERMISSIONS.maintenanceView, PERMISSIONS.assetsMaintain],
    grants: {
      none: [],
      view: [PERMISSIONS.maintenanceView],
      edit: [PERMISSIONS.maintenanceView, PERMISSIONS.assetsMaintain],
    },
    enabled: true,
  },
  {
    id: "inventory",
    label: "Inventory",
    hint: "Snacks, paper, and other consumables. Edit can receive and use stock. Manage can archive items.",
    levels: ["none", "view", "edit", "manage"],
    universe: [PERMISSIONS.inventoryView, PERMISSIONS.inventoryEdit, PERMISSIONS.inventoryManage],
    grants: {
      none: [],
      view: [PERMISSIONS.inventoryView],
      edit: [PERMISSIONS.inventoryView, PERMISSIONS.inventoryEdit],
      manage: [PERMISSIONS.inventoryView, PERMISSIONS.inventoryEdit, PERMISSIONS.inventoryManage],
    },
    enabled: true,
  },
  {
    id: "settings",
    label: "Settings and lookups",
    hint: "Company setup, statuses, types, and custom fields.",
    levels: ["none", "manage"],
    universe: [PERMISSIONS.settingsManage],
    grants: { none: [], manage: [PERMISSIONS.settingsManage] },
    enabled: true,
  },
  {
    id: "users",
    label: "Users and invites",
    hint: "Members, invites, and the organization name.",
    levels: ["none", "manage"],
    universe: [PERMISSIONS.orgManage],
    grants: { none: [], manage: [PERMISSIONS.orgManage] },
    enabled: true,
  },
  {
    id: "kiosk",
    label: "Kiosk",
    hint: "The storeroom tablet. Use can record what people take. Manage can set PINs. Request and create-item switches sit under each role and start off for a new organization.",
    levels: ["none", "use", "manage"],
    universe: [PERMISSIONS.kioskUse, PERMISSIONS.kioskManage],
    grants: {
      none: [],
      use: [PERMISSIONS.kioskUse],
      manage: [PERMISSIONS.kioskUse, PERMISSIONS.kioskManage],
    },
    enabled: true,
  },
  {
    id: "work_orders",
    label: "Work orders",
    hint: "Work orders. Not available in this version.",
    levels: ["none", "edit"],
    universe: [PERMISSIONS.workOrdersComplete, PERMISSIONS.workOrdersConvert],
    grants: { none: [], edit: [PERMISSIONS.workOrdersComplete, PERMISSIONS.workOrdersConvert] },
    enabled: false,
  },
];

export function moduleById(id: string): AccessModule | undefined {
  return ACCESS_MODULES.find((area) => area.id === id);
}

export function levelLabel(level: AccessLevel): string {
  if (level === "none") return "None";
  if (level === "view") return "View";
  if (level === "edit") return "Edit";
  if (level === "use") return "Use";
  return "Manage";
}

export function inferLevel(permissions: readonly string[], module: AccessModule): AccessLevel {
  const ranked = (["manage", "edit", "use", "view"] as const).filter((level) => module.levels.includes(level));
  for (const level of ranked) {
    const grant = module.grants[level] ?? [];
    if (grant.length > 0 && grant.every((permission) => permissions.includes(permission))) return level;
  }
  const editGrant = module.grants.edit ?? module.grants.manage ?? [];
  const viewGrant = module.grants.view ?? [];
  const higher = editGrant.filter((permission) => !viewGrant.includes(permission));
  if (higher.some((permission) => permissions.includes(permission))) {
    return module.levels.includes("manage") ? "manage" : "edit";
  }
  if (viewGrant.some((permission) => permissions.includes(permission))) return "view";
  if (module.universe.some((permission) => permissions.includes(permission)) && module.levels.includes("view")) return "view";
  return "none";
}

export function applyLevel(permissions: readonly string[], module: AccessModule, level: AccessLevel): Permission[] {
  if (!module.levels.includes(level)) throw new Error("That level is not available.");
  if (!module.enabled) throw new Error("That module is not available yet.");
  const grant = module.grants[level] ?? [];
  const sticky =
    level === "none" ? [] : (module.sticky ?? []).filter((permission) => permissions.includes(permission));
  const kept = permissions.filter((permission) => !module.universe.includes(permission as Permission));
  return [...new Set([...kept, ...grant, ...sticky])] as Permission[];
}

export type AccessRole = {
  id: string;
  active: boolean;
  permissions: readonly string[];
};

export function previewRoleChange(input: {
  roles: readonly AccessRole[];
  actorRoleId: string;
  roleId: string;
  nextPermissions?: readonly string[];
  nextActive?: boolean;
  assigned?: boolean;
  pendingInvites?: boolean;
}): string | null {
  if (input.nextActive === false && input.assigned) return "This role is assigned to someone. Move them first.";
  if (input.nextActive === false && input.pendingInvites) return "This role has an open invite. Revoke it first.";
  const effective = input.roles.map((role) =>
    role.id === input.roleId
      ? {
          ...role,
          active: input.nextActive ?? role.active,
          permissions: input.nextPermissions ?? role.permissions,
        }
      : role,
  );
  const holders = effective.filter((role) => role.active && role.permissions.includes(PERMISSIONS.settingsManage));
  if (holders.length === 0) return "Keep company setup on at least one active role.";
  const actor = effective.find((role) => role.id === input.actorRoleId);
  if (!actor?.permissions.includes(PERMISSIONS.settingsManage)) return "You cannot remove your own access to company setup.";
  return null;
}

export function customRoleKey(id: string): string {
  return `custom_${id.replaceAll("-", "").slice(0, 12)}`;
}

export const DATE_FORMATS = [
  { id: "MMM d, yyyy", label: "Nov 27, 2026" },
  { id: "MM/dd/yyyy", label: "11/27/2026" },
  { id: "dd/MM/yyyy", label: "27/11/2026" },
  { id: "yyyy-MM-dd", label: "2026-11-27" },
] as const;

export const DEFAULT_UPCOMING_DAYS = [7, 30, 90, 180] as const;

export type CompanySettingsInput = {
  accentColor: string;
  logoUrl: string;
  dateFormat: string;
  defaultCheckoutDays: number;
  checkoutDueRequired: boolean;
  tagPrefix: string;
  labelTemplate: string;
  notifyEmails: string;
  notifyCheckout: boolean;
  notifyCheckin: boolean;
  notifyStatus: boolean;
  lowStockThreshold: number;
  maintenanceReminderDays: number;
  requireNoteBroken: boolean;
  requireNoteMissing: boolean;
  inviteExpiryDays: number;
  upcomingDays: number[];
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettingsInput = {
  accentColor: "#1d6b4f",
  logoUrl: "",
  dateFormat: "MMM d, yyyy",
  defaultCheckoutDays: 0,
  checkoutDueRequired: false,
  tagPrefix: "AT",
  labelTemplate: "avery-5163",
  notifyEmails: "",
  notifyCheckout: true,
  notifyCheckin: true,
  notifyStatus: true,
  lowStockThreshold: 1,
  maintenanceReminderDays: 7,
  requireNoteBroken: false,
  requireNoteMissing: false,
  inviteExpiryDays: 14,
  upcomingDays: [...DEFAULT_UPCOMING_DAYS],
};

export function normalizeCompanySettings(input: CompanySettingsInput): { ok: true; value: CompanySettingsInput } | { ok: false; error: string } {
  const accent = input.accentColor.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return { ok: false, error: "Use an accent color like #1d6b4f." };
  const logo = input.logoUrl.trim();
  if (logo && !/^https:\/\//i.test(logo)) return { ok: false, error: "The logo address must start with https://." };
  if (!DATE_FORMATS.some((format) => format.id === input.dateFormat)) return { ok: false, error: "Choose a date format." };
  if (!Number.isInteger(input.defaultCheckoutDays) || input.defaultCheckoutDays < 0 || input.defaultCheckoutDays > 365) {
    return { ok: false, error: "Default check-out length must be from 0 to 365 days." };
  }
  const prefix = input.tagPrefix.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(prefix)) return { ok: false, error: "The tag prefix must be 1 to 6 letters or numbers." };
  if (!input.labelTemplate.trim() || input.labelTemplate.length > 40) return { ok: false, error: "Choose a label template." };
  if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0 || input.lowStockThreshold > 100000) {
    return { ok: false, error: "The low-stock threshold must be from 0 to 100000." };
  }
  if (!Number.isInteger(input.maintenanceReminderDays) || input.maintenanceReminderDays < 0 || input.maintenanceReminderDays > 365) {
    return { ok: false, error: "The maintenance reminder must be from 0 to 365 days." };
  }
  if (!Number.isInteger(input.inviteExpiryDays) || input.inviteExpiryDays < 1 || input.inviteExpiryDays > 90) {
    return { ok: false, error: "Invite links must last from 1 to 90 days." };
  }
  const upcoming = input.upcomingDays.map((day) => Number(day));
  if (upcoming.length < 1 || upcoming.length > 4) return { ok: false, error: "Use 1 to 4 upcoming windows." };
  for (let index = 0; index < upcoming.length; index += 1) {
    const day = upcoming[index];
    if (!Number.isInteger(day) || day < 1 || day > 365) return { ok: false, error: "Upcoming windows must be from 1 to 365 days." };
    if (index > 0 && day <= upcoming[index - 1]) return { ok: false, error: "Each upcoming window must be longer than the one before it." };
  }
  const emails = input.notifyEmails
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (emails.some((email) => !email.includes("@"))) return { ok: false, error: "Notification addresses must include @." };
  return {
    ok: true,
    value: {
      ...input,
      accentColor: accent.toLowerCase(),
      logoUrl: logo,
      tagPrefix: prefix,
      notifyEmails: [...new Set(emails)].join(", "),
      upcomingDays: upcoming,
    },
  };
}

export function formatTag(prefix: string, number: number): string {
  const clean = prefix.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "AT";
  return `${clean}-${number}`;
}

export function checkoutDueBlocker(dueOn: string, required: boolean): string | null {
  if (required && !dueOn.trim()) return "A due date is required.";
  return null;
}

export function defaultDueDate(today: string, days: number): string {
  if (!days || days < 0) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

export function isLowStock(quantity: number | null, threshold: number): boolean {
  if (quantity === null || Number.isNaN(quantity)) return false;
  return quantity <= threshold;
}

export function modulePageAllowed(input: {
  ready: boolean;
  permissions: readonly string[];
  required: readonly string[];
  legacy: readonly string[];
}): boolean {
  const keys = input.ready ? input.required : input.legacy;
  return keys.some((key) => input.permissions.includes(key));
}

export function seededLevel(roleKey: string, moduleId: string): AccessLevel {
  const role = ROLE_SEEDS.find((item) => item.key === roleKey);
  const area = moduleById(moduleId);
  if (!role || !area) return "none";
  return inferLevel(role.permissions, area);
}
