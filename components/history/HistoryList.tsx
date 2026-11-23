import { readFieldChanges } from "@/lib/audit";
import { eventLabel } from "@/lib/assets/events";
import type { AssetEvent } from "@/lib/assets/events";
import { formatWhen } from "@/lib/format";

export function HistoryList({ events, timeZone }: { events: AssetEvent[]; timeZone: string }) {
  if (events.length === 0) return <p className="text-sm text-muted">No history yet.</p>;
  return (
    <ol className="grid gap-3">
      {events.map((event) => {
        const changes = readFieldChanges(event.payload);
        const title = typeof event.payload.name === "string" ? event.payload.name : null;
        return (
          <li key={event.id} className="rounded-2xl bg-card px-4 py-3">
            <p className="text-sm font-medium">
              {eventLabel(event.event_type)}
              {title ? ` · ${title}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted">
              {formatWhen(event.occurred_at, timeZone)}
              {event.actor_name ? ` · ${event.actor_name}` : ""}
              {` · ${event.subject_type.replaceAll("_", " ")}`}
            </p>
            {event.notes ? <p className="mt-2 text-sm">{event.notes}</p> : null}
            {changes.length > 0 ? (
              <dl className="mt-2 grid gap-1 text-sm">
                {changes.map((change) => (
                  <div key={change.field} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                    <dt className="text-muted">{change.field.replaceAll("_", " ")}</dt>
                    <dd>
                      {change.before ?? "—"} → {change.after ?? "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
