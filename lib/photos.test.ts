import { describe, expect, it } from "vitest";
import { photoRejection } from "./photos";

describe("photos", () => {
  it("accepts a normal jpeg and rejects other files", () => {
    expect(photoRejection({ type: "image/jpeg", size: 200_000 })).toBeNull();
    expect(photoRejection({ type: "application/pdf", size: 1000 })).toMatch(/JPEG/);
    expect(photoRejection({ type: "image/png", size: 20_000_000 })).toMatch(/12 MB/);
  });
});
