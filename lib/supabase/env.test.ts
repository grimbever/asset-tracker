import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/lib/config";
import { configFromParts, normalizeSupabaseUrl, selectSupabaseKey } from "./env";

describe("supabase env", () => {
  it("strips a pasted Data API suffix and trailing slashes", () => {
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl(" https://abc.supabase.co ")).toBe("https://abc.supabase.co");
  });

  it("prefers the publishable key and still accepts the anon key", () => {
    expect(selectSupabaseKey("sb_publishable_abc", "legacy-jwt")).toBe("sb_publishable_abc");
    expect(selectSupabaseKey("  ", "legacy-jwt")).toBe("legacy-jwt");
    expect(configFromParts("", "sb_publishable_abc")).toBeNull();
    expect(configFromParts("https://abc.supabase.co", undefined, "legacy-jwt")?.key).toBe("legacy-jwt");
  });

  it("reads public env vars as literal process.env properties so Next can inline them", () => {
    const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(source).not.toContain("process.env[");
  });

  it("keeps the product name in one config", () => {
    expect(APP_NAME).toBe("Asset Tracker");
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("APP_NAME");
    expect(layout).not.toContain("Asset Tracker");
  });
});
