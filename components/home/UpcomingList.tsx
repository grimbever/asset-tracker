import Link from "next/link";
import { formatDate } from "@/lib/format";
import { UPCOMING_BUCKETS, daysRemainingLabel, groupUpcoming, type UpcomingItem } from "@/lib/upcoming";

export function UpcomingList({ items, timeZone }: { items: UpcomingItem[]; timeZone: string }) {
  const groups = groupUpcoming(items);
  return (
    <section className="grid gap-3">
      <h2 className="font-serif text-2xl">Upcoming</h2>
      {items.length === 0 ? <p className="text-sm text-muted">Nothing due in the next 180 days.</p> : null}
      {UPCOMING_BUCKETS.map((bucket) => {
        const rows = groups[bucket.id];
        return (
          <details key={bucket.id} open={bucket.id === "overdue" && rows.length > 0} className="rounded-3xl bg-card">
            <summary className="cursor-pointer list-none px-4 py-3 font-medium">
              <span className="flex items-center justify-between gap-3">
                <span>{bucket.label}</span>
                <span className="rounded-full bg-paper-deep px-2 py-0.5 text-sm text-muted">{rows.length}</span>
              </span>
            </summary>
            {rows.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">None</p>
            ) : (
              <ul className="grid gap-2 px-4 pb-4">
                {rows.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="block rounded-2xl bg-paper px-3 py-3">
                      <span className="font-medium">{item.who}</span>
                      <span className="mt-1 block text-sm">{item.what}</span>
                      <span className="mt-1 block text-sm text-muted">
                        {formatDate(item.dueOn, timeZone)} · {daysRemainingLabel(item.days)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </details>
        );
      })}
    </section>
  );
}
