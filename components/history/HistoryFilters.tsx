"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { historyHref, type HistoryFilters } from "@/lib/history/query";

const recordOptions = [
  ["", "Any"],
  ["asset", "Asset"],
  ["employee", "Person"],
  ["location", "Location"],
  ["asset_status", "Status"],
  ["asset_type", "Type"],
  ["custom_field", "Custom field"],
  ["invite", "Invite"],
  ["subscription", "Subscription"],
] as const;

const eventOptions = [
  ["", "Any"],
  ["created", "Added"],
  ["updated", "Updated"],
  ["checked_out", "Checked out"],
  ["checked_in", "Checked in"],
  ["status_changed", "Status changed"],
  ["archived", "Archived"],
  ["moved", "Moved"],
  ["invite_sent", "Invite sent"],
  ["renewed", "Renewed"],
  ["cancelled", "Cancelled"],
] as const;

export function HistoryFilterForm({ filters, personLabel }: { filters: HistoryFilters; personLabel: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [type, setType] = useState(filters.subjectType);
  const [eventType, setEventType] = useState(filters.eventType);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const url = historyHref(filters);

  function draft(next?: Partial<HistoryFilters>): HistoryFilters {
    const subjectType = next?.subjectType ?? type;
    const keepPerson = subjectType === "employee" && filters.subjectType === "employee" && Boolean(filters.subjectId);
    return {
      q: next?.q ?? q,
      subjectType,
      subjectId: keepPerson ? filters.subjectId : "",
      eventType: next?.eventType ?? eventType,
      from: next?.from ?? from,
      to: next?.to ?? to,
    };
  }

  const nextHref = historyHref(draft());

  useEffect(() => {
    if (nextHref === url) return;
    const handle = window.setTimeout(() => router.replace(nextHref, { scroll: false }), 300);
    return () => window.clearTimeout(handle);
  }, [nextHref, url, router]);

  function apply(event: FormEvent) {
    event.preventDefault();
    router.replace(nextHref, { scroll: false });
  }

  const clearPerson = historyHref({ ...filters, subjectType: "", subjectId: "" });

  return (
    <form method="get" action="/history" className="grid gap-3 rounded-3xl bg-card p-4 sm:grid-cols-2" onSubmit={apply}>
      {personLabel ? (
        <Link href={clearPerson} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-ink px-3 text-sm text-paper sm:col-span-2">
          {personLabel}
          <span aria-hidden="true">×</span>
          <span className="sr-only">Remove person filter</span>
        </Link>
      ) : null}
      <label className="grid gap-1 text-sm sm:col-span-2">
        Search
        <input
          name="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="min-h-12 rounded-2xl border border-line px-3"
          placeholder="Asset, tag, person, field, or value"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Record
        <select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-paper px-3"
        >
          {recordOptions.map(([value, label]) => (
            <option key={value || "any"} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Action
        <select
          name="event"
          value={eventType}
          onChange={(event) => setEventType(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-paper px-3"
        >
          {eventOptions.map(([value, label]) => (
            <option key={value || "any-event"} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        From
        <input type="date" name="from" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-12 rounded-2xl border border-line px-3" />
      </label>
      <label className="grid gap-1 text-sm">
        To
        <input type="date" name="to" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-12 rounded-2xl border border-line px-3" />
      </label>
      {type === "employee" && filters.subjectId ? <input type="hidden" name="id" value={filters.subjectId} /> : null}
      <button type="submit" className="min-h-12 rounded-full bg-ink px-4 text-paper sm:col-span-2">Filter</button>
    </form>
  );
}
