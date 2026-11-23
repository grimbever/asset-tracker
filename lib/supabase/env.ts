export type SupabasePublicConfig = {
  url: string;
  key: string;
};

export type SupabaseEnvProblem = {
  variable: "NEXT_PUBLIC_SUPABASE_URL";
  message: string;
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

function stripWhitespaceAndQuotes(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/^['"]+|['"]+$/g, "");
}

/**
 * Turn a pasted Project URL into an origin.
 * Accepts a bare `project.supabase.co` host, a trailing slash, and `/rest/v1`.
 * Returns "" when the input is empty. A non-empty result may still be invalid;
 * `httpUrlOrigin` decides that.
 */
export function normalizeSupabaseUrl(raw: string): string {
  let url = stripWhitespaceAndQuotes(raw);
  if (!url) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /^([a-z0-9-]+\.)+supabase\.co(\/.*)?$/i.test(url)) {
    url = `https://${url}`;
  }
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/rest\/v1$/i, "");
  url = url.replace(/\/+$/, "");
  return url;
}

/** Origin of an http(s) URL, or null when the string is not one. */
export function httpUrlOrigin(value: string): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function selectSupabaseKey(publishable: string | undefined, anon: string | undefined): string {
  const next = stripWhitespaceAndQuotes(publishable ?? "");
  if (next) return next;
  return stripWhitespaceAndQuotes(anon ?? "");
}

export function configFromParts(
  url: string,
  publishable?: string,
  anon?: string,
): SupabasePublicConfig | null {
  const origin = httpUrlOrigin(normalizeSupabaseUrl(url));
  const key = selectSupabaseKey(publishable, anon);
  if (!origin || !key) return null;
  return { url: origin, key };
}

export function supabaseEnvProblemFrom(url: string): SupabaseEnvProblem | null {
  const raw = stripWhitespaceAndQuotes(url);
  if (!raw) return null;
  if (httpUrlOrigin(normalizeSupabaseUrl(raw))) return null;
  return {
    variable: "NEXT_PUBLIC_SUPABASE_URL",
    message:
      "is not a valid web address. Paste the Project URL from Supabase, such as https://your-project.supabase.co. The host alone, your-project.supabase.co, also works. Do not put the anon key or the publishable key in this field.",
  };
}

export function supabasePublicConfig(): SupabasePublicConfig | null {
  return configFromParts(inlinedSupabaseUrl(), inlinedPublishableKey(), inlinedAnonKey());
}

export function supabaseEnvProblem(): SupabaseEnvProblem | null {
  return supabaseEnvProblemFrom(inlinedSupabaseUrl());
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicConfig() !== null;
}
