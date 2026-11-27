"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, TextInput } from "@/components/ui";
import type { AssetRecord } from "@/lib/assets/types";
import { assetTypeLabel } from "@/lib/assets/types";
import { saveLabelJob } from "@/lib/labels/job";
import { DEFAULT_TEMPLATE_ID, LABEL_TEMPLATES } from "@/lib/labels/templates";

export function LabelPicker({
  assets,
  locationNames,
  initialTemplate = DEFAULT_TEMPLATE_ID,
}: {
  assets: AssetRecord[];
  locationNames: Record<string, string>;
  initialTemplate?: string;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(initialTemplate);
  const [showType, setShowType] = useState(true);
  const [showLocation, setShowLocation] = useState(false);
  const [width, setWidth] = useState("2");
  const [height, setHeight] = useState("1");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const chosen = assets.filter((asset) => selected[asset.id]);

  return (
    <div className="grid gap-4">
      <Field label="Paper or roll">
        <select
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          className="min-h-12 w-full rounded-2xl border border-line bg-card px-3"
        >
          {LABEL_TEMPLATES.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} — {template.detail}
            </option>
          ))}
          <option value="custom">Custom size</option>
        </select>
      </Field>
      {templateId === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width (inches)"><TextInput value={width} onChange={(event) => setWidth(event.target.value)} /></Field>
          <Field label="Height (inches)"><TextInput value={height} onChange={(event) => setHeight(event.target.value)} /></Field>
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showType} onChange={(event) => setShowType(event.target.checked)} />
        Show type
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showLocation} onChange={(event) => setShowLocation(event.target.checked)} />
        Show location
      </label>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setSelected(Object.fromEntries(assets.map((asset) => [asset.id, true])))}>
          Select all
        </Button>
        <Button variant="ghost" onClick={() => setSelected({})}>Clear</Button>
      </div>
      <ul className="grid gap-2">
        {assets.map((asset) => (
          <li key={asset.id}>
            <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-card px-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={Boolean(selected[asset.id])}
                onChange={(event) => setSelected((current) => ({ ...current, [asset.id]: event.target.checked }))}
              />
              <span>
                <span className="font-mono text-xs text-muted">{asset.tag_id}</span>
                <span className="block">{asset.name}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button
        disabled={chosen.length === 0}
        onClick={() => {
          saveLabelJob({
            templateId,
            showType,
            showLocation,
            customWidth: Number(width),
            customHeight: Number(height),
            labels: chosen.map((asset) => ({
              tagId: asset.tag_id,
              name: asset.name,
              typeLabel: assetTypeLabel(asset.type),
              location: asset.location_id ? locationNames[asset.location_id] ?? null : null,
            })),
          });
          router.push("/labels/print");
        }}
      >
        Print {chosen.length || ""} label{chosen.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}
