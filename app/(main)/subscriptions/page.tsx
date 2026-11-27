import { ReminderSettings } from "@/components/subscriptions/ReminderSettings";
import { SubscriptionList } from "@/components/subscriptions/SubscriptionList";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { listSubscriptionCategories, listSubscriptions, reminderDays } from "@/lib/subscriptions/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SubscriptionsPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const canView = can(active.permissions, PERMISSIONS.subscriptionsView) || can(active.permissions, PERMISSIONS.subscriptionsManage);
  if (!canView) return <main className="px-4 py-8">You cannot view subscriptions.</main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const canManage = can(active.permissions, PERMISSIONS.subscriptionsManage);
  const [subscriptions, categories, days] = await Promise.all([
    listSubscriptions(supabase, active.organization.id, canManage),
    listSubscriptionCategories(supabase, active.organization.id),
    reminderDays(supabase, active.organization.id),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: active.organization.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
      <SubscriptionList subscriptions={subscriptions} categories={categories} canManage={canManage} today={today} />
      {canManage ? <ReminderSettings organizationId={active.organization.id} days={days} /> : null}
    </main>
  );
}
