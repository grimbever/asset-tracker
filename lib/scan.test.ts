import { describe, expect, it } from "vitest";
import { absoluteAssetUrl, parseScan } from "./scan";

describe("scan parsing", () => {
  it("reads a deep link, a path, and a raw tag", () => {
    expect(parseScan("https://assets.example.com/a/AT-1001")).toBe("AT-1001");
    expect(parseScan("https://assets.example.com/a/AT-1001?src=qr")).toBe("AT-1001");
    expect(parseScan("/a/Shop-12")).toBe("Shop-12");
    expect(parseScan("  AT-1002  ")).toBe("AT-1002");
  });

  it("ignores unrelated barcodes and empty scans", () => {
    expect(parseScan("")).toBeNull();
    expect(parseScan("https://example.com/other")).toBeNull();
    expect(parseScan("not a tag")).toBeNull();
  });

  it("builds the public asset URL", () => {
    expect(absoluteAssetUrl("https://assets.example.com/", "AT-1001")).toBe("https://assets.example.com/a/AT-1001");
  });
});
