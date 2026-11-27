import type { SupabaseClient } from "@supabase/supabase-js";
import { newId } from "@/lib/ids";
import { messageFrom } from "@/lib/data/errors";
import type { AssetEvent } from "@/lib/assets/events";

type Client = SupabaseClient;

export type SubscriptionRecord = {
  id: string;
  organization_id: string;
  name: string;
  vendor: string | null;
  category_id: string | null;
  plan_name: string | null;
  seats: number | null;
  cost: number | null;
  currency: string;
  billing_cycle: string;
  started_on: string | null;
  renews_on: string | null;
  auto_renew: boolean;
  notice_days: number | null;
  payment_note: string | null;
  owner_employee_id: string | null;
  vendor_url: string | null;
  notes: string | null;
  status: string;
  archived_at: string | null;
  license_key?: string | null;
};

export type SubscriptionCategory = { id: string; name: string; archived_at: string | null };

function fail(error: unknown): never {
  throw new Error(messageFrom(error));
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseSubscription(value: Record<string, unknown>, licenseKey?: string | null): SubscriptionRecord {
  return {
    id: String(value.id),
    organization_id: String(value.organization_id),
    name: String(value.name),
    vendor: (value.vendor as string | null) ?? null,
    category_id: (value.category_id as string | null) ?? null,
    plan_name: (value.plan_name as string | null) ?? null,
    seats: asNumber(value.seats),
    cost: asNumber(value.cost),
    currency: String(value.currency ?? "USD"),
    billing_cycle: String(value.billing_cycle),
    started_on: (value.started_on as string | null) ?? null,
    renews_on: (value.renews_on as string | null) ?? null,
    auto_renew: Boolean(value.auto_renew),
    notice_days: asNumber(value.notice_days),
    payment_note: (value.payment_note as string | null) ?? null,
    owner_employee_id: (value.owner_employee_id as string | null) ?? null,
    vendor_url: (value.vendor_url as string | null) ?? null,
    notes: (value.notes as string | null) ?? null,
    status: String(value.status),
    archived_at: (value.archived_at as string | null) ?? null,
    license_key: licenseKey,
  };
}

export async function listSubscriptions(supabase: Client, organizationId: string, includeSecrets: boolean): Promise<SubscriptionRecord[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("renews_on", { ascending: true, nullsFirst: false });
  if (error) fail(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  const secrets = new Map<string, string | null>();
  if (includeSecrets && rows.length) {
    const { data: secretRows, error: secretError } = await supabase
      .from("subscription_secrets")
      .select("subscription_id, license_key")
      .eq("organization_id", organizationId);
    if (secretError) fail(secretError);
    for (const secret of secretRows ?? []) {
      const record = secret as { subscription_id: string; license_key: string | null };
      secrets.set(record.subscription_id, record.license_key);
    }
  }
  return rows.map((row) => parseSubscription(row, includeSecrets ? secrets.get(String(row.id)) ?? null : undefined));
}

export async function listSubscriptionLinks(supabase: Client, organizationId: string): Promise<{
  people: { subscription_id: string; employee_id: string }[];
  assets: { subscription_id: string; asset_id: string }[];
}> {
  const [people, assets] = await Promise.all([
    supabase.from("subscription_people").select("subscription_id, employee_id").eq("organization_id", organizationId),
    supabase.from("subscription_assets").select("subscription_id, asset_id").eq("organization_id", organizationId),
  ]);
  if (people.error) fail(people.error);
  if (assets.error) fail(assets.error);
  return {
    people: (people.data ?? []) as { subscription_id: string; employee_id: string }[],
    assets: (assets.data ?? []) as { subscription_id: string; asset_id: string }[],
  };
}

export async function listSubscriptionCategories(supabase: Client, organizationId: string): Promise<SubscriptionCategory[]> {
  const { data, error } = await supabase
    .from("subscription_categories")
    .select("id, name, archived_at")
    .eq("organization_id", organizationId)
    .order("position");
  if (error) fail(error);
  return (data ?? []) as SubscriptionCategory[];
}

export async function listSubscriptionFiles(supabase: Client, subscriptionId: string): Promise<{ id: string; file_name: string; storage_path: string }[]> {
  const { data, error } = await supabase
    .from("subscription_files")
    .select("id, file_name, storage_path")
    .eq("subscription_id", subscriptionId)
    .order("created_at");
  if (error) fail(error);
  return (data ?? []) as { id: string; file_name: string; storage_path: string }[];
}

export async function listSubscriptionEvents(supabase: Client, subscriptionId: string): Promise<AssetEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("subject_type", "subscription")
    .eq("subject_id", subscriptionId)
    .order("occurred_at", { ascending: false })
    .limit(50);
  if (error) fail(error);
  return (data ?? []) as AssetEvent[];
}

export async function reminderDays(supabase: Client, organizationId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("subscription_reminder_settings")
    .select("days")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) fail(error);
  const days = (data as { days?: number[] } | null)?.days;
  return days && days.length ? days : [30, 7];
}

export type SubscriptionInput = {
  name: string;
  vendor: string;
  categoryId: string;
  planName: string;
  seats: string;
  cost: string;
  currency: string;
  billingCycle: string;
  startedOn: string;
  renewsOn: string;
  autoRenew: boolean;
  noticeDays: string;
  paymentNote: string;
  ownerId: string;
  vendorUrl: string;
  notes: string;
  status: string;
  licenseKey: string;
  people: string[];
  assets: string[];
  archived?: boolean;
};

export async function saveSubscriptionRecord(
  supabase: Client,
  organizationId: string,
  id: string | undefined,
  input: SubscriptionInput,
): Promise<void> {
  const { error } = await supabase.rpc("save_subscription", {
    p_id: id ?? newId(),
    p_event_id: newId(),
    p_organization_id: organizationId,
    p_subscription: {
      name: input.name,
      vendor: input.vendor,
      category_id: input.categoryId,
      plan_name: input.planName,
      seats: input.seats,
      cost: input.cost,
      currency: input.currency,
      billing_cycle: input.billingCycle,
      started_on: input.startedOn,
      renews_on: input.renewsOn,
      auto_renew: input.autoRenew,
      notice_days: input.noticeDays,
      payment_note: input.paymentNote,
      owner_employee_id: input.ownerId,
      vendor_url: input.vendorUrl,
      notes: input.notes,
      status: input.status,
      archived: Boolean(input.archived),
    },
    p_people: input.people,
    p_assets: input.assets,
    p_license_key: input.licenseKey,
    p_set_secret: true,
  });
  if (error) fail(error);
}

export async function renewSubscriptionRecord(supabase: Client, id: string, paid: string): Promise<void> {
  const amount = paid.trim() ? Number(paid) : null;
  const { error } = await supabase.rpc("renew_subscription", {
    p_id: id,
    p_event_id: newId(),
    p_paid: amount,
  });
  if (error) fail(error);
}

export async function cancelSubscriptionRecord(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_subscription", { p_id: id, p_event_id: newId() });
  if (error) fail(error);
}

export async function saveSubscriptionCategory(supabase: Client, organizationId: string, name: string, id?: string, archived = false): Promise<void> {
  const { error } = await supabase.rpc("save_subscription_category", {
    p_id: id ?? newId(),
    p_organization_id: organizationId,
    p_name: name,
    p_archived: archived,
  });
  if (error) fail(error);
}

export async function saveReminderDays(supabase: Client, organizationId: string, days: number[]): Promise<void> {
  const { error } = await supabase.rpc("set_subscription_reminder_days", {
    p_organization_id: organizationId,
    p_days: days,
  });
  if (error) fail(error);
}
