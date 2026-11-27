"use server";

import { APP_NAME } from "@/lib/config";
import { authRedirectOrigin } from "@/lib/auth/redirect";
import { newId } from "@/lib/ids";
import { formatInviteExpiry, inviteAcceptUrl, inviteMail, type InviteSendResult } from "@/lib/notify/invite";
import { notifySkipReason } from "@/lib/notify/plan";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function inlinedResendKey(): string {
  return process.env.RESEND_API_KEY ?? "";
}

function inlinedNotifyFrom(): string {
  return process.env.NOTIFY_FROM ?? "";
}

/** Email an existing invite. The copyable link still works when this does not send. */
export async function sendInviteEmail(inviteId: string, browserOrigin: string): Promise<InviteSendResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { sent: false, configured: false, reason: "Supabase is not configured" };

  const { data, error } = await supabase
    .from("invites")
    .select("id, email, token, expires_at, accepted_at, organization_id, organizations(name, timezone), roles(name)")
    .eq("id", inviteId)
    .maybeSingle();
  if (error || !data) return { sent: false, configured: true, reason: "That invite was not found." };

  const row = data as {
    id: string;
    email: string;
    token: string;
    expires_at: string;
    accepted_at: string | null;
    organizations: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
    roles: { name: string } | { name: string }[] | null;
  };
  if (row.accepted_at) return { sent: false, configured: true, reason: "This invite was already accepted." };

  const apiKey = inlinedResendKey();
  const from = inlinedNotifyFrom();
  if (!apiKey.trim() || !from.trim()) {
    const skip = notifySkipReason(apiKey, from, [row.email]);
    console.info(`invite email skipped: ${skip}`);
    return { sent: false, configured: false, reason: skip ?? "Email is not set up" };
  }

  const origin = authRedirectOrigin(browserOrigin);
  if (!origin) return { sent: false, configured: true, reason: "The invite link could not be built." };

  const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
  const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", userData.user?.id ?? "")
    .maybeSingle();
  const inviter = profile as { display_name?: string; email?: string } | null;
  const mail = inviteMail({
    to: row.email,
    orgName: organization?.name ?? "your organization",
    inviterName: inviter?.display_name?.trim() || inviter?.email || "A teammate",
    roleName: role?.name ?? "member",
    acceptUrl: inviteAcceptUrl(origin, row.token),
    expiresOn: formatInviteExpiry(row.expires_at, organization?.timezone || "America/Chicago"),
    appName: APP_NAME,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from.trim(),
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });
  if (!response.ok) {
    console.info(`invite email skipped: Resend returned ${response.status}`);
    return { sent: false, configured: true, reason: "The email service rejected the message." };
  }

  const { error: logError } = await supabase.rpc("log_invite_sent", {
    p_invite_id: row.id,
    p_event_id: newId(),
  });
  if (logError) console.error("invite email was sent, but history was not written", logError);
  return { sent: true, configured: true };
}
