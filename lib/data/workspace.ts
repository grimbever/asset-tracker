import { cache } from "react";
import { cookies } from "next/headers";
import { ORG_COOKIE } from "@/lib/config";
import type { MembershipContext, OrgRecord, RoleRecord } from "@/lib/data/api";
import { createOrganization } from "@/lib/data/api";
import { isUuid } from "@/lib/ids";
import { chooseOrganization } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Workspace = {
  userId: string;
  email: string;
  displayName: string;
  organizations: MembershipContext[];
  active: MembershipContext | null;
};

export const loadWorkspace = cache(async (): Promise<Workspace | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  let organizations = await loadMemberships(supabase, user.id);
  if (!organizations.length) {
    const meta = user.user_metadata ?? {};
    const name = String(meta.organization_name ?? "").trim();
    const organizationId = String(meta.organization_id ?? "");
    const timezone = String(meta.timezone ?? "");
    if (name && isUuid(organizationId)) {
      try {
        await createOrganization(supabase, {
          id: organizationId,
          name,
          timezone,
          additional: false,
        });
        organizations = await loadMemberships(supabase, user.id);
      } catch {
        organizations = [];
      }
    }
  }

  const cookieStore = await cookies();
  const activeId = chooseOrganization(
    organizations.map((membership) => membership.organization.id),
    cookieStore.get(ORG_COOKIE)?.value,
  );

  const displayName = String(user.user_metadata?.display_name ?? "").trim();
  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: displayName || user.email || "You",
    organizations,
    active: organizations.find((membership) => membership.organization.id === activeId) ?? null,
  };
});

async function loadMemberships(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  userId: string,
): Promise<MembershipContext[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "role_id, organizations(id, name, timezone, plan_id, max_items, max_users, feature_flags), roles(id, organization_id, key, name, description, active, assignable)",
    )
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as {
    role_id: string;
    organizations: OrgRecord | OrgRecord[] | null;
    roles: RoleRecord | RoleRecord[] | null;
  }[];

  const roleIds = rows.map((row) => row.role_id);
  const permissionsByRole = new Map<string, string[]>();
  if (roleIds.length) {
    const { data: permissions, error: permissionError } = await supabase
      .from("role_permissions")
      .select("role_id, permission")
      .in("role_id", roleIds);
    if (permissionError) throw new Error(permissionError.message);
    for (const permission of permissions ?? []) {
      const row = permission as { role_id: string; permission: string };
      const list = permissionsByRole.get(row.role_id) ?? [];
      list.push(row.permission);
      permissionsByRole.set(row.role_id, list);
    }
  }

  return rows.flatMap((row) => {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    if (!organization || !role) return [];
    return [
      {
        organization: {
          ...organization,
          feature_flags: organization.feature_flags ?? {},
        },
        role,
        permissions: permissionsByRole.get(row.role_id) ?? [],
      },
    ];
  });
}
