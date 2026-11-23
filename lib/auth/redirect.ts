/** Keep this a direct process.env read so Next can inline it in the browser bundle. */
export function configuredSiteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
}

/** Prefer NEXT_PUBLIC_SITE_URL. In the browser, fall back to the current origin. */
export function authRedirectOrigin(browserOrigin?: string): string {
  const configured = configuredSiteOrigin();
  if (configured) return configured;
  if (browserOrigin) return browserOrigin.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function passwordResetRedirect(origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/auth/callback?next=/reset-password`;
}

/** Only same-site paths. Blocks protocol-relative and off-site targets. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/home";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/home";
  if (next.includes("://")) return "/home";
  return next;
}

const OTP_TYPES = ["recovery", "signup", "magiclink", "email", "invite"] as const;
export type OtpType = (typeof OTP_TYPES)[number];

export type AuthCallbackPlan =
  | { action: "exchange"; code: string; next: string }
  | { action: "verify"; tokenHash: string; type: OtpType; next: string }
  | { action: "redirect"; next: string };

export function planAuthCallback(url: URL): AuthCallbackPlan {
  const type = url.searchParams.get("type");
  const requested = url.searchParams.get("next");
  let next = safeNextPath(requested);
  if (type === "recovery" && !requested) next = "/reset-password";
  const code = url.searchParams.get("code");
  if (code) return { action: "exchange", code, next };
  const tokenHash = url.searchParams.get("token_hash");
  if (tokenHash && isOtpType(type)) return { action: "verify", tokenHash, type, next };
  return { action: "redirect", next };
}

function isOtpType(value: string | null): value is OtpType {
  return OTP_TYPES.some((type) => type === value);
}
