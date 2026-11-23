import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/lib/config";
import {
  configFromParts,
  httpUrlOrigin,
  normalizeSupabaseUrl,
  selectSupabaseKey,
  supabaseEnvProblemFrom,
} from "./env";

describe("supabase env", () => {
  it("strips a pasted Data API suffix, quotes, and whitespace", () => {
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl(" https://abc.supabase.co ")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl("\"https://abc.supabase.co/\"")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl("https://abc.supabase.co\n")).toBe("https://abc.supabase.co");
  });

  it("adds https to a bare supabase host", () => {
    expect(normalizeSupabaseUrl("abc.supabase.co")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl("abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(configFromParts("  ABC.supabase.co  ", "sb_publishable_abc")).toEqual({
      url: "https://abc.supabase.co",
      key: "sb_publishable_abc",
    });
  });

  it("keeps an explicit http origin, including a local port", () => {
    expect(configFromParts("http://127.0.0.1:54321/", undefined, "anon-key")).toEqual({
      url: "http://127.0.0.1:54321",
      key: "anon-key",
    });
  });

  it("prefers the publishable key and still accepts the anon key", () => {
    expect(selectSupabaseKey("sb_publishable_abc", "legacy-jwt")).toBe("sb_publishable_abc");
    expect(selectSupabaseKey("  ", "legacy-jwt")).toBe("legacy-jwt");
    expect(selectSupabaseKey(" 'sb_publishable_abc' ", undefined)).toBe("sb_publishable_abc");
    expect(configFromParts("", "sb_publishable_abc")).toBeNull();
    expect(configFromParts("https://abc.supabase.co", undefined, "legacy-jwt")?.key).toBe("legacy-jwt");
  });

  it("rejects a key or other text pasted into the URL field", () => {
    expect(httpUrlOrigin("sb_publishable_abc")).toBeNull();
    expect(configFromParts("sb_publishable_abc", "sb_publishable_real")).toBeNull();
    expect(configFromParts("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig", "anon")).toBeNull();
    expect(configFromParts("not a url", "anon")).toBeNull();
    expect(configFromParts("ftp://abc.supabase.co", "anon")).toBeNull();
    const problem = supabaseEnvProblemFrom("sb_publishable_abc");
    expect(problem?.variable).toBe("NEXT_PUBLIC_SUPABASE_URL");
    expect(problem?.message).toContain("Project URL");
    expect(supabaseEnvProblemFrom("   ")).toBeNull();
    expect(supabaseEnvProblemFrom("https://abc.supabase.co/rest/v1")).toBeNull();
  });

  it("reads public env vars as literal process.env properties so Next can inline them", () => {
    const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(source).not.toContain("process.env[");
  });

  it("keeps the auth proxy off static files and never lets a bad env throw", () => {
    const source = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
    expect(source).toContain("catch {");
    const literal = source.match(/matcher:\s*\[\s*"([^"]+)"/)?.[1];
    expect(literal).toBeTruthy();
    const runtime = JSON.parse(`"${literal}"`) as string;
    const re = new RegExp(`^${runtime}`);
    expect(re.test("/")).toBe(true);
    expect(re.test("/home")).toBe(true);
    expect(re.test("/sign-in")).toBe(true);
    expect(re.test("/manifest.json")).toBe(false);
    expect(re.test("/manifest.webmanifest")).toBe(false);
    expect(re.test("/favicon.ico")).toBe(false);
    expect(re.test("/sw.js")).toBe(false);
    expect(re.test("/robots.txt")).toBe(false);
    expect(re.test("/icons/icon-192.png")).toBe(false);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/_next/image")).toBe(false);
  });

  it("keeps the product name in one config", () => {
    expect(APP_NAME).toBe("Asset Tracker");
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("APP_NAME");
    expect(layout).not.toContain("Asset Tracker");
  });
});
