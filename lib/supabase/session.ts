const REFRESH_WITHIN_MS = 60_000;

/** True when the proxy should ask Supabase to refresh the session. A token that still has time left does not need another network call. */
export function sessionNeedsRefresh(cookies: readonly { name: string; value: string }[], nowMs: number): boolean {
  const parts = cookies
    .filter((cookie) => cookie.name.includes("-auth-token") && !cookie.name.includes("code-verifier"))
    .map((cookie) => {
      const match = /\.(\d+)$/.exec(cookie.name);
      return { index: match ? Number(match[1]) : 0, value: cookie.value };
    })
    .sort((left, right) => left.index - right.index);
  if (parts.length === 0) return true;
  let raw = parts.map((part) => part.value).join("");
  if (raw.startsWith("base64-")) {
    const decoded = decodeBase64Url(raw.slice("base64-".length));
    if (!decoded) return true;
    raw = decoded;
  }
  try {
    const parsed = JSON.parse(raw) as { expires_at?: number; access_token?: string };
    const exp = typeof parsed.expires_at === "number" ? parsed.expires_at : expiryFromJwt(parsed.access_token);
    if (typeof exp !== "number") return true;
    return exp * 1000 <= nowMs + REFRESH_WITHIN_MS;
  } catch {
    return true;
  }
}

function expiryFromJwt(token: string | undefined): number | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  const decoded = decodeBase64Url(payload);
  if (!decoded) return null;
  try {
    const body = JSON.parse(decoded) as { exp?: number };
    return typeof body.exp === "number" ? body.exp : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string | null {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}
