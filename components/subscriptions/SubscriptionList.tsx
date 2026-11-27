"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { annualizedCost, cycleLabel, displaySubscriptionStatus, statusLabel } from "@/lib/subscriptions/plan";
import type { SubscriptionCategory, SubscriptionRecord } from "@/lib/subscriptions/data";

export function SubscriptionList({
  subscriptions,
  categories,
  canManage,
  today,
}: {
  subscriptions: SubscriptionRecord[];
  categories: SubscriptionCategory[];
  canManage: boolean;
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [sort, setSort] = useState<"renews_on" | "name" | "vendor">("renews_on");
  const [showArchived, setShowArchived] = useState(false);
  const categoryName = Object.fromEntries(categories.map((item) => [item.id, item.name]));
  const vendors = [...new Set(subscriptions.map((item) => item.vendor).filter(Boolean))] as string[];

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = subscriptions.filter((item) => {
      if (!showArchived && item.archived_at) return false;
      const shown = displaySubscriptionStatus({
        status: item.status,
        renewsOn: item.renews_on,
        noticeDays: item.notice_days,
        today,
      });
      if (status !== "all" && shown !== status) return false;
      if (category !== "all" && item.category_id !== category) return false;
      if (vendor !== "all" && item.vendor !== vendor) return false;
      if (!needle) return true;
      return [item.name, item.vendor, item.plan_name, categoryName[item.category_id ?? ""]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
    return visible.sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "vendor") return (left.vendor ?? "").localeCompare(right.vendor ?? "");
      return (left.renews_on ?? "9999-99-99").localeCompare(right.renews_on ?? "9999-99-99");
    });
  }, [category, categoryName, query, showArchived, sort, status, subscriptions, today, vendor]);

  const totals = new Map<string, number>();
  for (const item of rows) {
    const shown = displaySubscriptionStatus({
      status: item.status,
      renewsOn: item.renews_on,
      noticeDays: item.notice_days,
      today,
    });
    if (shown === "cancelled" || item.archived_at) continue;
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + annualizedCost(item.cost, item.billing_cycle));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-4xl tracking-tight">Subscriptions</h1>
        {canManage ? (
          <Link href="/subscriptions/new" className="inline-flex min-h-12 items-center rounded-full bg-ember px-4 text-white">
            Add subscription
          </Link>
        ) : null}
      </div>
      <p className="text-sm text-muted">
        Yearly cost of the list below:{" "}
        {totals.size === 0
          ? "0"
          : [...totals.entries()].map(([currency, amount]) => `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(" · ")}
      </p>
      <div className="grid gap-2 sm:grid-cols-4">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or vendor" aria-label="Search subscriptions" className="min-h-12 rounded-2xl border border-line bg-card px-3" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="min-h-12 rounded-2xl border border-line bg-card px-3">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="pending_renewal">Pending renewal</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category" className="min-h-12 rounded-2xl border border-line bg-card px-3">
          <option value="all">Any category</option>
          {categories.filter((item) => !item.archived_at).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <select value={vendor} onChange={(event) => setVendor(event.target.value)} aria-label="Filter by vendor" className="min-h-12 rounded-2xl border border-line bg-card px-3">
          <option value="all">Any vendor</option>
          {vendors.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="underline" onClick={() => setSort("renews_on")}>Sort by renewal</button>
        <button type="button" className="underline" onClick={() => setSort("vendor")}>Sort by vendor</button>
        <button type="button" className="underline" onClick={() => setSort("name")}>Sort by name</button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          Show archived
        </label>
      </div>
      <ul className="grid gap-2">
        {rows.map((item) => {
          const shown = displaySubscriptionStatus({
            status: item.status,
            renewsOn: item.renews_on,
            noticeDays: item.notice_days,
            today,
          });
          return (
            <li key={item.id}>
              <Link href={`/subscriptions/${item.id}`} className="block rounded-2xl bg-card px-4 py-3">
                <span className="font-medium">{item.name}</span>
                <span className="mt-1 block text-sm text-muted">
                  {[item.vendor, item.category_id ? categoryName[item.category_id] : null, statusLabel(shown), item.renews_on ? `Renews ${item.renews_on}` : null, cycleLabel(item.billing_cycle)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 ? <p className="text-sm text-muted">No subscriptions match.</p> : null}
    </div>
  );
}
