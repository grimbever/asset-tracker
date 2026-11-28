import { daysUntil } from "@/lib/assets/attention";
import { DEFAULT_UPCOMING_DAYS } from "@/lib/company/matrix";
import { renewalAttentionDate } from "@/lib/subscriptions/plan";

export type UpcomingBucket = "overdue" | (string & {});

export type UpcomingItem = {
  id: string;
  href: string;
  who: string;
  what: string;
  dueOn: string;
  days: number;
  bucket: UpcomingBucket;
};

export const UPCOMING_BUCKETS: { id: UpcomingBucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "7", label: "Next 7 days" },
  { id: "30", label: "8–30 days" },
  { id: "90", label: "31–90 days" },
  { id: "180", label: "91–180 days" },
];

/** Exclusive windows so a date appears in one group. Dates past the last window are left off the list. */
export function bucketForDays(days: number, edges: readonly number[] = DEFAULT_UPCOMING_DAYS): UpcomingBucket | null {
  if (days < 0) return "overdue";
  for (const edge of edges) {
    if (days <= edge) return String(edge);
  }
  return null;
}

export function upcomingBuckets(edges: readonly number[] = DEFAULT_UPCOMING_DAYS): { id: string; label: string }[] {
  const buckets = [{ id: "overdue", label: "Overdue" }];
  let previous = 0;
  for (const edge of edges) {
    buckets.push({
      id: String(edge),
      label: previous === 0 ? `Next ${edge} days` : `${previous + 1}–${edge} days`,
    });
    previous = edge;
  }
  return buckets;
}

export function daysRemainingLabel(days: number): string {
  if (days < 0) {
    const overdue = Math.abs(days);
    return overdue === 1 ? "1 day overdue" : `${overdue} days overdue`;
  }
  if (days === 0) return "Due today";
  return days === 1 ? "1 day left" : `${days} days left`;
}

type AssetSource = {
  id: string;
  name: string;
  status: string;
  due_on: string | null;
  archived_at: string | null;
  warranty_end?: string | null;
  custom_fields: Record<string, string>;
};

type PersonSource = {
  id: string;
  name: string;
  termination_date: string | null;
  archived_at: string | null;
};

type FieldSource = {
  key: string;
  label: string;
  kind: string;
  archived_at: string | null;
};

type MaintenanceSource = {
  id: string;
  title: string;
  due_on: string | null;
  completed_at: string | null;
  asset_id: string | null;
  assetName: string | null;
  assetArchived: boolean;
};

function pushDate(
  items: UpcomingItem[],
  input: { id: string; href: string; who: string; what: string; dueOn: string | null; timeZone: string; now: Date; edges: readonly number[] },
) {
  if (!input.dueOn) return;
  const days = daysUntil(input.dueOn, input.timeZone, input.now);
  if (days === null) return;
  const bucket = bucketForDays(days, input.edges);
  if (!bucket) return;
  items.push({
    id: input.id,
    href: input.href,
    who: input.who,
    what: input.what,
    dueOn: input.dueOn,
    days,
    bucket,
  });
}

export function collectUpcoming(
  source: {
    assets: readonly AssetSource[];
    people: readonly PersonSource[];
    fields: readonly FieldSource[];
    maintenance: readonly MaintenanceSource[];
    subscriptions?: readonly {
      id: string;
      name: string;
      renews_on: string | null;
      notice_days: number | null;
      status: string;
      archived_at: string | null;
    }[];
  },
  timeZone: string,
  now: Date,
  edges: readonly number[] = DEFAULT_UPCOMING_DAYS,
): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  const dateFields = source.fields.filter(
    (field) => field.kind === "date" && !field.archived_at && !field.key.startsWith("last_"),
  );

  for (const asset of source.assets) {
    if (asset.archived_at) continue;
    if (asset.status === "checked_out") {
      pushDate(items, {
        id: `due-${asset.id}`,
        href: `/assets/${asset.id}`,
        who: asset.name,
        what: "Expected return",
        dueOn: asset.due_on,
        timeZone,
        now,
        edges,
      });
    }
    pushDate(items, {
      id: `warranty-${asset.id}`,
      href: `/assets/${asset.id}`,
      who: asset.name,
      what: "Warranty ends",
      dueOn: asset.warranty_end ?? null,
      timeZone,
      now,
      edges,
    });
    for (const field of dateFields) {
      pushDate(items, {
        id: `field-${asset.id}-${field.key}`,
        href: `/assets/${asset.id}`,
        who: asset.name,
        what: field.label,
        dueOn: asset.custom_fields[field.key] ?? null,
        timeZone,
        now,
        edges,
      });
    }
  }

  for (const person of source.people) {
    if (person.archived_at) continue;
    pushDate(items, {
      id: `leave-${person.id}`,
      href: `/people#person-${person.id}`,
      who: person.name,
      what: "Leaving date — assets to recover",
      dueOn: person.termination_date,
      timeZone,
      now,
      edges,
    });
  }

  for (const subscription of source.subscriptions ?? []) {
    if (subscription.archived_at || subscription.status === "cancelled") continue;
    pushDate(items, {
      id: `sub-${subscription.id}`,
      href: `/subscriptions/${subscription.id}`,
      who: subscription.name,
      what: subscription.notice_days ? `Renewal · ${subscription.notice_days} day notice` : "Renewal",
      dueOn: renewalAttentionDate(subscription.renews_on, subscription.notice_days),
      timeZone,
      now,
      edges,
    });
  }

  for (const job of source.maintenance) {
    if (job.completed_at || job.assetArchived) continue;
    pushDate(items, {
      id: `maint-${job.id}`,
      href: job.asset_id ? `/assets/${job.asset_id}` : "/home",
      who: job.assetName ?? job.title,
      what: job.title || "Maintenance",
      dueOn: job.due_on,
      timeZone,
      now,
      edges,
    });
  }

  return items.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.who.localeCompare(b.who));
}

export function groupUpcoming(items: readonly UpcomingItem[]): Record<string, UpcomingItem[]> {
  const groups: Record<string, UpcomingItem[]> = { overdue: [], "7": [], "30": [], "90": [], "180": [] };
  for (const item of items) {
    if (!groups[item.bucket]) groups[item.bucket] = [];
    groups[item.bucket].push(item);
  }
  return groups;
}
