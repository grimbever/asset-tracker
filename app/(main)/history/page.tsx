import { HistoryList } from "@/components/history/HistoryList";
import { searchEvents } from "@/lib/data";
import { loadWorkspace } from "@/lib/data/workspace";
import { PERMISSIONS, can } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; action?: string; from?: string; to?: string; id?: string }>;
}) {
  const workspace = await loadWorkspace();
  const active = workspace?.active;
  if (!workspace || !active) return null;
  if (!can(active.permissions, PERMISSIONS.assetsView) && !can(active.permissions, PERMISSIONS.assetsScan)) {
    return <main className="px-4 py-8">You cannot view history.</main>;
  }
  const filters = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const events = await searchEvents(supabase, active.organization.id, {
    q: filters.q,
    subjectType: filters.type,
    subjectId: filters.id,
    eventType: filters.action,
    from: filters.from,
    to: filters.to,
  });
  return (
    <main className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <h1 className="font-serif text-4xl tracking-tight">History</h1>
      <p className="text-sm text-muted">Edits stay in the log. Search by words, person, asset, action, or date.</p>
      <form className="grid gap-3 rounded-3xl bg-card p-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm sm:col-span-2">
          Search
          <input name="q" defaultValue={filters.q ?? ""} className="min-h-12 rounded-2xl border border-line px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Record
          <select name="type" defaultValue={filters.type ?? ""} className="min-h-12 rounded-2xl border border-line bg-paper px-3">
            <option value="">Any</option>
            <option value="asset">Asset</option>
            <option value="employee">Person</option>
            <option value="location">Location</option>
            <option value="asset_status">Status</option>
            <option value="asset_type">Type</option>
            <option value="custom_field">Custom field</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Action
          <select name="action" defaultValue={filters.action ?? ""} className="min-h-12 rounded-2xl border border-line bg-paper px-3">
            <option value="">Any</option>
            <option value="created">Added</option>
            <option value="updated">Updated</option>
            <option value="checked_out">Checked out</option>
            <option value="checked_in">Checked in</option>
            <option value="status_changed">Status changed</option>
            <option value="archived">Archived</option>
            <option value="moved">Moved</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          From
          <input type="date" name="from" defaultValue={filters.from ?? ""} className="min-h-12 rounded-2xl border border-line px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          To
          <input type="date" name="to" defaultValue={filters.to ?? ""} className="min-h-12 rounded-2xl border border-line px-3" />
        </label>
        <button type="submit" className="min-h-12 rounded-full bg-ink px-4 text-paper sm:col-span-2">Filter</button>
      </form>
      <HistoryList events={events} timeZone={active.organization.timezone} />
    </main>
  );
}
