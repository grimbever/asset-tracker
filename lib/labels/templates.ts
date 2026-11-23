export type LabelFamily = "avery" | "brother" | "dymo" | "zebra" | "custom";

export type LabelTemplate = {
  id: string;
  family: LabelFamily;
  name: string;
  detail: string;
  paper: "letter" | "roll";
  pageWidthMm: number;
  pageHeightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  columns: number;
  rows: number;
  marginTopMm: number;
  marginLeftMm: number;
  gapXMm: number;
  gapYMm: number;
};

const INCH = 25.4;

function sheet(partial: LabelTemplate): LabelTemplate {
  return partial;
}

/** Avery sizes follow the published letter-sheet margins and pitches. */
export const LABEL_TEMPLATES: readonly LabelTemplate[] = [
  sheet({
    id: "avery-5160",
    family: "avery",
    name: "Avery 5160",
    detail: "1 × 2.625 in, 30 per letter sheet. Tight for a QR code.",
    paper: "letter",
    pageWidthMm: 8.5 * INCH,
    pageHeightMm: 11 * INCH,
    labelWidthMm: 2.625 * INCH,
    labelHeightMm: 1 * INCH,
    columns: 3,
    rows: 10,
    marginTopMm: 0.5 * INCH,
    marginLeftMm: 0.1875 * INCH,
    gapXMm: 0.125 * INCH,
    gapYMm: 0,
  }),
  sheet({
    id: "avery-5163",
    family: "avery",
    name: "Avery 5163",
    detail: "2 × 4 in, 10 per letter sheet. A comfortable QR label.",
    paper: "letter",
    pageWidthMm: 8.5 * INCH,
    pageHeightMm: 11 * INCH,
    labelWidthMm: 4 * INCH,
    labelHeightMm: 2 * INCH,
    columns: 2,
    rows: 5,
    marginTopMm: 0.5 * INCH,
    marginLeftMm: 0.156 * INCH,
    gapXMm: 0.188 * INCH,
    gapYMm: 0,
  }),
  sheet({
    id: "avery-5164",
    family: "avery",
    name: "Avery 5164",
    detail: "3.333 × 4 in, 6 per letter sheet.",
    paper: "letter",
    pageWidthMm: 8.5 * INCH,
    pageHeightMm: 11 * INCH,
    labelWidthMm: 4 * INCH,
    labelHeightMm: 3.333 * INCH,
    columns: 2,
    rows: 3,
    marginTopMm: 0.5 * INCH,
    marginLeftMm: 0.156 * INCH,
    gapXMm: 0.188 * INCH,
    gapYMm: 0,
  }),
  roll("brother-dk1201", "brother", "Brother DK-1201", "29 × 90 mm die-cut address.", 29, 90),
  roll("brother-dk1202", "brother", "Brother DK-1202", "62 × 100 mm. The practical Brother default.", 62, 100),
  roll("brother-dk1209", "brother", "Brother DK-1209", "62 × 29 mm small die-cut.", 62, 29),
  roll("brother-dk2205", "brother", "Brother DK-2205", "62 mm continuous tape. Printed at 62 × 100 mm.", 62, 100),
  roll("dymo-30252", "dymo", "Dymo 30252", "1.125 × 3.5 in address.", 3.5 * INCH, 1.125 * INCH),
  roll("dymo-30334", "dymo", "Dymo 30334", "1.25 × 2.25 in multipurpose.", 2.25 * INCH, 1.25 * INCH),
  roll("dymo-30256", "dymo", "Dymo 30256", "2.3125 × 4 in shipping.", 4 * INCH, 2.3125 * INCH),
  roll("zebra-2x1", "zebra", "Zebra 2 × 1 in", "50.8 × 25.4 mm.", 50.8, 25.4),
  roll("zebra-3x2", "zebra", "Zebra 3 × 2 in", "76.2 × 50.8 mm.", 76.2, 50.8),
  roll("zebra-4x2", "zebra", "Zebra 4 × 2 in", "101.6 × 50.8 mm.", 101.6, 50.8),
  roll("zebra-4x6", "zebra", "Zebra 4 × 6 in", "101.6 × 152.4 mm.", 101.6, 152.4),
];

function roll(
  id: string,
  family: LabelFamily,
  name: string,
  detail: string,
  widthMm: number,
  heightMm: number,
): LabelTemplate {
  return {
    id,
    family,
    name,
    detail,
    paper: "roll",
    pageWidthMm: widthMm,
    pageHeightMm: heightMm,
    labelWidthMm: widthMm,
    labelHeightMm: heightMm,
    columns: 1,
    rows: 1,
    marginTopMm: 0,
    marginLeftMm: 0,
    gapXMm: 0,
    gapYMm: 0,
  };
}

export const DEFAULT_TEMPLATE_ID = "avery-5163";

export function templateById(id: string): LabelTemplate | null {
  return LABEL_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function customTemplate(widthInches: number, heightInches: number): LabelTemplate {
  if (!Number.isFinite(widthInches) || !Number.isFinite(heightInches)) {
    throw new Error("Enter a width and a height.");
  }
  if (widthInches < 0.5 || heightInches < 0.5 || widthInches > 8.5 || heightInches > 14) {
    throw new Error("Custom labels must be between 0.5 and 8.5 inches wide, and 0.5 and 14 inches tall.");
  }
  return roll("custom", "custom", "Custom size", `${widthInches} × ${heightInches} in.`, widthInches * INCH, heightInches * INCH);
}

export function labelsPerPage(template: LabelTemplate): number {
  return template.columns * template.rows;
}

export type LabelSlot = { page: number; column: number; row: number; xMm: number; yMm: number };

export function labelSlot(template: LabelTemplate, index: number): LabelSlot {
  const perPage = labelsPerPage(template);
  const page = Math.floor(index / perPage);
  const slot = index % perPage;
  const column = slot % template.columns;
  const row = Math.floor(slot / template.columns);
  return {
    page,
    column,
    row,
    xMm: template.marginLeftMm + column * (template.labelWidthMm + template.gapXMm),
    yMm: template.marginTopMm + row * (template.labelHeightMm + template.gapYMm),
  };
}

/** True when every label on the sheet sits inside the page, within a millimeter. */
export function templateFits(template: LabelTemplate, toleranceMm = 1.5): boolean {
  if (template.columns < 1 || template.rows < 1) return false;
  const last = labelSlot(template, labelsPerPage(template) - 1);
  const right = last.xMm + template.labelWidthMm;
  const bottom = last.yMm + template.labelHeightMm;
  return right <= template.pageWidthMm + toleranceMm && bottom <= template.pageHeightMm + toleranceMm;
}

export function labelArrangement(template: LabelTemplate): "row" | "column" {
  return template.labelWidthMm >= template.labelHeightMm * 1.4 ? "row" : "column";
}

export type LabelOptions = {
  showType: boolean;
  showLocation: boolean;
};

export const DEFAULT_LABEL_OPTIONS: LabelOptions = {
  showType: true,
  showLocation: false,
};
