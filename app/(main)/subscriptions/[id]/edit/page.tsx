import { notFound } from "next/navigation";
import { SubscriptionForm } from "@/components/subscriptions/SubscriptionForm";
import { listAssets, listEmployees } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { listSubscriptionCategories, listSubscriptionLinks, listSubscriptions } from "@/lib/subscriptions/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.subscriptionsManage)) {
    return <main className="px-4 py-8">You cannot change subscriptions.</main>;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [subscriptions, categories, links, people, assets] = await Promise.all([
    listSubscriptions(supabase, active.organization.id, true),
    listSubscriptionCategories(supabase, active.organization.id),
    listSubscriptionLinks(supabase, active.organization.id),
    listEmployees(supabase, active.organization.id),
    listAssets(supabase, active.organization.id, { includeArchived: true }),
  ]);
  const subscription = subscriptions.find((item) => item.id === id);
  if (!subscription) notFound();
  return (
    <main className="mx-auto grid max-w-xl gap-4 px-4 py-6">
      <h1 className="font-serif text-4xl tracking-tight">Edit subscription</h1>
      <SubscriptionForm
        organizationId={active.organization.id}
        subscription={subscription}
        categories={categories}
        people={people.filter((person) => !person.archived_at).map((person) => ({ id: person.id, name: person.name }))}
        assets={assets.filter((asset) => !asset.archived_at).map((asset) => ({ id: asset.id, name: asset.name }))}
        selectedPeople={links.people.filter((link) => link.subscription_id === id).map((link) => link.employee_id)}
        selectedAssets={links.assets.filter((link) => link.subscription_id === id).map((link) => link.asset_id)}
        canManageSecret
      />
    </main>
  );
}
