const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function newId(): string {
  return crypto.randomUUID();
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** URL-safe token for an invite link. Not a guessable short code. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function attachmentPath(
  organizationId: string,
  assetId: string,
  attachmentId: string,
  fileName: string,
): string {
  const base = fileName.split(/[/\\]/).pop() ?? "photo";
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80);
  return `${organizationId}/${assetId}/${attachmentId}/${clean || "photo"}`;
}
