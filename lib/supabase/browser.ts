import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./env";

let browserClient: SupabaseClient | null | undefined;

export function getBrowserSupabase(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const config = supabasePublicConfig();
  if (!config) {
    browserClient = null;
    return null;
  }
  try {
    browserClient = createBrowserClient(config.url, config.key);
  } catch {
    browserClient = null;
  }
  return browserClient;
}
