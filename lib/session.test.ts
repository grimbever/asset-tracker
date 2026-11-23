import { describe, expect, it } from "vitest";
import { chooseOrganization } from "./session";

describe("active organization", () => {
  it("uses the cookie when the person belongs to that organization", () => {
    expect(chooseOrganization(["a", "b"], "b")).toBe("b");
    expect(chooseOrganization(["a", "b"], "missing")).toBe("a");
    expect(chooseOrganization([], "a")).toBeNull();
  });
});
