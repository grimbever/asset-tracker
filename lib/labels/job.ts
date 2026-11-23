export type LabelCard = {
  tagId: string;
  name: string;
  typeLabel: string;
  location: string | null;
};

export type LabelJob = {
  templateId: string;
  showType: boolean;
  showLocation: boolean;
  customWidth: number;
  customHeight: number;
  labels: LabelCard[];
};

const KEY = "asset-tracker-label-job";

export function saveLabelJob(job: LabelJob) {
  sessionStorage.setItem(KEY, JSON.stringify(job));
}

export function readLabelJob(): LabelJob | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LabelJob;
    if (!parsed || !Array.isArray(parsed.labels)) return null;
    return parsed;
  } catch {
    return null;
  }
}
