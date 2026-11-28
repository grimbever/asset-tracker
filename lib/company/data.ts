import type { SupabaseClient } from "@supabase/supabase-js";
import { messageFrom } from "@/lib/data/errors";
import { newId } from "@/lib/ids";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettingsInput } from "@/lib/company/matrix";

type Client = SupabaseClient;

export type CompanyRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  active: boolean;
  assignable: boolean;
  builtIn: boolean;
  permissions: string[];
};

export async function permissionReady(supabase: Client, organizationId: string, permission: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("role_permissions")
    .select("permission", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("permission", permission);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function listCompanyRoles(supabase: Client, organizationId: string): Promise<CompanyRole[]> {
  const [roles, permissions] = await Promise.all([
    supabase.from("roles").select("id, key, name, description, active, assignable, built_in").eq("organization_id", organizationId),
    supabase.from("role_permissions").select("role_id, permission").eq("organization_id", organizationId),
  ]);
  if (roles.error) throw new Error(messageFrom(roles.error));
  if (permissions.error) throw new Error(messageFrom(permissions.error));
  const byRole = new Map<string, string[]>();
  for (const row of permissions.data ?? []) {
    const record = row as { role_id: string; permission: string };
    const list = byRole.get(record.role_id) ?? [];
    list.push(record.permission);
    byRole.set(record.role_id, list);
  }
  return ((roles.data ?? []) as {
    id: string;
    key: string;
    name: string;
    description: string;
    active: boolean;
    assignable: boolean;
    built_in: boolean;
  }[]).map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description ?? "",
    active: role.active,
    assignable: role.assignable,
    builtIn: role.built_in,
    permissions: byRole.get(role.id) ?? [],
  }));
}

export type CompanyForm = CompanySettingsInput & { name: string; timezone: string; approverRoleId: string };

export function companyFormFromRow(row: Record<string, unknown> | null, name: string, timezone: string, emails: string[]): CompanyForm {
  if (!row) return { ...DEFAULT_COMPANY_SETTINGS, name, timezone, approverRoleId: "" };
  return {
    name,
    timezone,
    accentColor: String(row.accent_color ?? DEFAULT_COMPANY_SETTINGS.accentColor),
    logoUrl: String(row.logo_url ?? ""),
    dateFormat: String(row.date_format ?? DEFAULT_COMPANY_SETTINGS.dateFormat),
    defaultCheckoutDays: Number(row.default_checkout_days ?? 0),
    checkoutDueRequired: Boolean(row.checkout_due_required),
    tagPrefix: String(row.tag_prefix ?? "AT"),
    labelTemplate: String(row.label_template ?? DEFAULT_COMPANY_SETTINGS.labelTemplate),
    notifyEmails: emails.join(", "),
    notifyCheckout: row.notify_checkout !== false,
    notifyCheckin: row.notify_checkin !== false,
    notifyStatus: row.notify_status !== false,
    lowStockThreshold: Number(row.low_stock_threshold ?? 1),
    maintenanceReminderDays: Number(row.maintenance_reminder_days ?? 7),
    requireNoteBroken: Boolean(row.require_note_broken),
    requireNoteMissing: Boolean(row.require_note_missing),
    approverRoleId: String(row.approver_role_id ?? ""),
    inviteExpiryDays: Number(row.invite_expiry_days ?? 14),
    upcomingDays: Array.isArray(row.upcoming_days) ? row.upcoming_days.map((day) => Number(day)) : [...DEFAULT_COMPANY_SETTINGS.upcomingDays],
  };
}

export async function loadCompanySettings(supabase: Client, organizationId: string, name: string, timezone: string, emails: string[]): Promise<CompanyForm> {
  const { data, error } = await supabase.from("organization_settings").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error || !data) return companyFormFromRow(null, name, timezone, emails);
  return companyFormFromRow(data as Record<string, unknown>, name, timezone, emails);
}

function settingsPayload(input: CompanyForm) {
  return {
    name: input.name,
    timezone: input.timezone,
    accent_color: input.accentColor,
    logo_url: input.logoUrl,
    date_format: input.dateFormat,
    default_checkout_days: input.defaultCheckoutDays,
    checkout_due_required: input.checkoutDueRequired,
    tag_prefix: input.tagPrefix,
    label_template: input.labelTemplate,
    notify_emails: input.notifyEmails,
    notify_checkout: input.notifyCheckout,
    notify_checkin: input.notifyCheckin,
    notify_status: input.notifyStatus,
    low_stock_threshold: input.lowStockThreshold,
    maintenance_reminder_days: input.maintenanceReminderDays,
    require_note_broken: input.requireNoteBroken,
    require_note_missing: input.requireNoteMissing,
    approver_role_id: input.approverRoleId,
    invite_expiry_days: input.inviteExpiryDays,
    upcoming_days: input.upcomingDays,
  };
}

export async function saveCompanySettings(supabase: Client, organizationId: string, input: CompanyForm) {
  const { error } = await supabase.rpc("save_company_settings", {
    p_organization_id: organizationId,
    p_event_id: newId(),
    p_settings: settingsPayload(input),
  });
  if (error) throw new Error(messageFrom(error));
}

export async function saveRoleModule(supabase: Client, organizationId: string, roleId: string, moduleId: string, level: string) {
  const { error } = await supabase.rpc("set_role_module", {
    p_organization_id: organizationId,
    p_role_id: roleId,
    p_event_id: newId(),
    p_module: moduleId,
    p_level: level,
  });
  if (error) throw new Error(messageFrom(error));
}

export async function saveRoleName(supabase: Client, organizationId: string, roleId: string, name: string, description: string) {
  const { error } = await supabase.rpc("rename_role", {
    p_organization_id: organizationId,
    p_role_id: roleId,
    p_event_id: newId(),
    p_name: name,
    p_description: description,
  });
  if (error) throw new Error(messageFrom(error));
}

export async function saveRoleActive(supabase: Client, organizationId: string, roleId: string, active: boolean) {
  const { error } = await supabase.rpc("set_role_active", {
    p_organization_id: organizationId,
    p_role_id: roleId,
    p_event_id: newId(),
    p_active: active,
  });
  if (error) throw new Error(messageFrom(error));
}

export async function saveRoleExtra(supabase: Client, organizationId: string, roleId: string, permission: string, enabled: boolean) {
  const { error } = await supabase.rpc("set_role_extra_permission", {
    p_organization_id: organizationId,
    p_role_id: roleId,
    p_event_id: newId(),
    p_permission: permission,
    p_enabled: enabled,
  });
  if (error) throw new Error(messageFrom(error));
}

export async function copyRole(supabase: Client, organizationId: string, sourceId: string, name: string) {
  const { error } = await supabase.rpc("clone_role", {
    p_organization_id: organizationId,
    p_source_id: sourceId,
    p_event_id: newId(),
    p_name: name,
  });
  if (error) throw new Error(messageFrom(error));
}
