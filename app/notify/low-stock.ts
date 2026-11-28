"use server";

import { notificationRecipients, notifySkipReason } from "@/lib/notify/plan";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function inlinedResendKey(): string {
  return process.env.RESEND_API_KEY ?? "";
}

function inlinedNotifyFrom(): string {
  return process.env.NOTIFY_FROM ?? "";
}

export async function deliverLowStockAlert(input: { organizationId: string; name: string }): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return;
    const { data: settings } = await supabase
      .from("organization_settings")
      .select("notify_low_stock")
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (settings && (settings as { notify_low_stock?: boolean }).notify_low_stock === false) return;
    const { data: customRows } = await supabase.from("notification_recipients").select("email").eq("organization_id", input.organizationId);
    const custom = (customRows ?? []).map((item) => String((item as { email: string }).email));
    const { data: members } = await supabase.from("memberships").select("user_id, roles(key)").eq("organization_id", input.organizationId);
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
      console.info(`low stock skipped: ${reason}`);
      return;
    }
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inlinedResendKey().trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: inlinedNotifyFrom().trim(),
        to: recipients,
        subject: `${input.name} is low`,
        text: `${input.name} reached its reorder point.`,
      }),
    });
  } catch (error) {
    console.info("low stock skipped", error);
  }
}
