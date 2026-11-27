"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { messageFrom } from "@/lib/data/errors";
import { cardNumberWarning, BILLING_CYCLES, SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/plan";
import { saveSubscriptionRecord, type SubscriptionCategory, type SubscriptionInput, type SubscriptionRecord } from "@/lib/subscriptions/data";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function SubscriptionForm({
  organizationId,
  subscription,
  categories,
  people,
  assets,
  selectedPeople,
  selectedAssets,
  canManageSecret,
}: {
  organizationId: string;
  subscription?: SubscriptionRecord;
  categories: SubscriptionCategory[];
  people: { id: string; name: string }[];
  assets: { id: string; name: string }[];
  selectedPeople: string[];
  selectedAssets: string[];
  canManageSecret: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<SubscriptionInput>({
    name: subscription?.name ?? "",
    vendor: subscription?.vendor ?? "",
    categoryId: subscription?.category_id ?? "",
    planName: subscription?.plan_name ?? "",
    seats: subscription?.seats === null || subscription?.seats === undefined ? "" : String(subscription.seats),
    cost: subscription?.cost === null || subscription?.cost === undefined ? "" : String(subscription.cost),
    currency: subscription?.currency ?? "USD",
    billingCycle: subscription?.billing_cycle ?? "yearly",
    startedOn: subscription?.started_on ?? "",
    renewsOn: subscription?.renews_on ?? "",
    autoRenew: subscription?.auto_renew ?? true,
    noticeDays: subscription?.notice_days === null || subscription?.notice_days === undefined ? "" : String(subscription.notice_days),
    paymentNote: subscription?.payment_note ?? "",
    ownerId: subscription?.owner_employee_id ?? "",
    vendorUrl: subscription?.vendor_url ?? "",
    notes: subscription?.notes ?? "",
    status: subscription?.status ?? "active",
    licenseKey: subscription?.license_key ?? "",
    people: selectedPeople,
    assets: selectedAssets,
  });

  function update(partial: Partial<SubscriptionInput>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const warning = cardNumberWarning(form.paymentNote) ?? (canManageSecret ? cardNumberWarning(form.licenseKey) : null);
    if (warning) {
      setError(warning);
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    try {
      await saveSubscriptionRecord(supabase, organizationId, subscription?.id, form);
      router.push(subscription ? `/subscriptions/${subscription.id}` : "/subscriptions");
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Field label="Name"><TextInput required value={form.name} onChange={(event) => update({ name: event.target.value })} /></Field>
      <Field label="Vendor"><TextInput value={form.vendor} onChange={(event) => update({ vendor: event.target.value })} /></Field>
      <Field label="Category">
        <select value={form.categoryId} onChange={(event) => update({ categoryId: event.target.value })} className="min-h-12 rounded-2xl border border-line bg-card px-3">
          <option value="">None</option>
          {categories.filter((item) => !item.archived_at || item.id === form.categoryId).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Plan or tier"><TextInput value={form.planName} onChange={(event) => update({ planName: event.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Seats"><TextInput inputMode="decimal" value={form.seats} onChange={(event) => update({ seats: event.target.value })} /></Field>
        <Field label="Cost"><TextInput inputMode="decimal" value={form.cost} onChange={(event) => update({ cost: event.target.value })} /></Field>
        <Field label="Currency"><TextInput value={form.currency} onChange={(event) => update({ currency: event.target.value.toUpperCase() })} /></Field>
      </div>
      <Field label="Billing cycle">
        <select value={form.billingCycle} onChange={(event) => update({ billingCycle: event.target.value })} className="min-h-12 rounded-2xl border border-line bg-card px-3">
          {BILLING_CYCLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start date"><TextInput type="date" value={form.startedOn} onChange={(event) => update({ startedOn: event.target.value })} /></Field>
        <Field label="Renewal date"><TextInput type="date" value={form.renewsOn} onChange={(event) => update({ renewsOn: event.target.value })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.autoRenew} onChange={(event) => update({ autoRenew: event.target.checked })} />
        Auto-renew
      </label>
      <Field label="Cancellation notice days" hint="Upcoming uses the renewal date minus these days.">
        <TextInput inputMode="numeric" value={form.noticeDays} onChange={(event) => update({ noticeDays: event.target.value })} />
      </Field>
      <Field label="Payment method" hint="A short label only. Do not enter a card number.">
        <TextInput value={form.paymentNote} onChange={(event) => update({ paymentNote: event.target.value })} />
      </Field>
      <Field label="Account owner">
        <select value={form.ownerId} onChange={(event) => update({ ownerId: event.target.value })} className="min-h-12 rounded-2xl border border-line bg-card px-3">
          <option value="">Nobody</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </Field>
      <Field label="Vendor or login URL"><TextInput value={form.vendorUrl} onChange={(event) => update({ vendorUrl: event.target.value })} /></Field>
      {canManageSecret ? (
        <Field label="License key or account ID" hint="Only people who can manage subscriptions can see this.">
          <TextInput value={form.licenseKey} autoComplete="off" onChange={(event) => update({ licenseKey: event.target.value })} />
        </Field>
      ) : null}
      <Field label="Notes"><TextInput value={form.notes} onChange={(event) => update({ notes: event.target.value })} /></Field>
      <Field label="Status">
        <select value={form.status} onChange={(event) => update({ status: event.target.value })} className="min-h-12 rounded-2xl border border-line bg-card px-3">
          {SUBSCRIPTION_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Assigned people</legend>
        {people.map((person) => (
          <label key={person.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.people.includes(person.id)}
              onChange={(event) => update({ people: event.target.checked ? [...form.people, person.id] : form.people.filter((id) => id !== person.id) })}
            />
            {person.name}
          </label>
        ))}
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Assigned assets</legend>
        {assets.map((asset) => (
          <label key={asset.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.assets.includes(asset.id)}
              onChange={(event) => update({ assets: event.target.checked ? [...form.assets, asset.id] : form.assets.filter((id) => id !== asset.id) })}
            />
            {asset.name}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending}>{subscription ? "Save subscription" : "Add subscription"}</Button>
    </form>
  );
}
