import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accountDetail, accountLabel } from "./account";

describe("account footer", () => {
  it("shows the person and keeps the email when the name is different", () => {
    expect(accountLabel("Jonathan", "jonathan@example.com")).toBe("Jonathan");
    expect(accountDetail("Jonathan", "jonathan@example.com")).toBe("jonathan@example.com");
    expect(accountLabel("jonathan@example.com", "jonathan@example.com")).toBe("jonathan@example.com");
    expect(accountDetail("jonathan@example.com", "jonathan@example.com")).toBeNull();
    expect(accountLabel("  ", "")).toBe("You");
  });

  it("keeps sign out in the pinned sidebar and the mobile menu", () => {
    const shell = readFileSync("components/shell/AppShell.tsx", "utf8");
    const aside = shell.slice(shell.indexOf("<aside"), shell.indexOf("</aside>"));
    const mobileStart = shell.indexOf('aria-label="Mobile menu"');
    const mobile = shell.slice(mobileStart, shell.indexOf("</nav>", mobileStart));
    expect(aside).toContain("ShellAccount");
    expect(aside).toMatch(/sticky/);
    expect(aside).toMatch(/h-dvh/);
    expect(mobile).toContain("ShellAccount");
    expect(readFileSync("components/shell/ShellAccount.tsx", "utf8")).toContain("Sign out");
    expect(readFileSync("app/(main)/layout.tsx", "utf8")).toContain("ShellAccount");
  });
});
