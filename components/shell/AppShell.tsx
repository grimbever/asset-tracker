"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { selectOrganization } from "@/app/actions";
import { ShellAccount } from "@/components/shell/ShellAccount";
import { APP_NAME } from "@/lib/config";
import type { Workspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";

const links = [
  { href: "/home", label: "Home", show: () => true },
  { href: "/assets", label: "Assets", show: (permissions: string[]) => can(permissions, PERMISSIONS.assetsView) },
  { href: "/scan", label: "Scan", show: (permissions: string[]) => can(permissions, PERMISSIONS.assetsScan) },
  { href: "/labels", label: "Labels", show: (permissions: string[]) => can(permissions, PERMISSIONS.assetsView) },
  { href: "/people", label: "People", show: (permissions: string[]) => can(permissions, PERMISSIONS.peopleView) || can(permissions, PERMISSIONS.peopleManage) || can(permissions, PERMISSIONS.assetsView) || can(permissions, PERMISSIONS.settingsManage) },
  { href: "/locations", label: "Locations", show: (permissions: string[]) => can(permissions, PERMISSIONS.locationsView) || can(permissions, PERMISSIONS.locationsManage) || can(permissions, PERMISSIONS.assetsView) || can(permissions, PERMISSIONS.settingsManage) },
  { href: "/subscriptions", label: "Subscriptions", show: (permissions: string[]) => can(permissions, PERMISSIONS.subscriptionsView) || can(permissions, PERMISSIONS.subscriptionsManage) },
  { href: "/history", label: "History", show: (permissions: string[]) => can(permissions, PERMISSIONS.historyView) || can(permissions, PERMISSIONS.assetsView) || can(permissions, PERMISSIONS.assetsScan) },
  { href: "/lookups", label: "Lookups", show: (permissions: string[]) => can(permissions, PERMISSIONS.settingsManage) },
  { href: "/settings/company", label: "Company", show: (permissions: string[]) => can(permissions, PERMISSIONS.settingsManage) },
  { href: "/settings", label: "Settings", show: () => true },
];

export function AppShell({
  workspace,
  children,
  accent,
  logoUrl,
}: {
  workspace: Workspace;
  children: ReactNode;
  accent?: string;
  logoUrl?: string;
}) {
  const pathname = usePathname();
  const active = workspace.active;
  const permissions = active?.permissions ?? [];
  const visible = links.filter((link) => link.show(permissions));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]" style={accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? { borderTop: `4px solid ${accent}` } : undefined}>
      <aside className="app-chrome sticky top-0 hidden h-dvh flex-col border-r border-line bg-card md:flex">
        <div className="px-4 py-5">
          {logoUrl && /^https:\/\//i.test(logoUrl) ? (
            <span
              role="img"
              aria-label="Company logo"
              className="mb-2 block h-8 bg-contain bg-left bg-no-repeat"
              style={{ backgroundImage: `url("${logoUrl.replaceAll('"', "")}")` }}
            />
          ) : null}
          <p className="font-serif text-2xl tracking-tight">{APP_NAME}</p>
          <p className="mt-1 truncate text-sm text-muted">{active?.organization.name}</p>
        </div>
        <nav className="grid min-h-0 flex-1 content-start overflow-y-auto px-2">
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
        <div>
          {workspace.organizations.length > 1 && active ? (
            <form action={selectOrganization} className="grid gap-2 px-4 pt-3">
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
          <ShellAccount
            displayName={workspace.displayName}
            email={workspace.email}
            organization={active?.organization.name ?? null}
          />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="app-chrome border-b border-line px-4 py-3 md:hidden">
          <p className="font-serif text-xl">{APP_NAME}</p>
          <p className="truncate text-xs text-muted">{active?.organization.name}</p>
        </header>
        <div className="pb-44 md:pb-10">{children}</div>
        <nav aria-label="Mobile menu" className="app-chrome fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card md:hidden">
          <div className="flex gap-1 overflow-x-auto px-2">
            {visible.map((link) => (
              <Link key={link.href} href={link.href} className="shrink-0 px-3 py-3 text-sm">
                {link.label}
              </Link>
            ))}
          </div>
          <ShellAccount
            displayName={workspace.displayName}
            email={workspace.email}
            organization={active?.organization.name ?? null}
          />
        </nav>
      </div>
    </div>
  );
}
