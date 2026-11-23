/**
 * Product name, colors, and defaults.
 * The real name is not chosen yet. Change it here and nowhere else.
 */
export const APP_NAME = "Asset Tracker";
export const APP_SHORT_NAME = "Assets";
export const APP_DESCRIPTION =
  "Know what you own, where it is, and who has it. Equipment, tools, trailers, dosing gear, and office IT.";

export const DEFAULT_TIMEZONE = "America/Chicago";

export const TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "Pacific/Honolulu",
  "UTC",
] as const;

/** Shop-floor palette. Swap these when a name and logo are chosen. */
export const BRAND = {
  paper: "#f3efe4",
  paperDeep: "#e6dfd0",
  card: "#fffdf8",
  ink: "#1c1915",
  muted: "#5e584e",
  line: "#ddd4c4",
  green: "#1d6b4f",
  greenSoft: "#e5f2eb",
  ember: "#c4511a",
  emberSoft: "#fde8dc",
  gold: "#8a5a12",
  danger: "#8f2d2d",
  dangerSoft: "#f8e6e4",
} as const;

export const ORG_COOKIE = "asset_tracker_org";

/** Photos are resized before upload so a phone picture does not fill storage. */
export const PHOTO_MAX_EDGE_PX = 1600;
export const PHOTO_MAX_INPUT_BYTES = 12 * 1024 * 1024;
