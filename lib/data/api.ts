import type { SupabaseClient } from "@supabase/supabase-js";
import { attentionList, type AttentionItem } from "@/lib/assets/attention";
import { cleanCustomFields } from "@/lib/assets/fields";
import { emptyToNull, parseCost } from "@/lib/assets/custody";
import type { AssetInput, AssetRecord, AssetStatus, AssetType } from "@/lib/assets/types";
import { isAssetStatus, isAssetType } from "@/lib/assets/types";
import type { AssetEvent } from "@/lib/assets/events";
import { demoAssets, DEMO_LOCATIONS, DEMO_PEOPLE } from "@/lib/demo/catalog";
import { DEFAULT_TIMEZONE } from "@/lib/config";
import { attachmentPath, isUuid, newId, newToken, normalizeEmail } from "@/lib/ids";
import { messageFrom } from "@/lib/data/errors";

export type { AttentionItem };

type Client = SupabaseClient;

export type LocationRecord = {
  id: string;
  organization_id: string;
  name: string;
  notes: string | null;
  archived_at?: string | null;
};

export type EmployeeRecord = {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  hire_date: string | null;
  termination_date: string | null;
  active: boolean;
  archived_at: string | null;
  user_id: string | null;
  notes: string | null;
};

export type AttachmentRecord = {
  id: string;
  organization_id: string;
  asset_id: string | null;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  byte_size: number | null;
  created_at: string;
  url?: string | null;
};

export type RoleRecord = {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  description: string;
  active: boolean;
  assignable: boolean;
};

export type MemberRecord = {
  id: string;
  user_id: string;
  role_id: string;
  email: string;
  display_name: string;
  role_key: string;
  role_name: string;
};

export type InviteRecord = {
  id: string;
  email: string;
  role_id: string;
  role_name: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
};

export type OrgRecord = {
  id: string;
  name: string;
  timezone: string;
  plan_id: string;
  max_items: number;
  max_users: number;
  feature_flags: Record<string, boolean>;
};

export type MembershipContext = {
  organization: OrgRecord;
  role: RoleRecord;
  permissions: string[];
};

function fail(error: unknown): never {
  throw new Error(messageFrom(error));
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The server returned an unexpected record.");
  }
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requiredString(value: unknown, label: string): string {
  const text = str(value);
  if (!text) throw new Error(`Missing ${label}.`);
  return text;
}

export function parseAsset(value: unknown): AssetRecord {
  const row = asObject(value);
  const type = requiredString(row.type, "type");
  const status = requiredString(row.status, "status");
  if (!isAssetType(type) || !isAssetStatus(status)) {
    throw new Error("The server returned an asset without a type or status.");
  }
  const custom = asObject(row.custom_fields ?? {});
  const customFields: Record<string, string> = {};
  for (const [key, field] of Object.entries(custom)) {
    if (typeof field === "string" && field.trim()) customFields[key] = field;
    else if (typeof field === "number") customFields[key] = String(field);
  }
  const cost = row.cost === null || row.cost === undefined || row.cost === "" ? null : Number(row.cost);
  return {
    id: requiredString(row.id, "id"),
    organization_id: requiredString(row.organization_id, "organization"),
    name: requiredString(row.name, "name"),
    tag_id: requiredString(row.tag_id, "tag"),
    type,
    status,
    location_id: str(row.location_id),
    assigned_employee_id: str(row.assigned_employee_id),
    due_on: str(row.due_on),
    group_label: str(row.group_label),
    brand: str(row.brand),
    model: str(row.model),
    serial: str(row.serial),
    vendor: str(row.vendor),
    purchase_date: str(row.purchase_date),
    cost: cost === null || Number.isNaN(cost) ? null : cost,
    notes: str(row.notes),
    parent_asset_id: str(row.parent_asset_id),
    checkout_as_unit: row.checkout_as_unit === true,
    custom_fields: customFields,
    archived_at: str(row.archived_at),
    created_at: requiredString(row.created_at, "created_at"),
    updated_at: requiredString(row.updated_at, "updated_at"),
  };
}

