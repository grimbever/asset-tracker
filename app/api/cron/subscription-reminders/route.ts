import { createClient } from "@supabase/supabase-js";
import { notificationRecipients, notifySkipReason } from "@/lib/notify/plan";
import { supabasePublicConfig } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function inlinedResendKey(): string {
  return process.env.RESEND_API_KEY ?? "";
}

function inlinedNotifyFrom(): string {
  return process.env.NOTIFY_FROM ?? "";
}

function inlinedCronSecret(): string {
  return process.env.CRON_SECRET ?? "";
}

function inlinedServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export async function GET(request: Request) {
  const secret = inlinedCronSecret().trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, skipped: "CRON_SECRET is not set or does not match" }, { status: secret ? 401 : 200 });
  }
  const config = supabasePublicConfig();
  const serviceKey = inlinedServiceKey().trim();
  if (!config || !serviceKey) {
    console.info("subscription reminders skipped: SUPABASE_SERVICE_ROLE_KEY is not set");
    return Response.json({ ok: true, sent: 0, skipped: "SUPABASE_SERVICE_ROLE_KEY is not set" });
  }
  const skip = notifySkipReason(inlinedResendKey(), inlinedNotifyFrom(), ["owner@example.com"]);
  if (skip && skip !== "no recipients") {
    console.info(`subscription reminders skipped: ${skip}`);
    return Response.json({ ok: true, sent: 0, skipped: skip });
  }

  const supabase = createClient(config.url, serviceKey, { auth: { persistSession: false } });
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("claim_subscription_reminders", { p_today: today });
  if (error) {
    console.info("subscription reminders skipped", error.message);
    return Response.json({ ok: false, sent: 0, skipped: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as {
    organization_id: string;
    subscription_id: string;
    name: string;
    renews_on: string;
    days_before: number;
    owner_email: string | null;
    organization_name: string;
  }[];
  let sent = 0;
  for (const row of rows) {
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
    const recipients = [...new Set([row.owner_email ?? "", ...adminEmails].map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@")))];
    if (recipients.length === 0) continue;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inlinedResendKey().trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: inlinedNotifyFrom().trim(),
        to: recipients,
        subject: `${row.name} renews in ${row.days_before} days`,
        text: `${row.name} at ${row.organization_name} renews on ${row.renews_on}.`,
      }),
    });
    if (!response.ok) {
      await supabase.rpc("release_subscription_reminder", {
        p_subscription_id: row.subscription_id,
        p_renews_on: row.renews_on,
        p_days_before: row.days_before,
      });
      console.info(`subscription reminder skipped: Resend returned ${response.status}`);
      continue;
    }
    sent += 1;
  }
  let warrantySent = 0;
  const { data: warrantyRows, error: warrantyError } = await supabase.rpc("claim_warranty_reminders", { p_today: today });
  if (warrantyError) {
    console.info("warranty reminders skipped", warrantyError.message);
  } else {
    for (const row of (warrantyRows ?? []) as { organization_id: string; asset_id: string; name: string; tag_id: string; warranty_end: string; days_before: number; organization_name: string }[]) {
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
      const { data: customRows } = await supabase.from("notification_recipients").select("email").eq("organization_id", row.organization_id);
      const custom = (customRows ?? []).map((item) => String((item as { email: string }).email));
      const recipients = notificationRecipients(custom, adminEmails);
      if (recipients.length === 0) continue;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${inlinedResendKey().trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: inlinedNotifyFrom().trim(),
          to: recipients,
          subject: `${row.name} warranty ends in ${row.days_before} days`,
          text: `${row.name} (${row.tag_id}) at ${row.organization_name} is under warranty until ${row.warranty_end}.`,
        }),
      });
      if (!response.ok) {
        await supabase.rpc("release_warranty_reminder", { p_asset_id: row.asset_id, p_warranty_end: row.warranty_end, p_days_before: row.days_before });
        continue;
      }
      warrantySent += 1;
    }
  }
  return Response.json({ ok: true, sent, warrantySent });
}
