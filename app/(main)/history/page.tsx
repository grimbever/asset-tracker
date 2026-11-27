import { HistoryFilterForm } from "@/components/history/HistoryFilters";
import { HistoryList } from "@/components/history/HistoryList";
import { Banner } from "@/components/ui";
import { listAssets, listEmployees, listLocations, listRoles, listStatuses, listTypes, searchEvents } from "@/lib/data";
import type { AssetEvent } from "@/lib/assets/events";
import { loadWorkspace } from "@/lib/data/workspace";
import { EMPTY_HISTORY_NAMES, historyNames, type HistoryNames } from "@/lib/history/display";
import { HISTORY_LOAD_ERROR, readHistoryFilters } from "@/lib/history/query";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; action?: string; event?: string; from?: string; to?: string; id?: string }>;
}) {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.assetsView) && !can(active.permissions, PERMISSIONS.assetsScan)) {
    return <main className="px-4 py-8">You cannot view history.</main>;
  }
  const filters = readHistoryFilters(await searchParams);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  let events: AssetEvent[] = [];
  let loadError: string | null = null;
  let subjects: Record<string, string> = {};
  let personLabel: string | null = null;
  let names: HistoryNames = EMPTY_HISTORY_NAMES;
  try {
    const [history, assets, people, locations, statuses, types, roles] = await Promise.all([
      searchEvents(supabase, active.organization.id, { ...filters, timeZone: active.organization.timezone }),
      listAssets(supabase, active.organization.id, { includeArchived: true }),
      listEmployees(supabase, active.organization.id),
      listLocations(supabase, active.organization.id),
      listStatuses(supabase, active.organization.id),
      listTypes(supabase, active.organization.id),
      listRoles(supabase, active.organization.id),
    ]);
    events = history.events;
    loadError = history.error;
    for (const asset of assets) subjects[`asset:${asset.id}`] = asset.name;
    for (const person of people) subjects[`employee:${person.id}`] = person.name;
    for (const location of locations) subjects[`location:${location.id}`] = location.name;
    names = historyNames({ people, locations, assets, statuses, types, roles });
    personLabel =
      filters.subjectType === "employee" && filters.subjectId
        ? (people.find((person) => person.id === filters.subjectId)?.name ?? "This person")
        : null;
  } catch (caught) {
    console.error("History page failed.", caught);
    loadError = HISTORY_LOAD_ERROR;
    subjects = {};
  }
  return (
    <main className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <h1 className="font-serif text-4xl tracking-tight">History</h1>
      <p className="text-sm text-muted">Edits stay in the log. Search by asset, tag, person, field, or the value before and after a change.</p>
      <HistoryFilterForm
        key={`${filters.subjectType}:${filters.subjectId}:${filters.eventType}:${filters.from}:${filters.to}`}
        filters={filters}
        personLabel={personLabel}
      />
      {loadError ? <Banner tone="bad">{loadError}</Banner> : <HistoryList events={events} timeZone={active.organization.timezone} subjects={subjects} names={names} />}
    </main>
  );
}
