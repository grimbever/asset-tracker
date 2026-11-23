import type { AssetType } from "@/lib/assets/types";

export type DemoLocation = { key: string; name: string };
export type DemoPerson = { key: string; name: string };
export type DemoAsset = {
  key: string;
  name: string;
  type: AssetType;
  locationKey: string;
  parentKey?: string;
  checkoutAsUnit?: boolean;
  groupLabel?: string;
  brand?: string;
  model?: string;
  serial?: string;
  notes?: string;
  cost?: number;
  customFields?: Record<string, string>;
};

export const DEMO_LOCATIONS: readonly DemoLocation[] = [
  { key: "shop", name: "Shop" },
  { key: "yard", name: "Yard" },
  { key: "storeroom", name: "Storeroom" },
];

export const DEMO_PEOPLE: readonly DemoPerson[] = [{ key: "pat", name: "Pat (demo)" }];

export function demoAssets(now = new Date()): DemoAsset[] {
  const registration = shiftDate(now, 120);
  const lastCalibration = shiftDate(now, -40);
  const nextCalibration = shiftDate(now, 20);
  return [
    {
      key: "trailer",
      name: "16 ft equipment trailer",
      type: "trailer",
      locationKey: "yard",
      groupLabel: "Field kit",
      brand: "Utility",
      model: "16 ft tandem",
      cost: 4500,
      notes: "Demo trailer. Plate and VIN are not real.",
      customFields: {
        vin: "DEMO0000000000001",
        plate: "DEMO",
        registration_expiry: registration,
        gvwr: "7000 lb",
      },
    },
    {
      key: "driver",
      name: "Impact driver",
      type: "tool",
      locationKey: "shop",
      groupLabel: "Shop",
      brand: "Milwaukee",
      model: "M18",
      serial: "DEMO-IMPACT-1",
      cost: 179,
      notes: "Demo tool.",
    },
    {
      key: "skid",
      name: "PAA dosing skid",
      type: "dosing_gear",
      locationKey: "shop",
      checkoutAsUnit: true,
      groupLabel: "Field kit",
      notes: "Demo skid. Check out as a unit with the feed pump.",
      cost: 2200,
      customFields: {
        pump_model: "Peristaltic",
        chemical: "PAA",
        last_calibration: lastCalibration,
        next_calibration: nextCalibration,
      },
    },
    {
      key: "pump",
      name: "PAA feed pump",
      type: "dosing_gear",
      locationKey: "shop",
      parentKey: "skid",
      groupLabel: "Field kit",
      notes: "Child of the PAA dosing skid.",
      customFields: {
        pump_model: "Peristaltic",
        chemical: "PAA",
      },
    },
  ];
}

function shiftDate(now: Date, days: number): string {
  const next = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