export function assetPayload(input: AssetInput): Record<string, unknown> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  if (!isAssetType(input.type)) throw new Error("Choose a type.");
  return {
    name,
    tag_id: input.tagId.trim(),
    type: input.type,
    location_id: input.locationId,
    group_label: input.groupLabel.trim(),
    brand: input.brand.trim(),
    model: input.model.trim(),
    serial: input.serial.trim(),
    vendor: input.vendor.trim(),
    purchase_date: emptyToNull(input.purchaseDate),
    cost: parseCost(input.cost),
    notes: input.notes.trim(),
    parent_asset_id: input.parentAssetId,
    checkout_as_unit: input.checkoutAsUnit,
    custom_fields: cleanCustomFields(input.type, input.customFields),
  };
}

export function kitCheckoutIds(checkoutAsUnit: boolean, childIds: readonly string[]): { asset_id: string; event_id: string }[] {
  if (!checkoutAsUnit) return [];
  return childIds.map((asset_id) => ({ asset_id, event_id: newId() }));
}

export function kitCheckInIds(parent: AssetRecord, children: readonly AssetRecord[]): { asset_id: string; event_id: string }[] {
  if (!parent.checkout_as_unit) return [];
  return children
    .filter(
      (child) =>
        child.status === "checked_out" &&
        child.assigned_employee_id === parent.assigned_employee_id &&
        child.due_on === parent.due_on,
    )
    .map((child) => ({ asset_id: child.id, event_id: newId() }));
}

export async function listAssets(
  supabase: Client,
  organizationId: string,
  options?: { includeArchived?: boolean },
): Promise<AssetRecord[]> {
  let query = supabase.from("assets").select("*").eq("organization_id", organizationId).order("name", { ascending: true });
  if (!options?.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) fail(error);
  return (data ?? []).map(parseAsset);
}

export async function getAsset(supabase: Client, id: string): Promise<AssetRecord | null> {
  const { data, error } = await supabase.from("assets").select("*").eq("id", id).maybeSingle();
  if (error) fail(error);
  if (data) return parseAsset(data);
  const { data: raw, error: rpcError } = await supabase.rpc("read_asset", { p_id: id });
  if (rpcError) fail(rpcError);
  if (!raw) return null;
  return parseAsset(raw);
}

export async function lookupAssetsByTag(supabase: Client, tag: string): Promise<AssetRecord[]> {
  const { data, error } = await supabase.rpc("lookup_asset_by_tag", { p_tag: tag });
  if (error) fail(error);
  if (!Array.isArray(data)) return [];
  return data.map(parseAsset);
}

export async function createAsset(
  supabase: Client,
  organizationId: string,
  input: AssetInput,
  ids: { assetId?: string; eventId?: string } = {},
): Promise<AssetRecord> {
  const assetId = ids.assetId ?? newId();
  const eventId = ids.eventId ?? newId();
  const { data, error } = await supabase.rpc("create_asset", {
    p_id: assetId,
    p_organization_id: organizationId,
    p_event_id: eventId,
    p_asset: assetPayload(input),
  });
  if (error) fail(error);
  return parseAsset(data);
}

export async function updateAsset(supabase: Client, id: string, input: AssetInput): Promise<AssetRecord> {
  const { data, error } = await supabase.rpc("update_asset", {
    p_id: id,
    p_event_id: newId(),
    p_asset: assetPayload(input),
  });
  if (error) fail(error);
  return parseAsset(data);
}

export async function deleteAsset(supabase: Client, id: string): Promise<string> {
  const eventId = newId();
  const { error } = await supabase.rpc("delete_asset", { p_id: id, p_event_id: eventId });
  if (error) fail(error);
  return eventId;
}

export async function checkoutAsset(
  supabase: Client,
  asset: AssetRecord,
  childIds: readonly string[],
  target: { employeeId: string | null; locationId: string | null; dueOn: string | null },
): Promise<{ asset: AssetRecord; eventId: string }> {
  const eventId = newId();
  const { data, error } = await supabase.rpc("checkout_asset", {
    p_asset_id: asset.id,
    p_event_id: eventId,
    p_employee_id: target.employeeId,
    p_location_id: target.locationId,
    p_due_on: target.dueOn,
    p_child_events: kitCheckoutIds(asset.checkout_as_unit, childIds),
  });
  if (error) fail(error);
  return { asset: parseAsset(data), eventId };
}

