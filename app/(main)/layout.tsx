import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { CreateOrgForm } from "@/components/shell/CreateOrgForm";
import { ShellAccount } from "@/components/shell/ShellAccount";
import { APP_NAME } from "@/lib/config";
import { loadWorkspace } from "@/lib/data/workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MainLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/setup");
  const workspace = await loadWorkspace();
  if (!workspace) redirect("/sign-in");
  if (!workspace.active) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <p className="text-sm font-medium text-ember">{APP_NAME}</p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">Name your organization</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Signed in as {workspace.email}. If someone invited you, open the invite link instead of creating a second organization.
        </p>
        <div className="mt-6">
          <CreateOrgForm />
        </div>
        <ShellAccount displayName={workspace.displayName} email={workspace.email} organization={null} />
      </main>
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data: brandRow } = supabase
    ? await supabase.from("organization_settings").select("accent_color, logo_url").eq("organization_id", workspace.active.organization.id).maybeSingle()
    : { data: null };
  const brand = brandRow as { accent_color?: string; logo_url?: string } | null;
  return (
    <AppShell workspace={workspace} accent={brand?.accent_color} logoUrl={brand?.logo_url}>
      {children}
    </AppShell>
  );
}
