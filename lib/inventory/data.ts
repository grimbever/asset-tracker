import type { SupabaseClient } from "@supabase/supabase-js";
import { messageFrom } from "@/lib/data/errors";
import { newId } from "@/lib/ids";

type Client = SupabaseClient;

export type Consumable = {
  id: string;
  organization_id: string;
  name: string;
  category: string | null;
  unit: string;
  sku: string | null;
  location_id: string | null;
  quantity_on_hand: number;
  minimum_quantity: number;
  reorder_quantity: number;
  vendor: string | null;
  unit_cost: number | null;
  notes: string | null;
  active: boolean;
  archived_at: string | null;
  photo_path: string | null;
  bin_code: string | null;
};

export type StockAdjustment = {
  id: string;
  kind: string;
  quantity_delta: number;
  notes: string | null;
  created_at: string;
};

function fail(error: unknown): never {
  throw new Error(messageFrom(error));
}

export function parseConsumable(value: Record<string, unknown>): Consumable {
  return {
    id: String(value.id),
    organization_id: String(value.organization_id),
    name: String(value.name),
    category: (value.category as string | null) ?? null,
    unit: String(value.unit ?? "each"),
    sku: (value.sku as string | null) ?? null,
    location_id: (value.location_id as string | null) ?? null,
    quantity_on_hand: Number(value.quantity_on_hand ?? 0),
    minimum_quantity: Number(value.minimum_quantity ?? 0),
    reorder_quantity: Number(value.reorder_quantity ?? 0),
    vendor: (value.vendor as string | null) ?? null,
    unit_cost: value.unit_cost === null || value.unit_cost === undefined ? null : Number(value.unit_cost),
    notes: (value.notes as string | null) ?? null,
    active: value.active !== false,
    archived_at: (value.archived_at as string | null) ?? null,
    photo_path: (value.photo_path as string | null) ?? null,
    bin_code: (value.bin_code as string | null) ?? null,
  };
}

export async function listConsumables(supabase: Client, organizationId: string): Promise<Consumable[]> {
  const { data, error } = await supabase.from("consumables").select("*").eq("organization_id", organizationId).order("name");
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(parseConsumable);
}

export async function listStockAdjustments(supabase: Client, consumableId: string): Promise<StockAdjustment[]> {
  const { data, error } = await supabase
    .from("stock_adjustments")
    .select("id, kind, quantity_delta, notes, created_at")
    .eq("consumable_id", consumableId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail(error);
  return (data ?? []) as StockAdjustment[];
}

export async function saveConsumableRecord(
  supabase: Client,
  organizationId: string,
  id: string,
  item: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("save_consumable", {
    p_id: id,
    p_event_id: newId(),
    p_organization_id: organizationId,
    p_item: item,
  });
  if (error) fail(error);
}

export async function adjustStock(
  supabase: Client,
  id: string,
  kind: "receive" | "use" | "correction",
  quantity: number,
  reason: string,
): Promise<{ crossed: boolean; name: string; organization_id: string }> {
  const { data, error } = await supabase.rpc("adjust_consumable_stock", {
    p_id: id,
    p_event_id: newId(),
    p_kind: kind,
    p_quantity: quantity,
    p_reason: reason,
    p_employee_id: null,
  });
  if (error) fail(error);
  const row = (data ?? {}) as { crossed?: boolean; name?: string; organization_id?: string };
  return { crossed: Boolean(row.crossed), name: String(row.name ?? ""), organization_id: String(row.organization_id ?? "") };
}