export async function checkInAsset(
  supabase: Client,
  asset: AssetRecord,
  children: readonly AssetRecord[],
): Promise<{ asset: AssetRecord; eventId: string }> {
  const eventId = newId();
  const { data, error } = await supabase.rpc("checkin_asset", {
    p_asset_id: asset.id,
    p_event_id: eventId,
    p_child_events: kitCheckInIds(asset, children),
    p_note: null,
  });
  if (error) fail(error);
  return { asset: parseAsset(data), eventId };
}

export async function moveAsset(supabase: Client, assetId: string, locationId: string): Promise<AssetRecord> {
  const { data, error } = await supabase.rpc("move_asset", {
    p_asset_id: assetId,
    p_event_id: newId(),
    p_location_id: locationId,
  });
  if (error) fail(error);
  return parseAsset(data);
}

export async function setAssetStatus(
  supabase: Client,
  assetId: string,
  status: AssetStatus,
  note: string,
): Promise<{ asset: AssetRecord; eventId: string }> {
  const eventId = newId();
  const { data, error } = await supabase.rpc("set_asset_status", {
    p_asset_id: assetId,
    p_event_id: eventId,
    p_status: status,
    p_note: emptyToNull(note),
  });
  if (error) fail(error);
  return { asset: parseAsset(data), eventId };
}

export async function listEvents(supabase: Client, assetId: string): Promise<AssetEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("subject_type", "asset")
    .eq("subject_id", assetId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) fail(error);
  return (data ?? []).map(parseEvent);
}

export async function listRecentEvents(supabase: Client, organizationId: string): Promise<AssetEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("organization_id", organizationId)
    .order("occurred_at", { ascending: false })
    .limit(12);
  if (error) fail(error);
  return (data ?? []).map(parseEvent);
}

function parseEvent(value: unknown): AssetEvent {
  const row = asObject(value);
  return {
    id: requiredString(row.id, "id"),
    organization_id: requiredString(row.organization_id, "organization"),
    subject_type: requiredString(row.subject_type, "subject"),
    subject_id: requiredString(row.subject_id, "subject id"),
    event_type: requiredString(row.event_type, "event"),
    occurred_at: requiredString(row.occurred_at, "time"),
    actor_user_id: str(row.actor_user_id),
    actor_name: str(row.actor_name),
    notes: str(row.notes),
    from_state: row.from_state && typeof row.from_state === "object" ? (row.from_state as Record<string, unknown>) : null,
    to_state: row.to_state && typeof row.to_state === "object" ? (row.to_state as Record<string, unknown>) : null,
    payload: row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {},
  };
}

export async function listLocations(supabase: Client, organizationId: string): Promise<LocationRecord[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("id, organization_id, name, notes, archived_at")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) fail(error);
  return (data ?? []) as LocationRecord[];
}

export async function createLocation(supabase: Client, organizationId: string, name: string, notes: string): Promise<void> {
  const { error } = await supabase.from("locations").insert({
    id: newId(),
    organization_id: organizationId,
    name: name.trim(),
    notes: emptyToNull(notes),
  });
  if (error) fail(error);
}

export async function updateLocation(supabase: Client, id: string, name: string, notes: string): Promise<void> {
  const { error } = await supabase.from("locations").update({ name: name.trim(), notes: emptyToNull(notes) }).eq("id", id);
  if (error) fail(error);
}

export async function deleteLocation(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) fail(error);
}

export async function listEmployees(supabase: Client, organizationId: string): Promise<EmployeeRecord[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, organization_id, name, email, phone, title, hire_date, termination_date, active, archived_at, user_id, notes")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) fail(error);
  return (data ?? []) as EmployeeRecord[];
}

export async function createEmployee(
  supabase: Client,
  organizationId: string,
  input: { name: string; email: string; phone: string; hireDate: string; notes: string; userId?: string | null },
): Promise<EmployeeRecord> {
  const id = newId();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      id,
      organization_id: organizationId,
      name: input.name.trim(),
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      hire_date: emptyToNull(input.hireDate),
      notes: emptyToNull(input.notes),
      active: true,
      user_id: input.userId ?? null,
    })
    .select("*")
    .single();
  if (error) fail(error);
  return data as EmployeeRecord;
}

