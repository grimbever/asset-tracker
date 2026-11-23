export type SupabasePublicConfig = {
  url: string;
  key: string;
};

/**
 * These three reads must stay direct `process.env.NEXT_PUBLIC_…` expressions.
 * Next inlines those literals into the client bundle. Reading the env object
 * and then picking a property, or indexing it by a variable, leaves the browser
 * without the values even when Vercel has them set.
 */
function inlinedSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

function inlinedPublishableKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
}

function inlinedAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

/** Strip a pasted Data API path so the client receives the project origin. */
export function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim();
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/rest\/v1$/i, "");
  url = url.replace(/\/+$/, "");
  return url;
}

export function selectSupabaseKey(publishable: string | undefined, anon: string | undefined): string {
  const next = (publishable ?? "").trim();
  if (next) return next;
  return (anon ?? "").trim();
}

export function configFromParts(
  url: string,
  publishable?: string,
  anon?: string,
): SupabasePublicConfig | null {
  const normalized = normalizeSupabaseUrl(url);
  const key = selectSupabaseKey(publishable, anon);
  if (!normalized || !key) return null;
  return { url: normalized, key };
}

export function supabasePublicConfig(): SupabasePublicConfig | null {
  return configFromParts(inlinedSupabaseUrl(), inlinedPublishableKey(), inlinedAnonKey());
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicConfig() !== null;
}
