"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { StatusPill } from "@/components/assets/StatusPill";
import { Button, TextInput } from "@/components/ui";
import { assetTypeLabel, type AssetRecord } from "@/lib/assets/types";
import { saveLabelJob } from "@/lib/labels/job";
import { DEFAULT_TEMPLATE_ID } from "@/lib/labels/templates";
import { assetHref, parseScan } from "@/lib/scan";

export function AssetList({
  assets,
  locationNames,
  assigneeNames,
  canWrite,
}: {
  assets: AssetRecord[];
  locationNames: Record<string, string>;
  assigneeNames: Record<string, string>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (status !== "all" && asset.status !== status) return false;
      if (!needle) return true;
      const location = asset.location_id ? locationNames[asset.location_id] : "";
      return [asset.name, asset.tag_id, asset.serial, asset.brand, asset.model, location]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [assets, locationNames, query, status]);

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
      <div className="flex flex-wrap gap-2">
        {["all", "available", "checked_out", "in_repair", "broken", "missing"].map((value) => (
          <button
            key={value}
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${status === value ? "bg-ink text-paper" : "bg-card"}`}
            onClick={() => setStatus(value)}
          >
            {value === "all" ? "All" : value.replaceAll("_", " ")}
          </button>
        ))}
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
              <StatusPill status={asset.status} />
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length === 0 ? <p className="text-sm text-muted">No assets match.</p> : null}
    </div>
  );
}