export async function updateEmployee(
  supabase: Client,
  id: string,
  input: { name: string; email: string; phone: string; hireDate: string; terminationDate: string; active: boolean; notes: string },
): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update({
      name: input.name.trim(),
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      hire_date: emptyToNull(input.hireDate),
      termination_date: emptyToNull(input.terminationDate),
      active: input.active,
      notes: emptyToNull(input.notes),
    })
    .eq("id", id);
  if (error) fail(error);
}

export async function ensureMeEmployee(
  supabase: Client,
  organizationId: string,
  userId: string,
  name: string,
): Promise<EmployeeRecord> {
  const people = await listEmployees(supabase, organizationId);
  const existing = people.find((person) => person.user_id === userId);
  if (existing) return existing;
  return createEmployee(supabase, organizationId, {
    name: name.trim() || "Me",
    email: "",
    phone: "",
    hireDate: "",
    notes: "",
    userId,
  });
}

export async function listRoles(supabase: Client, organizationId: string): Promise<RoleRecord[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("id, organization_id, key, name, description, active, assignable")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) fail(error);
  return (data ?? []) as RoleRecord[];
}

export async function listMembers(supabase: Client, organizationId: string): Promise<MemberRecord[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, user_id, role_id, roles(key, name)")
    .eq("organization_id", organizationId);
  if (error) fail(error);
  const userIds = (data ?? []).map((row) => String((row as { user_id: string }).user_id));
  const profiles = new Map<string, { display_name: string; email: string }>();
  if (userIds.length) {
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds);
    if (profileError) fail(profileError);
    for (const profile of profileRows ?? []) {
      const row = profile as { id: string; display_name?: string; email?: string };
      profiles.set(row.id, { display_name: row.display_name ?? "", email: row.email ?? "" });
    }
  }
  return (data ?? []).map((row) => {
    const record = row as {
      id: string;
      user_id: string;
      role_id: string;
      roles: { key: string; name: string } | { key: string; name: string }[] | null;
    };
    const role = Array.isArray(record.roles) ? record.roles[0] : record.roles;
    const profile = profiles.get(record.user_id);
    return {
      id: record.id,
      user_id: record.user_id,
      role_id: record.role_id,
      email: profile?.email ?? "",
      display_name: profile?.display_name || profile?.email || "Member",
      role_key: role?.key ?? "",
      role_name: role?.name ?? "Member",
    };
  });
}

export async function updateMemberRole(supabase: Client, membershipId: string, roleId: string): Promise<void> {
  const { error } = await supabase.from("memberships").update({ role_id: roleId }).eq("id", membershipId);
  if (error) fail(error);
}

export async function removeMember(supabase: Client, membershipId: string): Promise<void> {
  const { error } = await supabase.from("memberships").delete().eq("id", membershipId);
  if (error) fail(error);
}

export async function listInvites(supabase: Client, organizationId: string): Promise<InviteRecord[]> {
  const { data, error } = await supabase
    .from("invites")
    .select("id, email, role_id, token, expires_at, accepted_at, roles(name)")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return (data ?? []).map((row) => {
    const record = row as InviteRecord & { roles: { name: string } | { name: string }[] | null };
    const role = Array.isArray(record.roles) ? record.roles[0] : record.roles;
    return {
      id: record.id,
      email: record.email,
      role_id: record.role_id,
      role_name: role?.name ?? "Role",
      token: record.token,
      expires_at: record.expires_at,
      accepted_at: record.accepted_at,
    };
  });
}

export async function createInvite(
  supabase: Client,
  organizationId: string,
  email: string,
  roleId: string,
  invitedBy: string,
): Promise<InviteRecord> {
  const token = newToken();
  const { data, error } = await supabase
    .from("invites")
    .insert({
      id: newId(),
      organization_id: organizationId,
      email: normalizeEmail(email),
      role_id: roleId,
      token,
      invited_by: invitedBy,
    })
    .select("id, email, role_id, token, expires_at, accepted_at")
    .single();
  if (error) fail(error);
  return { ...(data as InviteRecord), role_name: "" };
}

