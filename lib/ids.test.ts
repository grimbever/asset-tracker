import { describe, expect, it } from "vitest";
import { attachmentPath, isUuid, newId, newToken, normalizeEmail } from "./ids";

describe("ids", () => {
  it("creates client uuids and invite tokens", () => {
    const id = newId();
    expect(isUuid(id)).toBe(true);
    expect(newId()).not.toBe(id);
    const token = newToken();
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(token).not.toMatch(/[+/=]/);
  });

  it("normalizes email and builds a storage path inside the organization", () => {
    expect(normalizeEmail("  Pat@Example.com ")).toBe("pat@example.com");
    expect(attachmentPath("org", "asset", "file", "My Photo.JPG")).toBe("org/asset/file/My-Photo.JPG");
    expect(attachmentPath("org", "asset", "file", "../secret.png")).toBe("org/asset/file/secret.png");
  });
});
