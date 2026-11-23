import Link from "next/link";
import { DemoButton } from "@/components/home/DemoButton";
import { eventSummary } from "@/lib/assets/events";
import { dashboardAttention, listAssets, listRecentEvents, listStatuses } from "@/lib/data";
import { statusCards } from "@/lib/lookups";
import { loadWorkspace } from "@/lib/data/workspace";
import { formatWhen } from "@/lib/format";
import { PERMISSIONS, can } from "@/lib/permissions";
import { assetHref } from "@/lib/scan";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const canView = can(active.permissions, PERMISSIONS.assetsView);
  const [assets, events, statuses] = canView
    ? await Promise.all([
        listAssets(supabase, active.organization.id),
        listRecentEvents(supabase, active.organization.id),
        listStatuses(supabase, active.organization.id),
      ])
    : [[], [], []];
  const attention = dashboardAttention(assets, active.organization.timezone);
  const cards = statusCards(
    statuses.map((status) => ({
      key: status.key,
      label: status.label,
      position: status.position,
      needsAttention: status.needs_attention,
      archivedAt: status.archived_at,
    })),
    assets,
  );

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
            <div className="rounded-3xl bg-card p-4">
              <p className="text-sm text-muted">Assets</p>
              <p className="font-serif text-3xl">{assets.length}</p>
            </div>
            {cards.map((card) => (
              <div key={card.key} className="rounded-3xl bg-card p-4">
                <p className="text-sm text-muted">{card.label}</p>
                <p className="font-serif text-3xl">{card.count}</p>
              </div>
            ))}
          </section>
          <section className="grid gap-3">
            <h2 className="font-serif text-2xl">Needs attention</h2>
            {attention.length === 0 ? <p className="text-sm text-muted">Nothing due right now.</p> : null}
            <ul className="grid gap-2">
              {attention.slice(0, 8).map((item) => (
                <li key={`${item.assetId}-${item.kind}`}>
                  <Link href={assetHref(item.tagId)} className="block rounded-2xl bg-card px-4 py-3">
                    <span className="font-medium">{item.name}</span>
                    <span className="mt-1 block text-sm text-muted">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="grid gap-3">
            <h2 className="font-serif text-2xl">Recent activity</h2>
            <ul className="grid gap-2">
              {events.map((event) => (
                <li key={event.id} className="rounded-2xl bg-card px-4 py-3 text-sm">
                  <p>{eventSummary(event)}</p>
                  <p className="mt-1 text-xs text-muted">{formatWhen(event.occurred_at, active.organization.timezone)}</p>
                </li>
              ))}
            </ul>
          </section>
          {assets.length === 0 && can(active.permissions, PERMISSIONS.assetsWrite) ? (
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
