"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HistoryList } from "@/components/history/HistoryList";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import type { AssetEvent } from "@/lib/assets/events";
import { messageFrom } from "@/lib/data/errors";
import { newId } from "@/lib/ids";
import { cycleLabel, displaySubscriptionStatus, statusLabel } from "@/lib/subscriptions/plan";
import {
  cancelSubscriptionRecord,
  renewSubscriptionRecord,
  saveSubscriptionRecord,
  type SubscriptionRecord,
} from "@/lib/subscriptions/data";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function SubscriptionDetail({
  subscription,
  categoryName,
  ownerName,
  people,
  peopleIds,
  assets,
  files,
  events,
  timeZone,
  canManage,
  today,
}: {
  subscription: SubscriptionRecord;
  categoryName: string | null;
  ownerName: string | null;
  people: string[];
  peopleIds: string[];
  assets: { id: string; name: string }[];
  files: { id: string; file_name: string; storage_path: string }[];
  events: AssetEvent[];
  timeZone: string;
  canManage: boolean;
  today: string;
}) {
  const router = useRouter();
  const [paid, setPaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const shown = displaySubscriptionStatus({
    status: subscription.status,
    renewsOn: subscription.renews_on,
    noticeDays: subscription.notice_days,
    today,
  });

  async function run(action: () => Promise<void>) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{subscription.name}</h1>
          <p className="mt-2 text-sm text-muted">{[subscription.vendor, categoryName, statusLabel(shown)].filter(Boolean).join(" · ")}</p>
        </div>
        {canManage ? <Link href={`/subscriptions/${subscription.id}/edit`} className="inline-flex min-h-12 items-center rounded-full border border-line bg-card px-4">Edit</Link> : null}
      </div>
      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <dl className="grid gap-3 rounded-3xl bg-card p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Plan</dt><dd>{subscription.plan_name ?? "—"}</dd></div>
        <div><dt className="text-muted">Seats</dt><dd>{subscription.seats ?? "—"}</dd></div>
        <div><dt className="text-muted">Cost</dt><dd>{subscription.cost === null ? "—" : `${subscription.currency} ${subscription.cost}`}</dd></div>
        <div><dt className="text-muted">Billing</dt><dd>{cycleLabel(subscription.billing_cycle)}{subscription.auto_renew ? " · auto-renew" : ""}</dd></div>
        <div><dt className="text-muted">Started</dt><dd>{subscription.started_on ?? "—"}</dd></div>
        <div><dt className="text-muted">Renews</dt><dd>{subscription.renews_on ?? "—"}</dd></div>
        <div><dt className="text-muted">Notice</dt><dd>{subscription.notice_days === null ? "—" : `${subscription.notice_days} days`}</dd></div>
        <div><dt className="text-muted">Owner</dt><dd>{ownerName ?? "—"}</dd></div>
        <div><dt className="text-muted">Payment</dt><dd>{subscription.payment_note ?? "—"}</dd></div>
        <div><dt className="text-muted">URL</dt><dd>{subscription.vendor_url ? <a className="underline" href={subscription.vendor_url}>{subscription.vendor_url}</a> : "—"}</dd></div>
        {canManage ? <div><dt className="text-muted">License key or account ID</dt><dd>{subscription.license_key || "—"}</dd></div> : null}
      </dl>
      {people.length ? <p className="text-sm">People: {people.join(", ")}</p> : null}
      {assets.length ? (
        <ul className="grid gap-1 text-sm">
          {assets.map((asset) => <li key={asset.id}><Link className="underline" href={`/assets/${asset.id}`}>{asset.name}</Link></li>)}
        </ul>
      ) : null}
      {subscription.notes ? <p className="rounded-2xl bg-card p-4 text-sm">{subscription.notes}</p> : null}
      <section className="grid gap-2">
        <h2 className="font-serif text-2xl">Files</h2>
        <ul className="grid gap-1 text-sm">
          {files.map((file) => <li key={file.id}>{file.file_name}</li>)}
        </ul>
        {files.length === 0 ? <p className="text-sm text-muted">No invoices or contracts yet.</p> : null}
        {canManage ? (
          <label className="inline-flex min-h-12 w-fit cursor-pointer items-center rounded-full border border-line bg-card px-4">
            Add PDF or image
            <input
              type="file"
              accept="application/pdf,image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  const id = newId();
                  const path = `${subscription.organization_id}/subscriptions/${subscription.id}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
                  const uploaded = await supabase.storage.from("asset-files").upload(path, file, { contentType: file.type });
                  if (uploaded.error) throw uploaded.error;
                  const inserted = await supabase.from("subscription_files").insert({
                    id,
                    organization_id: subscription.organization_id,
                    subscription_id: subscription.id,
                    storage_path: path,
                    file_name: file.name,
                    content_type: file.type,
                    byte_size: file.size,
                  });
                  if (inserted.error) throw inserted.error;
                  setMessage("File added.");
                });
              }}
            />
          </label>
        ) : null}
      </section>
      {canManage && !subscription.archived_at ? (
        <section className="grid gap-3 rounded-3xl border border-line p-4">
          <h2 className="font-serif text-2xl">Renew</h2>
          <p className="text-sm text-muted">Moves the renewal date forward one billing cycle and writes it to history.</p>
          <Field label="Amount paid, optional"><TextInput inputMode="decimal" value={paid} onChange={(event) => setPaid(event.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || subscription.billing_cycle === "one_time"} onClick={() => void run(async () => {
              const supabase = getBrowserSupabase();
              if (!supabase) return;
              await renewSubscriptionRecord(supabase, subscription.id, paid);
              setPaid("");
              setMessage("Renewed.");
            })}>Renew</Button>
            <Button variant="ghost" disabled={pending || subscription.status === "cancelled"} onClick={() => void run(async () => {
              const supabase = getBrowserSupabase();
              if (!supabase) return;
              await cancelSubscriptionRecord(supabase, subscription.id);
              setMessage("Cancelled.");
            })}>Cancel</Button>
            <Button variant="ghost" disabled={pending} onClick={() => void run(async () => {
              const supabase = getBrowserSupabase();
              if (!supabase) return;
              await saveSubscriptionRecord(supabase, subscription.organization_id, subscription.id, {
                name: subscription.name,
                vendor: subscription.vendor ?? "",
                categoryId: subscription.category_id ?? "",
                planName: subscription.plan_name ?? "",
                seats: subscription.seats === null ? "" : String(subscription.seats),
                cost: subscription.cost === null ? "" : String(subscription.cost),
                currency: subscription.currency,
                billingCycle: subscription.billing_cycle,
                startedOn: subscription.started_on ?? "",
                renewsOn: subscription.renews_on ?? "",
                autoRenew: subscription.auto_renew,
                noticeDays: subscription.notice_days === null ? "" : String(subscription.notice_days),
                paymentNote: subscription.payment_note ?? "",
                ownerId: subscription.owner_employee_id ?? "",
                vendorUrl: subscription.vendor_url ?? "",
                notes: subscription.notes ?? "",
                status: subscription.status,
                licenseKey: subscription.license_key ?? "",
                people: peopleIds,
                assets: assets.map((asset) => asset.id),
                archived: !subscription.archived_at,
              });
              setMessage(subscription.archived_at ? "Restored." : "Archived.");
            })}>{subscription.archived_at ? "Restore" : "Archive"}</Button>
          </div>
        </section>
      ) : null}
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">History</h2>
        <HistoryList events={events} timeZone={timeZone} />
      </section>
    </div>
  );
}
