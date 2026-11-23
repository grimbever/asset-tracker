import type { AssetRecord } from "./types";

export type AttentionKind = "overdue_checkout" | "due_soon" | "registration" | "calibration";

export type AttentionItem = {
  assetId: string;
  tagId: string;
  name: string;
  kind: AttentionKind;
  on: string;
  label: string;
};

const DAY = 24 * 60 * 60 * 1000;

function calendarDay(isoDate: string, timeZone: string, now: Date): number {
  const target = new Date(`${isoDate}T12:00:00Z`);
  const today = zonedDayNumber(now, timeZone);
  const due = zonedDayNumber(target, timeZone);
  return Math.round((due - today) / DAY);
}

function zonedDayNumber(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return Date.UTC(year, month - 1, day);
}

export function daysUntil(isoDate: string, timeZone: string, now: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return calendarDay(isoDate, timeZone, now);
}

export function attentionForAsset(asset: AssetRecord, timeZone: string, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (asset.status === "checked_out" && asset.due_on) {
    const days = daysUntil(asset.due_on, timeZone, now);
    if (days !== null && days < 0) {
      items.push({
        assetId: asset.id,
        tagId: asset.tag_id,
        name: asset.name,
        kind: "overdue_checkout",
        on: asset.due_on,
        label: days === -1 ? "Checkout was due yesterday" : `Checkout is ${Math.abs(days)} days overdue`,
      });
    } else if (days !== null && days <= 7) {
      items.push({
        assetId: asset.id,
        tagId: asset.tag_id,
        name: asset.name,
        kind: "due_soon",
        on: asset.due_on,
        label: days === 0 ? "Checkout is due today" : `Checkout is due in ${days} day${days === 1 ? "" : "s"}`,
      });
    }
  }

  const registration = asset.custom_fields.registration_expiry;
  if (registration) {
    const days = daysUntil(registration, timeZone, now);
    if (days !== null && days <= 30) {
      items.push({
        assetId: asset.id,
        tagId: asset.tag_id,
        name: asset.name,
        kind: "registration",
        on: registration,
        label: days < 0 ? "Registration is overdue" : days === 0 ? "Registration expires today" : `Registration expires in ${days} days`,
      });
    }
  }

  const calibration = asset.custom_fields.next_calibration;
  if (calibration) {
    const days = daysUntil(calibration, timeZone, now);
    if (days !== null && days <= 30) {
      items.push({
        assetId: asset.id,
        tagId: asset.tag_id,
        name: asset.name,
        kind: "calibration",
        on: calibration,
        label: days < 0 ? "Calibration is overdue" : days === 0 ? "Calibration is due today" : `Calibration is due in ${days} days`,
      });
    }
  }

  return items;
}

export function attentionList(assets: readonly AssetRecord[], timeZone: string, now: Date): AttentionItem[] {
  return assets
    .flatMap((asset) => attentionForAsset(asset, timeZone, now))
    .sort((a, b) => a.on.localeCompare(b.on) || a.name.localeCompare(b.name));
}

export function statusCounts(assets: readonly { status: string }[]): { status: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const asset of assets) counts.set(asset.status, (counts.get(asset.status) ?? 0) + 1);
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}
