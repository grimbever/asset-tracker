"use server";

import { notificationRecipients, notifySkipReason, shouldEmail } from "@/lib/notify/plan";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function inlinedResendKey(): string {
  return process.env.RESEND_API_KEY ?? "";
}

function inlinedNotifyFrom(): string {
  return process.env.NOTIFY_FROM ?? "";
}

/** Send a check-out, check-in, or flagged status email. Missing Resend settings are logged and skipped. */
export async function deliverNotification(eventId: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { sent: false, reason: "Supabase is not configured" };
    const { data: event, error } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
    if (error || !event) return { sent: false, reason: "event was not found" };
    const row = event as {
      organization_id: string;
      event_type: string;
      notes: string | null;
      actor_name: string | null;
      payload: Record<string, unknown> | null;
      to_state: Record<string, unknown> | null;
    };
    const statusKey = typeof row.to_state?.status === "string" ? row.to_state.status : typeof row.payload?.status === "string" ? row.payload.status : null;
    let statusNotify = false;
    if (row.event_type === "status_changed" && statusKey) {
      const { data: status } = await supabase
        .from("asset_statuses")
        .select("notify")
        .eq("organization_id", row.organization_id)
        .eq("key", statusKey)
        .maybeSingle();
      statusNotify = Boolean((status as { notify?: boolean } | null)?.notify);
    }
    const { data: company } = await supabase
      .from("organization_settings")
      .select("notify_checkout, notify_checkin, notify_status, accent_color")
      .eq("organization_id", row.organization_id)
      .maybeSingle();
    const flags = company as { notify_checkout?: boolean; notify_checkin?: boolean; notify_status?: boolean; accent_color?: string } | null;
    if (!shouldEmail({
      eventType: row.event_type,
      statusKey,
      statusNotify,
      notifyCheckout: flags?.notify_checkout,
      notifyCheckin: flags?.notify_checkin,
      notifyStatus: flags?.notify_status,
    })) {
      return { sent: false, reason: "this change does not send email" };
    }

    const { data: customRows } = await supabase.from("notification_recipients").select("email").eq("organization_id", row.organization_id);
    const custom = (customRows ?? []).map((item) => String((item as { email: string }).email));
    const { data: members } = await supabase.from("memberships").select("user_id, roles(key)").eq("organization_id", row.organization_id);
    const adminIds = (members ?? [])
      .filter((member) => {
        const role = (member as { roles: { key: string } | { key: string }[] | null }).roles;
        const key = Array.isArray(role) ? role[0]?.key : role?.key;
        return key === "admin";
      })
      .map((member) => String((member as { user_id: string }).user_id));
    let adminEmails: string[] = [];
    if (adminIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("email").in("id", adminIds);
      adminEmails = (profiles ?? []).map((profile) => String((profile as { email?: string }).email ?? ""));
    }
    const recipients = notificationRecipients(custom, adminEmails);
    const reason = notifySkipReason(inlinedResendKey(), inlinedNotifyFrom(), recipients);
    if (reason) {
      console.info(`notify skipped: ${reason}`);
      return { sent: false, reason };
    }

    const name = typeof row.payload?.name === "string" ? row.payload.name : "An item";
    const who = typeof row.payload?.assignee_name === "string" ? row.payload.assignee_name : typeof row.payload?.location_name === "string" ? row.payload.location_name : "";
    const subject =
      row.event_type === "checked_out"
        ? `${name} was checked out${who ? ` to ${who}` : ""}`
        : row.event_type === "checked_in"
          ? `${name} was checked in`
          : `${name} is now ${statusKey?.replaceAll("_", " ") ?? "updated"}`;
    const text = [subject, row.actor_name ? `By ${row.actor_name}` : "", row.notes ?? ""].filter(Boolean).join("\n");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inlinedResendKey().trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: inlinedNotifyFrom().trim(),
        to: recipients,
        subject,
        text,
        html: `<div style="border-top:4px solid ${flags?.accent_color && /^#[0-9a-fA-F]{6}$/.test(flags.accent_color) ? flags.accent_color : "#1d6b4f"};padding-top:12px">${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</div>`,
      }),
    });
    if (!response.ok) {
      console.info(`notify skipped: Resend returned ${response.status}`);
      return { sent: false, reason: "the email service rejected the message" };
    }
    return { sent: true };
  } catch (error) {
    console.info("notify skipped", error);
    return { sent: false, reason: "the email could not be sent" };
  }
}
