import Link from "next/link";
import { CompanySetup } from "@/components/settings/CompanySetup";
import { companyFormFromRow, listCompanyRoles } from "@/lib/company/data";
import { listInvites, listMembers, listNotificationEmails } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { reminderDays } from "@/lib/subscriptions/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CompanySetupPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.settingsManage)) {
    return <main className="px-4 py-8">You need company setup access to change this.</main>;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const organizationId = active.organization.id;
  const [roles, members, invites, emails, days, settingsRow] = await Promise.all([
    listCompanyRoles(supabase, organizationId),
    listMembers(supabase, organizationId),
    listInvites(supabase, organizationId),
    listNotificationEmails(supabase, organizationId),
    reminderDays(supabase, organizationId).catch(() => [30, 7]),
    supabase.from("organization_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
  ]);
  const settings = companyFormFromRow(
    (settingsRow.data as Record<string, unknown> | null) ?? null,
    active.organization.name,
    active.organization.timezone,
    emails,
  );
  const pendingRoleIds = invites.filter((invite) => !invite.accepted_at).map((invite) => invite.role_id);
  return (
    <main className="mx-auto grid max-w-5xl gap-4 px-4 py-6">
      <p className="text-sm"><Link href="/settings" className="underline">Settings</Link></p>
      <h1 className="font-serif text-4xl tracking-tight">Company setup</h1>
      <p className="text-sm text-muted">These choices apply to {active.organization.name}. Every save is written to History.</p>
      <CompanySetup
        organizationId={organizationId}
        settings={settings}
        roles={roles}
        assignedRoleIds={members.map((member) => member.role_id)}
        pendingRoleIds={pendingRoleIds}
        actorRoleId={active.role.id}
        reminderDays={days}
      />
    </main>
  );
}
