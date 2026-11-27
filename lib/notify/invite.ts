export const SEND_INVITE_BY_EMAIL_DEFAULT = true;

export type InviteMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type InviteSendResult = {
  sent: boolean;
  configured: boolean;
  reason?: string;
};

export function inviteAcceptUrl(origin: string, token: string): string {
  const base = origin.trim().replace(/\/+$/, "");
  return `${base}/invite/${token}`;
}

export function formatInviteExpiry(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "long" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "long" }).format(date);
  }
}

export function inviteMail(input: {
  to: string;
  orgName: string;
  inviterName: string;
  roleName: string;
  acceptUrl: string;
  expiresOn: string;
  appName: string;
}): InviteMail {
  const org = input.orgName.trim() || "an organization";
  const inviter = input.inviterName.trim() || "A teammate";
  const role = input.roleName.trim() || "member";
  const subject = `Join ${org} on ${input.appName}`;
  const text = [
    `${inviter} invited you to ${org} on ${input.appName}.`,
    `Role: ${role}`,
    `This invite expires on ${input.expiresOn}.`,
    "",
    `Accept the invite: ${input.acceptUrl}`,
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f3efe4;color:#1c1915;font-family:Georgia,serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf8;border-radius:24px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#5e584e;">${escapeHtml(input.appName)}</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Join ${escapeHtml(org)}</h1>
                <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">${escapeHtml(inviter)} invited you to ${escapeHtml(org)}.</p>
                <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Your role will be <strong>${escapeHtml(role)}</strong>.</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">This invite expires on ${escapeHtml(input.expiresOn)}.</p>
                <a href="${escapeHtml(input.acceptUrl)}" style="display:inline-block;background:#1c1915;color:#f3efe4;text-decoration:none;border-radius:999px;padding:12px 20px;font-family:sans-serif;font-size:16px;">Accept invite</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#5e584e;">If the button does not open, copy this link:<br>${escapeHtml(input.acceptUrl)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { to: input.to.trim(), subject, html, text };
}

export function inviteFeedback(input: {
  email: string;
  wantedEmail: boolean;
  result: InviteSendResult | null;
  again?: boolean;
}): { tone: "ok" | "bad"; text: string } {
  const email = input.email.trim();
  if (!input.wantedEmail) {
    return { tone: "ok", text: "Invite created. Copy the link below." };
  }
  if (input.result?.sent) {
    return {
      tone: "ok",
      text: input.again
        ? `Invite emailed again to ${email}.`
        : `Invite emailed to ${email}. The link is below if you also want to copy it.`,
    };
  }
  if (input.result && !input.result.configured) {
    return {
      tone: "bad",
      text: input.again
        ? "Email is not set up, so this invite was not sent again."
        : "Email is not set up, so the invite was not sent. Copy the link below.",
    };
  }
  return {
    tone: "bad",
    text: input.again
      ? "The email did not send. Try again."
      : "The invite was created, but the email did not send. Copy the link below.",
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
