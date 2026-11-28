"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { StatusPill } from "@/components/assets/StatusPill";
import { Button, TextInput } from "@/components/ui";
import { assetsHref, filterAssets } from "@/lib/assets/filter";
import { assetTypeLabel, type AssetRecord } from "@/lib/assets/types";
import { saveLabelJob } from "@/lib/labels/job";
import { DEFAULT_TEMPLATE_ID } from "@/lib/labels/templates";
import { assetHref, parseScan } from "@/lib/scan";

export function AssetList({
  assets,
  locationNames,
  assigneeNames,
  canWrite,
  photos = {},
  statusLabels = {},
  personId = null,
  locationId = null,
  statusKey = null,
  warrantySoon = false,
  today = "",
}: {
  assets: AssetRecord[];
  locationNames: Record<string, string>;
  assigneeNames: Record<string, string>;
  canWrite: boolean;
  photos?: Record<string, string>;
  statusLabels?: Record<string, string>;
  personId?: string | null;
  locationId?: string | null;
  statusKey?: string | null;
  warrantySoon?: boolean;
  today?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(statusKey ?? "all");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(
    () => filterAssets(assets, { query, status, showArchived, personId, locationId, locationNames, warrantySoon, today }),
    [assets, locationId, locationNames, personId, query, showArchived, status, warrantySoon, today],
  );

  function openExact(raw: string) {
    const parsed = parseScan(raw);
    const match = assets.find((asset) => asset.tag_id.toLowerCase() === (parsed ?? raw.trim()).toLowerCase());
    if (match) router.push(assetHref(match.tag_id));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TextInput
          value={query}
          placeholder="Search name, tag, or serial"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") openExact(query);
          }}
          className="max-w-md"
          aria-label="Search assets"
        />
        {canWrite ? (
          <Link href="/assets/new" className="inline-flex min-h-12 items-center rounded-full bg-ember px-4 text-white">
            Add asset
          </Link>
        ) : null}
      </div>
      {personId || locationId || status !== "all" || warrantySoon ? (
        <div className="flex flex-wrap gap-2">
          {status !== "all" ? (
            <Link href={assetsHref({ personId, locationId, warranty: warrantySoon })} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-3 text-sm text-paper">
              {statusLabels[status] ?? status}
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove status filter</span>
            </Link>
          ) : null}
          {personId ? (
            <Link href={assetsHref({ locationId, status, warranty: warrantySoon })} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-3 text-sm text-paper">
              Assigned to {assigneeNames[personId] ?? "this person"}
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove person filter</span>
            </Link>
          ) : null}
          {locationId ? (
            <Link href={assetsHref({ personId, status, warranty: warrantySoon })} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-3 text-sm text-paper">
              At {locationNames[locationId] ?? "this location"}
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove location filter</span>
            </Link>
          ) : null}
          {warrantySoon ? (
            <Link href={assetsHref({ personId, locationId, status })} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-3 text-sm text-paper">
              Warranty expiring
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove warranty filter</span>
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {["all", ...Object.keys(statusLabels)].map((value) => (
          <button
            key={value}
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${status === value ? "bg-ink text-paper" : "bg-card"}`}
            onClick={() => {
              setStatus(value);
              router.push(assetsHref({ personId, locationId, warranty: warrantySoon, status: value === "all" ? null : value }));
            }}
          >
            {value === "all" ? "All" : statusLabels[value] ?? value}
          </button>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          Show archived
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          disabled={!Object.values(selected).some(Boolean)}
          onClick={() => {
            const labels = assets
              .filter((asset) => selected[asset.id])
              .map((asset) => ({
                tagId: asset.tag_id,
                name: asset.name,
                typeLabel: assetTypeLabel(asset.type),
                location: asset.location_id ? locationNames[asset.location_id] ?? null : null,
              }));
            saveLabelJob({
              templateId: DEFAULT_TEMPLATE_ID,
              showType: true,
              showLocation: false,
              customWidth: 2,
              customHeight: 1,
              labels,
            });
            router.push("/labels/print");
          }}
        >
          Print selected labels
        </Button>
      </div>
      <ul className="grid gap-2">
        {filtered.map((asset) => (
          <li key={asset.id} className="flex items-stretch gap-2">
            <label className="flex items-center px-1">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={Boolean(selected[asset.id])}
                onChange={(event) => setSelected((current) => ({ ...current, [asset.id]: event.target.checked }))}
                aria-label={`Select ${asset.name}`}
              />
            </label>
            <Link href={`/assets/${asset.id}`} className="flex flex-1 items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
              <span className="flex items-center gap-3">
                {photos[asset.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[asset.id]} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-xl bg-paper-deep text-xs text-muted">No photo</span>
                )}
                <span>
                <span className="font-mono text-xs text-muted">{asset.tag_id}</span>
                <span className="mt-1 block font-medium">{asset.name}</span>
                <span className="mt-1 block text-sm text-muted">
                  {assetTypeLabel(asset.type)}
                  {asset.location_id && locationNames[asset.location_id] ? ` · ${locationNames[asset.location_id]}` : ""}
                  {asset.assigned_employee_id && assigneeNames[asset.assigned_employee_id]
                    ? ` · ${assigneeNames[asset.assigned_employee_id]}`
                    : ""}
                </span>
              </span>
              </span>
              <StatusPill status={asset.status} label={statusLabels[asset.status]} />
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length === 0 ? <p className="text-sm text-muted">No assets match.</p> : null}
    </div>
  );
}