export async function deleteInvite(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.from("invites").delete().eq("id", id);
  if (error) fail(error);
}

export async function previewInvite(supabase: Client, token: string): Promise<{
  found: boolean;
  email?: string;
  org_name?: string;
  role_name?: string;
  expired?: boolean;
  accepted?: boolean;
}> {
  const { data, error } = await supabase.rpc("preview_invite", { p_token: token });
  if (error) fail(error);
  return (data ?? { found: false }) as {
    found: boolean;
    email?: string;
    org_name?: string;
    role_name?: string;
    expired?: boolean;
    accepted?: boolean;
  };
}

export async function acceptInvite(supabase: Client, token: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) fail(error);
  return String(data);
}

export async function createOrganization(
  supabase: Client,
  input: { id?: string; name: string; timezone: string; additional?: boolean },
): Promise<string> {
  const id = input.id && isUuid(input.id) ? input.id : newId();
  const { data, error } = await supabase.rpc("create_organization", {
    p_id: id,
    p_name: input.name.trim(),
    p_timezone: input.timezone || DEFAULT_TIMEZONE,
    p_additional: input.additional ?? false,
  });
  if (error) fail(error);
  return String(data);
}

export async function updateOrganization(
  supabase: Client,
  id: string,
  name: string,
  timezone: string,
): Promise<void> {
  const { error } = await supabase.rpc("update_organization", {
    p_id: id,
    p_name: name.trim(),
    p_timezone: timezone,
  });
  if (error) fail(error);
}

export async function updateDisplayName(supabase: Client, userId: string, displayName: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", userId);
  if (error) fail(error);
}

export async function listAttachments(supabase: Client, assetId: string): Promise<AttachmentRecord[]> {
  const { data, error } = await supabase
    .from("attachments")
    .select("id, organization_id, asset_id, storage_path, file_name, content_type, byte_size, created_at")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  const rows = (data ?? []) as AttachmentRecord[];
  const withUrls = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage.from("asset-files").createSignedUrl(row.storage_path, 60 * 60);
      return { ...row, url: signed?.signedUrl ?? null };
    }),
  );
  return withUrls;
}

