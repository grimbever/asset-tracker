import { PHOTO_MAX_INPUT_BYTES } from "@/lib/config";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function photoRejection(file: { type: string; size: number }): string | null {
  if (!TYPES.has(file.type)) return "Use a JPEG, PNG, or WebP photo.";
  if (file.size > PHOTO_MAX_INPUT_BYTES) return "That photo is larger than 12 MB. Choose a smaller one.";
  return null;
}
