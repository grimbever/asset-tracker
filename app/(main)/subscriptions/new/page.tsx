import { SubscriptionForm } from "@/components/subscriptions/SubscriptionForm";
import { listAssets, listEmployees } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { listSubscriptionCategories } from "@/lib/subscriptions/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewSubscriptionPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.subscriptionsManage)) {
    return <main className="px-4 py-8">You cannot change subscriptions.</main>;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [categories, people, assets] = await Promise.all([
    listSubscriptionCategories(supabase, active.organization.id),
    listEmployees(supabase, active.organization.id),
    listAssets(supabase, active.organization.id),
  ]);
  return (
    <main className="mx-auto grid max-w-xl gap-4 px-4 py-6">
      <h1 className="font-serif text-4xl tracking-tight">Add subscription</h1>
      <SubscriptionForm
        organizationId={active.organization.id}
        categories={categories}
        people={people.filter((person) => !person.archived_at).map((person) => ({ id: person.id, name: person.name }))}
        assets={assets.filter((asset) => !asset.archived_at).map((asset) => ({ id: asset.id, name: asset.name }))}
        selectedPeople={[]}
        selectedAssets={[]}
        canManageSecret
      />
    </main>
  );
}
