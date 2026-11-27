import { notFound } from "next/navigation";
import { SubscriptionDetail } from "@/components/subscriptions/SubscriptionDetail";
import { listAssets, listEmployees } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import {
  listSubscriptionCategories,
  listSubscriptionEvents,
  listSubscriptionFiles,
  listSubscriptionLinks,
  listSubscriptions,
} from "@/lib/subscriptions/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const canView = can(active.permissions, PERMISSIONS.subscriptionsView) || can(active.permissions, PERMISSIONS.subscriptionsManage);
  if (!canView) return <main className="px-4 py-8">You cannot view subscriptions.</main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const canManage = can(active.permissions, PERMISSIONS.subscriptionsManage);
  const [subscriptions, categories, links, files, events, people, assets] = await Promise.all([
    listSubscriptions(supabase, active.organization.id, canManage),
    listSubscriptionCategories(supabase, active.organization.id),
    listSubscriptionLinks(supabase, active.organization.id),
    listSubscriptionFiles(supabase, id),
    listSubscriptionEvents(supabase, id),
    listEmployees(supabase, active.organization.id),
    listAssets(supabase, active.organization.id, { includeArchived: true }),
  ]);
  const subscription = subscriptions.find((item) => item.id === id);
  if (!subscription) notFound();
  const peopleIds = links.people.filter((link) => link.subscription_id === id).map((link) => link.employee_id);
  const assetIds = new Set(links.assets.filter((link) => link.subscription_id === id).map((link) => link.asset_id));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: active.organization.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <SubscriptionDetail
        subscription={subscription}
        categoryName={categories.find((item) => item.id === subscription.category_id)?.name ?? null}
        ownerName={people.find((person) => person.id === subscription.owner_employee_id)?.name ?? null}
        people={people.filter((person) => peopleIds.includes(person.id)).map((person) => person.name)}
        peopleIds={peopleIds}
        assets={assets.filter((asset) => assetIds.has(asset.id)).map((asset) => ({ id: asset.id, name: asset.name }))}
        files={files}
        events={events}
        timeZone={active.organization.timezone}
        canManage={canManage}
        today={today}
      />
    </main>
  );
}