export async function uploadAssetPhoto(
  supabase: Client,
  asset: AssetRecord,
  file: { name: string; type: string; size: number; body: Blob },
): Promise<void> {
  const attachmentId = newId();
  const path = attachmentPath(asset.organization_id, asset.id, attachmentId, file.name || "photo.jpg");
  const { error: uploadError } = await supabase.storage.from("asset-files").upload(path, file.body, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (uploadError) fail(uploadError);
  const { error } = await supabase.rpc("attach_file", {
    p_id: attachmentId,
    p_event_id: newId(),
    p_asset_id: asset.id,
    p_path: path,
    p_file_name: file.name || "photo.jpg",
    p_content_type: file.type || "image/jpeg",
    p_byte_size: file.size,
  });
  if (error) {
    await supabase.storage.from("asset-files").remove([path]);
    fail(error);
  }
}

export async function removeAssetPhoto(supabase: Client, attachmentId: string): Promise<void> {
  const { data, error } = await supabase.rpc("remove_file", {
    p_attachment_id: attachmentId,
    p_event_id: newId(),
  });
  if (error) fail(error);
  if (typeof data === "string" && data) {
    await supabase.storage.from("asset-files").remove([data]);
  }
}

export async function seedDemoData(supabase: Client, organizationId: string): Promise<void> {
  const existing = await listAssets(supabase, organizationId);
  if (existing.some((asset) => asset.name === "PAA dosing skid")) return;

  const locationIds = new Map<string, string>();
  for (const location of DEMO_LOCATIONS) {
    const id = newId();
    const { error } = await supabase.from("locations").insert({
      id,
      organization_id: organizationId,
      name: location.name,
    });
    if (error) fail(error);
    locationIds.set(location.key, id);
  }

  for (const person of DEMO_PEOPLE) {
    await createEmployee(supabase, organizationId, {
      name: person.name,
      email: "",
      phone: "",
      hireDate: "",
      notes: "Sample person for checkout.",
    });
  }

  const assetIds = new Map<string, string>();
  for (const asset of demoAssets()) {
    const id = newId();
    const parentKey = asset.parentKey;
    await createAsset(
      supabase,
      organizationId,
      {
        name: asset.name,
        tagId: "",
        type: asset.type,
        locationId: locationIds.get(asset.locationKey) ?? null,
        groupLabel: asset.groupLabel ?? "",
        brand: asset.brand ?? "",
        model: asset.model ?? "",
        serial: asset.serial ?? "",
        vendor: "",
        purchaseDate: "",
        cost: asset.cost === undefined ? "" : String(asset.cost),
        notes: asset.notes ?? "",
        parentAssetId: parentKey ? (assetIds.get(parentKey) ?? null) : null,
        checkoutAsUnit: asset.checkoutAsUnit ?? false,
        customFields: asset.customFields ?? {},
      },
      { assetId: id },
    );
    assetIds.set(asset.key, id);
  }
}

export function dashboardAttention(assets: readonly AssetRecord[], timeZone: string, now = new Date()): AttentionItem[] {
  return attentionList(assets, timeZone, now);
}

export function blankAssetInput(type: AssetType = "equipment"): AssetInput {
  return {
    name: "",
    tagId: "",
    type,
    locationId: null,
    groupLabel: "",
    brand: "",
    model: "",
    serial: "",
    vendor: "",
    purchaseDate: "",
    cost: "",
    notes: "",
    parentAssetId: null,
    checkoutAsUnit: false,
    customFields: {},
  };
}

export type LookupRecord = {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  position: number;
  archived_at: string | null;
  counts_as_available?: boolean;
  needs_attention?: boolean;
  notify?: boolean;
};

export type FieldDefinition = {
  id: string;
  organization_id: string;
  type_key: string;
  key: string;
  label: string;
  kind: "text" | "date";
  position: number;
  archived_at: string | null;
};

export async function listStatuses(supabase: Client, organizationId: string): Promise<LookupRecord[]> {
  const { data, error } = await supabase
    .from("asset_statuses")
    .select("id, organization_id, key, label, position, archived_at, counts_as_available, needs_attention, notify")
    .eq("organization_id", organizationId)
    .order("position");
  if (error) fail(error);
  return (data ?? []) as LookupRecord[];
}

export async function listTypes(supabase: Client, organizationId: string): Promise<LookupRecord[]> {
  const { data, error } = await supabase
    .from("asset_types")
    .select("id, organization_id, key, label, position, archived_at")
    .eq("organization_id", organizationId)
    .order("position");
  if (error) fail(error);
  return (data ?? []) as LookupRecord[];
}

export async function listFieldDefinitions(supabase: Client, organizationId: string): Promise<FieldDefinition[]> {
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("id, organization_id, type_key, key, label, kind, position, archived_at")
    .eq("organization_id", organizationId)
    .order("position");
  if (error) fail(error);
  return (data ?? []) as FieldDefinition[];
}

export async function listNotificationEmails(supabase: Client, organizationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("notification_recipients")
    .select("email")
    .eq("organization_id", organizationId)
    .order("email");
  if (error) fail(error);
  return (data ?? []).map((row) => String((row as { email: string }).email));
}

export async function saveEmployeeRecord(
  supabase: Client,
  organizationId: string,
  input: {
    id?: string;
    name: string;
    title: string;
    email: string;
    phone: string;
    hireDate: string;
    leavingDate: string;
    notes: string;
    active: boolean;
    archived: boolean;
  },
): Promise<void> {
  const { error } = await supabase.rpc("save_employee", {
    p_id: input.id ?? newId(),
    p_event_id: newId(),
    p_organization_id: organizationId,
    p_employee: {
      name: input.name,
      title: input.title,
      email: input.email,
      phone: input.phone,
      hire_date: input.hireDate,
      termination_date: input.leavingDate,
      notes: input.notes,
      active: input.active,
      archived: input.archived,
    },
  });
  if (error) fail(error);
}

export async function saveLocationRecord(
  supabase: Client,
  organizationId: string,
  input: { id?: string; name: string; notes: string; archived: boolean },
): Promise<void> {
  const { error } = await supabase.rpc("save_location", {
    p_id: input.id ?? newId(),
    p_event_id: newId(),
    p_organization_id: organizationId,
    p_location: input,
  });
  if (error) fail(error);
}

export async function saveStatusRecord(supabase: Client, organizationId: string, input: Record<string, unknown> & { id?: string }): Promise<void> {
  const { error } = await supabase.rpc("save_asset_status", {
    p_id: input.id ?? newId(),
    p_event_id: newId(),
    p_organization_id: organizationId,
    p_status: input,
  });
  if (error) fail(error);
}

export async function saveTypeRecord(supabase: Client, organizationId: string, input: Record<string, unknown> & { id?: string }): Promise<void> {
  const { error } = await supabase.rpc("save_asset_type", {
    p_id: input.id ?? newId(),
    p_event_id: newId(),
    p_organization_id: organizationId,
    p_type: input,
  });
  if (error) fail(error);
}

export async function saveFieldRecord(supabase: Client, organizationId: string, input: Record<string, unknown> & { id?: string }): Promise<void> {
  const { error } = await supabase.rpc("save_custom_field", {
    p_id: input.id ?? newId(),
    p_event_id: newId(),
    p_organization_id: organizationId,
    p_field: input,
  });
  if (error) fail(error);
}

export async function saveNotificationEmails(supabase: Client, organizationId: string, emails: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_notification_recipients", {
    p_organization_id: organizationId,
    p_event_id: newId(),
    p_emails: emails,
  });
  if (error) fail(error);
}

