import Link from "next/link";
import { DemoButton } from "@/components/home/DemoButton";
import { UpcomingList } from "@/components/home/UpcomingList";
import {
  listAssets,
  listEmployees,
  listFieldDefinitions,
  listOpenMaintenance,
  listStatuses,
} from "@/lib/data";
import { assetsHref } from "@/lib/assets/filter";
import { statusCards } from "@/lib/lookups";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { collectUpcoming } from "@/lib/upcoming";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const canView = can(active.permissions, PERMISSIONS.assetsView);
  const [assets, people, fields, maintenance, statuses] = canView
    ? await Promise.all([
        listAssets(supabase, active.organization.id, { includeArchived: true }),
        listEmployees(supabase, active.organization.id),
        listFieldDefinitions(supabase, active.organization.id),
        listOpenMaintenance(supabase, active.organization.id),
        listStatuses(supabase, active.organization.id),
      ])
    : [[], [], [], [], []];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const upcoming = collectUpcoming(
    {
      assets,
      people,
      fields,
      maintenance: maintenance.map((job) => {
        const asset = job.asset_id ? assetById.get(job.asset_id) : undefined;
        return {
          id: job.id,
          title: job.title,
          due_on: job.due_on,
          completed_at: job.completed_at,
          asset_id: job.asset_id,
          assetName: asset?.name ?? null,
          assetArchived: Boolean(job.asset_id) && (!asset || Boolean(asset.archived_at)),
        };
      }),
    },
    active.organization.timezone,
    new Date(),
  );
  const cards = statusCards(
    statuses.map((status) => ({
      key: status.key,
      label: status.label,
      position: status.position,
      needsAttention: status.needs_attention,
      archivedAt: status.archived_at,
    })),
    assets.map((asset) => ({ status: asset.status, archivedAt: asset.archived_at })),
  );
  const listedAssets = assets.filter((asset) => !asset.archived_at).length;
  const cardClass =
    "block min-h-24 rounded-3xl bg-card p-4 outline-offset-2 transition hover:bg-paper-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-green";

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{active.organization.name}</h1>
        <p className="mt-2 text-sm text-muted">
          {active.role.name} · {active.organization.timezone}
        </p>
      </div>
      {canView ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link href="/assets" className={cardClass} aria-label={`Assets, ${listedAssets}`}>
              <p className="text-sm text-muted">Assets</p>
              <p className="font-serif text-3xl">{listedAssets}</p>
            </Link>
            {cards.map((card) => (
              <Link key={card.key} href={assetsHref({ status: card.key })} className={cardClass} aria-label={`${card.label}, ${card.count}`}>
                <p className="text-sm text-muted">{card.label}</p>
                <p className="font-serif text-3xl">{card.count}</p>
              </Link>
            ))}
          </section>
          <UpcomingList items={upcoming} timeZone={active.organization.timezone} />
          {listedAssets === 0 && can(active.permissions, PERMISSIONS.assetsWrite) ? (
            <DemoButton organizationId={active.organization.id} />
          ) : null}
        </>
      ) : (
        <section className="rounded-3xl bg-card p-5">
          <h2 className="font-serif text-2xl">Scan a tag</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Your role can look up an item by scanning or typing its tag.</p>
          <Link href="/scan" className="mt-4 inline-flex min-h-12 items-center rounded-full bg-ember px-4 text-white">
            Open the scanner
          </Link>
        </section>
      )}
    </main>
  );
}
