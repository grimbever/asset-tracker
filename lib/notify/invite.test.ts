import { describe, expect, it } from "vitest";
import {
  SEND_INVITE_BY_EMAIL_DEFAULT,
  formatInviteExpiry,
  inviteAcceptUrl,
  inviteFeedback,
  inviteMail,
} from "./invite";

describe("invite email", () => {
  const mail = inviteMail({
    to: "pat@example.com",
    orgName: "Bever <Shop>",
    inviterName: "Jonathan",
    roleName: "Editor",
    acceptUrl: inviteAcceptUrl("https://asset-tracker-steel.vercel.app/", "token-1"),
    expiresOn: formatInviteExpiry("2026-12-11T18:00:00.000Z", "America/Chicago"),
    appName: "Asset Tracker",
  });

  it("starts with send-by-email turned on", () => {
    expect(SEND_INVITE_BY_EMAIL_DEFAULT).toBe(true);
  });

  it("names the org, inviter, role, expiry, and accept link", () => {
    expect(mail.to).toBe("pat@example.com");
    expect(mail.subject).toBe("Join Bever <Shop> on Asset Tracker");
    expect(mail.text).toContain("Jonathan invited you to Bever <Shop>");
    expect(mail.text).toContain("Role: Editor");
    expect(mail.text).toContain("December 11, 2026");
    expect(mail.text).toContain("https://asset-tracker-steel.vercel.app/invite/token-1");
    expect(mail.html).toContain("Accept invite");
    expect(mail.html).toContain("href=\"https://asset-tracker-steel.vercel.app/invite/token-1\"");
    expect(mail.html).toContain("Bever &lt;Shop&gt;");
    expect(mail.html).not.toContain("Bever <Shop>");
  });

  it("says when the email went out, when Resend is missing, and when the send failed", () => {
    expect(inviteFeedback({ email: "pat@example.com", wantedEmail: false, result: null }).text).toMatch(/Copy the link/);
    expect(
      inviteFeedback({
        email: "pat@example.com",
        wantedEmail: true,
        result: { sent: true, configured: true },
      }).tone,
    ).toBe("ok");
    expect(
      inviteFeedback({
        email: "pat@example.com",
        wantedEmail: true,
        result: { sent: false, configured: false },
      }).text,
    ).toMatch(/not set up/);
    expect(
      inviteFeedback({
        email: "pat@example.com",
        wantedEmail: true,
        result: { sent: false, configured: true, reason: "rejected" },
      }).text,
    ).toMatch(/did not send/);
    expect(
      inviteFeedback({
        email: "pat@example.com",
        wantedEmail: true,
        again: true,
        result: { sent: true, configured: true },
      }).text,
    ).toMatch(/again/);
  });
});
