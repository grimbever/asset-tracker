import { daysUntil } from "@/lib/assets/attention";

export type UpcomingBucket = "overdue" | "7" | "30" | "90" | "180";

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

/** Exclusive windows so a date appears in one group. Dates past 180 days are left off the list. */
export function bucketForDays(days: number): UpcomingBucket | null {
  if (days < 0) return "overdue";
  if (days <= 7) return "7";
  if (days <= 30) return "30";
  if (days <= 90) return "90";
  if (days <= 180) return "180";
  return null;
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
  input: { id: string; href: string; who: string; what: string; dueOn: string | null; timeZone: string; now: Date },
) {
  if (!input.dueOn) return;
  const days = daysUntil(input.dueOn, input.timeZone, input.now);
  if (days === null) return;
  const bucket = bucketForDays(days);
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
  },
  timeZone: string,
  now: Date,
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
      });
    }
    for (const field of dateFields) {
      pushDate(items, {
        id: `field-${asset.id}-${field.key}`,
        href: `/assets/${asset.id}`,
        who: asset.name,
        what: field.label,
        dueOn: asset.custom_fields[field.key] ?? null,
        timeZone,
        now,
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
    });
  }

  return items.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.who.localeCompare(b.who));
}

export function groupUpcoming(items: readonly UpcomingItem[]): Record<UpcomingBucket, UpcomingItem[]> {
  const groups: Record<UpcomingBucket, UpcomingItem[]> = { overdue: [], "7": [], "30": [], "90": [], "180": [] };
  for (const item of items) groups[item.bucket].push(item);
  return groups;
}
