"use client";

import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui";
import type { LabelJob } from "@/lib/labels/job";
import { customTemplate, labelArrangement, labelSlot, templateById, type LabelTemplate } from "@/lib/labels/templates";
import { absoluteAssetUrl } from "@/lib/scan";

export function LabelDocument({ job }: { job: LabelJob }) {
  const template = resolveTemplate(job);
  const [codes, setCodes] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const label of job.labels) {
        next[label.tagId] = await QRCode.toDataURL(absoluteAssetUrl(window.location.origin, label.tagId), {
          margin: 0,
          width: 280,
          errorCorrectionLevel: "M",
        });
      }
      if (!cancelled) setCodes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [job.labels]);

  const pages = Math.max(1, Math.ceil(job.labels.length / (template.columns * template.rows)));
  const arrangement = labelArrangement(template);

  return (
    <div>
      <div className="app-chrome mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <p className="text-sm text-muted">
          {template.name}. Use the browser print dialog and choose Save as PDF, or print on the paper you already have.
        </p>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
      <style>{pageStyle(template)}</style>
      {Array.from({ length: pages }, (_, pageIndex) => (
        <section key={pageIndex} className="label-page mx-auto bg-white text-black shadow-sm" style={pageBox(template)}>
          {job.labels.map((label, index) => {
            const slot = labelSlot(template, index);
            if (slot.page !== pageIndex) return null;
            return (
              <article
                key={`${label.tagId}-${index}`}
                className="absolute box-border overflow-hidden border border-black/20"
                style={{
                  left: `${slot.xMm}mm`,
                  top: `${slot.yMm}mm`,
                  width: `${template.labelWidthMm}mm`,
                  height: `${template.labelHeightMm}mm`,
                  display: "flex",
                  flexDirection: arrangement === "row" ? "row" : "column",
                  alignItems: "center",
                  gap: "1.5mm",
                  padding: "1.5mm",
                }}
              >
                {codes[label.tagId] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={codes[label.tagId]}
                    alt=""
                    style={{ width: qrSize(template), height: qrSize(template), flex: "0 0 auto" }}
                  />
                ) : (
                  <div style={{ width: qrSize(template), height: qrSize(template) }} />
                )}
                <div style={{ minWidth: 0, lineHeight: 1.15 }}>
                  <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "9pt", margin: 0 }}>{label.tagId}</p>
                  <p style={{ fontSize: "10pt", fontWeight: 650, margin: "1mm 0 0" }}>{label.name}</p>
                  {job.showType ? <p style={{ fontSize: "8pt", margin: "0.5mm 0 0" }}>{label.typeLabel}</p> : null}
                  {job.showLocation && label.location ? (
                    <p style={{ fontSize: "8pt", margin: 0 }}>{label.location}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function resolveTemplate(job: LabelJob): LabelTemplate {
  if (job.templateId === "custom") return customTemplate(job.customWidth, job.customHeight);
  return templateById(job.templateId) ?? templateById("avery-5163")!;
}

function qrSize(template: LabelTemplate): string {
  const edge = Math.min(template.labelWidthMm, template.labelHeightMm) * 0.72;
  return `${Math.max(12, edge)}mm`;
}

function pageBox(template: LabelTemplate): CSSProperties {
  return {
    position: "relative",
    width: `${template.pageWidthMm}mm`,
    height: `${template.pageHeightMm}mm`,
    marginBottom: "8mm",
  };
}

function pageStyle(template: LabelTemplate): string {
  const size =
    template.paper === "letter"
      ? "letter"
      : `${trim(template.pageWidthMm)}mm ${trim(template.pageHeightMm)}mm`;
  return `@page { size: ${size}; margin: 0; } @media print { .label-page { margin: 0 !important; box-shadow: none !important; break-after: page; } }`;
}

function trim(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "");
}
