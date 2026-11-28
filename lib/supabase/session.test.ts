import { describe, expect, it } from "vitest";
import { sessionNeedsRefresh } from "./session";

const now = Date.parse("2026-11-28T12:00:00Z");

function token(expiresAt: number) {
  return JSON.stringify({ access_token: "header.payload.sig", expires_at: expiresAt });
}

describe("session refresh", () => {
  it("skips the auth server while the token still has a minute left", () => {
    const expiresAt = Math.floor(now / 1000) + 10 * 60;
    expect(sessionNeedsRefresh([{ name: "sb-project-auth-token", value: token(expiresAt) }], now)).toBe(false);
  });

  it("refreshes when the token is inside the last minute or missing", () => {
    const expiresAt = Math.floor(now / 1000) + 30;
    expect(sessionNeedsRefresh([{ name: "sb-project-auth-token", value: token(expiresAt) }], now)).toBe(true);
    expect(sessionNeedsRefresh([], now)).toBe(true);
  });

  it("joins chunked cookies and reads a base64 payload", () => {
    const expiresAt = Math.floor(now / 1000) + 3600;
    const encoded = `base64-${Buffer.from(token(expiresAt), "utf8").toString("base64url")}`;
    const mid = Math.ceil(encoded.length / 2);
    expect(
      sessionNeedsRefresh(
        [
          { name: "sb-project-auth-token.1", value: encoded.slice(mid) },
          { name: "sb-project-auth-token.0", value: encoded.slice(0, mid) },
        ],
        now,
      ),
    ).toBe(false);
  });
});
