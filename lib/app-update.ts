export const APP_UPDATED_MESSAGE = "The app was updated. Reload the page to continue.";

export function isStaleAppError(error: unknown): boolean {
  const message = errorText(error);
  return /server action/i.test(message) && /not found|unrecognized/i.test(message);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return "";
}
