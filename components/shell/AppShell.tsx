"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { selectOrganization } from "@/app/actions";
import { APP_NAME } from "@/lib/config";
import type { Workspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const links = [
  { href: "/home", label: "Home", show: () => true },
  { href: "/assets", label: "Assets", show: (permissions: string[]) => can(permissions, PERMISSIONS.assetsView) },
  { href: "/scan", label: "Scan", show: (permissions: string[]) => can(permissions, PERMISSIONS.assetsScan) },
  { href: "/labels", label: "Labels", show: (permissions: string[]) => can(permissions, PERMISSIONS.assetsView) },
  { href: "/people", label: "People", show: (permissions: string[]) => can(permissions, PERMISSIONS.assetsView) || can(permissions, PERMISSIONS.peopleManage) },
  { href: "/locations", label: "Locations", show: (permissions: string[]) => can(permissions, PERMISSIONS.assetsView) || can(permissions, PERMISSIONS.locationsManage) },
  { href: "/settings", label: "Settings", show: () => true },
];

export function AppShell({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = workspace.active;
  const permissions = active?.permissions ?? [];
  const visible = links.filter((link) => link.show(permissions));

  async function signOut() {
    const supabase = getBrowserSupabase();
    await supabase?.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="app-chrome hidden border-r border-line bg-card md:flex md:flex-col md:justify-between">
        <div>
          <div className="px-4 py-5">
            <p className="font-serif text-2xl tracking-tight">{APP_NAME}</p>
            <p className="mt-1 text-sm text-muted">{active?.organization.name}</p>
          </div>
          <nav className="grid px-2">
            {visible.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-3 py-2 text-sm ${pathname.startsWith(link.href) ? "bg-paper-deep font-medium" : ""}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="grid gap-2 p-4">
          {workspace.organizations.length > 1 && active ? (
            <form action={selectOrganization} className="grid gap-2">
              <label className="text-xs text-muted" htmlFor="org-switch">
                Organization
              </label>
              <select
                id="org-switch"
                name="organizationId"
                defaultValue={active.organization.id}
                className="rounded-xl border border-line bg-paper px-2 py-2 text-sm"
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
              >
                {workspace.organizations.map((membership) => (
                  <option key={membership.organization.id} value={membership.organization.id}>
                    {membership.organization.name}
                  </option>
                ))}
              </select>
            </form>
          ) : null}
          <button type="button" className="text-left text-sm underline" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="app-chrome flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
          <div>
            <p className="font-serif text-xl">{APP_NAME}</p>
            <p className="text-xs text-muted">{active?.organization.name}</p>
          </div>
          <button type="button" className="text-sm underline" onClick={() => void signOut()}>
            Sign out
          </button>
        </header>
        <div className="pb-24 md:pb-10">{children}</div>
        <nav className="app-chrome fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-line bg-card px-2 md:hidden">
          {visible.map((link) => (
            <Link key={link.href} href={link.href} className="shrink-0 px-3 py-3 text-sm">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
