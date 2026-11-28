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
import { listConsumables } from "@/lib/inventory/data";
import { canSeeShoppingList, shoppingCounts, shoppingListHref } from "@/lib/inventory/shopping";
import { isLowStock } from "@/lib/inventory/stock";
import { listSubscriptions } from "@/lib/subscriptions/data";
import { DEFAULT_UPCOMING_DAYS } from "@/lib/company/matrix";
import { collectUpcoming } from "@/lib/upcoming";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const canView = can(active.permissions, PERMISSIONS.assetsView);
  const canSeeSubscriptions = can(active.permissions, PERMISSIONS.subscriptionsView) || can(active.permissions, PERMISSIONS.subscriptionsManage);
  const canSeeInventory = can(active.permissions, PERMISSIONS.inventoryView) || can(active.permissions, PERMISSIONS.inventoryEdit) || can(active.permissions, PERMISSIONS.inventoryManage);
  const canSeeShopping = canSeeShoppingList(active.permissions);
  const [assets, people, fields, maintenance, statuses, subscriptions, consumables, requestRows, settingsRow] = await Promise.all([
    canView ? listAssets(supabase, active.organization.id, { includeArchived: true }) : Promise.resolve([]),
    canView ? listEmployees(supabase, active.organization.id) : Promise.resolve([]),
    canView ? listFieldDefinitions(supabase, active.organization.id) : Promise.resolve([]),
    canView ? listOpenMaintenance(supabase, active.organization.id) : Promise.resolve([]),
    canView ? listStatuses(supabase, active.organization.id) : Promise.resolve([]),
    canSeeSubscriptions
      ? listSubscriptions(supabase, active.organization.id, false).catch(() => [])
      : Promise.resolve([]),
    canSeeInventory ? listConsumables(supabase, active.organization.id).catch(() => []) : Promise.resolve([]),
    canSeeShopping
      ? supabase.from("supply_requests").select("status").eq("organization_id", active.organization.id).in("status", ["open", "ordered"])
      : Promise.resolve({ data: [] as { status: string }[] }),
    supabase.from("organization_settings").select("upcoming_days").eq("organization_id", active.organization.id).maybeSingle(),
  ]);
  let upcomingEdges: number[] = [...DEFAULT_UPCOMING_DAYS];
  const storedEdges = (settingsRow.data as { upcoming_days?: number[] } | null)?.upcoming_days;
  if (storedEdges && storedEdges.length > 0) upcomingEdges = storedEdges;
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
      subscriptions,
    },
    active.organization.timezone,
    new Date(),
    upcomingEdges,
  );
  const lowStock = consumables.filter((item) => item.active && !item.archived_at && isLowStock(item.quantity_on_hand, item.minimum_quantity)).length;
  const cardClass =
    "block min-h-24 rounded-3xl bg-card p-4 outline-offset-2 transition hover:bg-paper-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-green";
  const shopping = shoppingCounts((requestRows.data ?? []) as { status: string }[]);
  const shoppingCards = canSeeShopping ? (
    <>
      <Link href={shoppingListHref("open")} className={cardClass} aria-label={`Shopping list, not ordered, ${shopping.open}`}>
        <p className="text-sm text-muted">Shopping list - Not ordered</p>
        <p className="font-serif text-3xl">{shopping.open}</p>
      </Link>
      <Link href={shoppingListHref("ordered")} className={cardClass} aria-label={`Shopping list, on order, ${shopping.ordered}`}>
        <p className="text-sm text-muted">Shopping list - On order</p>
        <p className="font-serif text-3xl">{shopping.ordered}</p>
      </Link>
    </>
  ) : null;
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
            {canSeeInventory ? (
              <Link href="/inventory?low=1" className={cardClass} aria-label={`Low stock, ${lowStock}`}>
                <p className="text-sm text-muted">Low stock</p>
                <p className="font-serif text-3xl">{lowStock}</p>
              </Link>
            ) : null}
            {shoppingCards}
            {cards.map((card) => (
              <Link key={card.key} href={assetsHref({ status: card.key })} className={cardClass} aria-label={`${card.label}, ${card.count}`}>
                <p className="text-sm text-muted">{card.label}</p>
                <p className="font-serif text-3xl">{card.count}</p>
              </Link>
            ))}
          </section>
          <UpcomingList items={upcoming} timeZone={active.organization.timezone} edges={upcomingEdges} />
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
          {canSeeInventory ? <Link href="/inventory?low=1" className="mt-3 block text-sm underline">Low stock: {lowStock}</Link> : null}
          {canSeeShopping ? <div className="mt-4 grid grid-cols-2 gap-3">{shoppingCards}</div> : null}
        </section>
      )}
    </main>
  );
}
