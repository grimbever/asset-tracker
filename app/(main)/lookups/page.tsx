import { LookupEditor } from "@/components/settings/LookupEditor";
import { listFieldDefinitions, listNotificationEmails, listStatuses, listTypes } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LookupsPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.settingsManage)) {
    return <main className="px-4 py-8">Only a super user can edit statuses, types, and custom fields.</main>;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [statuses, types, fields, emails] = await Promise.all([
    listStatuses(supabase, active.organization.id),
    listTypes(supabase, active.organization.id),
    listFieldDefinitions(supabase, active.organization.id),
    listNotificationEmails(supabase, active.organization.id),
  ]);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-2 font-serif text-4xl tracking-tight">Lookups</h1>
      <p className="mb-6 text-sm text-muted">Statuses, types, and custom fields are records. Archive one instead of deleting it when history still uses it.</p>
      <LookupEditor organizationId={active.organization.id} statuses={statuses} types={types} fields={fields} emails={emails} />
    </main>
  );
}
