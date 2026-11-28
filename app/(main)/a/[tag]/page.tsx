import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetView } from "@/components/assets/AssetView";
import { lookupAssetsByTag } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const workspace = await loadWorkspace();
  if (!workspace) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();
  const matches = await lookupAssetsByTag(supabase, decodeURIComponent(tag));
  if (matches.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="font-serif text-4xl">No asset for this tag</h1>
        <p className="mt-3 text-sm text-muted">Nothing in your organizations uses {decodeURIComponent(tag)}.</p>
        <Link href="/scan" className="mt-4 inline-flex underline">Scan again</Link>
      </main>
    );
  }
  if (matches.length > 1) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="font-serif text-4xl">Which organization?</h1>
        <ul className="mt-4 grid gap-2">
          {matches.map((asset) => (
            <li key={asset.id}>
              <Link className="block rounded-2xl bg-card px-4 py-3" href={`/assets/${asset.id}`}>
                {asset.name}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }
  const asset = matches[0];
  const membership = workspace.organizations.find((item) => item.organization.id === asset.organization_id);
  if (!membership) notFound();
  return (
    <AssetView
      asset={asset}
      membership={membership}
      userId={workspace.userId}
      displayName={workspace.displayName}
    />
  );
}
