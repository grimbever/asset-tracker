import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { listInvites, listMembers, listRoles } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const canManage = can(active.permissions, PERMISSIONS.orgManage);
  const [roles, members, invites] = await Promise.all([
    listRoles(supabase, active.organization.id),
    listMembers(supabase, active.organization.id),
    canManage ? listInvites(supabase, active.organization.id) : Promise.resolve([]),
  ]);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Settings</h1>
      <SettingsScreen
        userId={workspace.userId}
        email={workspace.email}
        displayName={workspace.displayName}
        organization={active.organization}
        roles={roles}
        members={members}
        invites={invites}
        canManage={canManage}
        canSetup={can(active.permissions, PERMISSIONS.settingsManage)}
      />
    </main>
  );
}
