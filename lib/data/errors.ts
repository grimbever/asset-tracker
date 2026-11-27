import { APP_UPDATED_MESSAGE, isStaleAppError } from "@/lib/app-update";

export function messageFrom(error: unknown, fallback = "That did not save. Try again."): string {
  if (isStaleAppError(error)) return APP_UPDATED_MESSAGE;
  if (error instanceof Error && error.message.trim()) return clean(error.message);
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return clean(error.message);
  }
  return fallback;
}

function clean(message: string): string {
  const stripped = message.replace(/^.*ERROR:\s*/i, "").trim();
  if (/duplicate key/i.test(stripped) && /tag/i.test(stripped)) {
    return "That tag is already used in this organization. Leave the tag blank to assign the next one.";
  }
  if (/duplicate key/i.test(stripped)) return "That record already exists.";
  if (/jwt|not authenticated|sign in/i.test(stripped)) return "Sign in again, then retry.";
  return stripped || "That did not save. Try again.";
}