export async function searchEvents(
  supabase: Client,
  organizationId: string,
  filters: { q?: string; subjectType?: string; subjectId?: string; eventType?: string; from?: string; to?: string },
): Promise<AssetEvent[]> {
  let query = supabase.from("events").select("*").eq("organization_id", organizationId).order("occurred_at", { ascending: false }).limit(400);
  if (filters.subjectType) query = query.eq("subject_type", filters.subjectType);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.eventType) query = query.eq("event_type", filters.eventType);
  if (filters.from) query = query.gte("occurred_at", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("occurred_at", `${filters.to}T23:59:59Z`);
  const { data, error } = await query;
  if (error) fail(error);
  const events = (data ?? []).map(parseEvent);
  const needle = filters.q?.trim().toLowerCase();
  if (!needle) return events;
  return events.filter((event) => {
    const haystack = [event.notes, event.actor_name, event.event_type, event.subject_type, JSON.stringify(event.payload), JSON.stringify(event.to_state)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export async function listCoverPhotos(supabase: Client, organizationId: string, assetIds: string[]): Promise<Record<string, string>> {
  if (assetIds.length === 0) return {};
  const { data, error } = await supabase
    .from("attachments")
    .select("asset_id, storage_path, created_at")
    .eq("organization_id", organizationId)
    .in("asset_id", assetIds)
    .order("created_at", { ascending: true });
  if (error) fail(error);
  const first = new Map<string, string>();
  for (const row of data ?? []) {
    const record = row as { asset_id: string; storage_path: string };
    if (!first.has(record.asset_id)) first.set(record.asset_id, record.storage_path);
  }
  const urls: Record<string, string> = {};
  await Promise.all(
    [...first.entries()].map(async ([assetId, path]) => {
      const { data: signed } = await supabase.storage.from("asset-files").createSignedUrl(path, 60 * 60);
      if (signed?.signedUrl) urls[assetId] = signed.signedUrl;
    }),
  );
  return urls;
}

export function inputFromAsset(asset: AssetRecord): AssetInput {
  return {
    name: asset.name,
    tagId: asset.tag_id,
    type: asset.type,
    locationId: asset.location_id,
    groupLabel: asset.group_label ?? "",
    brand: asset.brand ?? "",
    model: asset.model ?? "",
    serial: asset.serial ?? "",
    vendor: asset.vendor ?? "",
    purchaseDate: asset.purchase_date ?? "",
    cost: asset.cost === null ? "" : String(asset.cost),
    notes: asset.notes ?? "",
    parentAssetId: asset.parent_asset_id,
    checkoutAsUnit: asset.checkout_as_unit,
    customFields: { ...asset.custom_fields },
  };
}
