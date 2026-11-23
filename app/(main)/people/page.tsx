import { PeopleManager } from "@/components/people/PeopleManager";
import { listEmployees } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PeoplePage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const allowed = can(active.permissions, PERMISSIONS.assetsView) || can(active.permissions, PERMISSIONS.settingsManage);
  if (!allowed) return <main className="px-4 py-8">You cannot view people.</main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const people = await listEmployees(supabase, active.organization.id);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">People</h1>
      <PeopleManager
        organizationId={active.organization.id}
        people={people}
        canManage={can(active.permissions, PERMISSIONS.settingsManage)}
      />
    </main>
  );
}
