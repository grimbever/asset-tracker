"use client";

import { useEffect, useState } from "react";
import { Button, Field, TextInput } from "@/components/ui";
import { messageFrom } from "@/lib/data/errors";
import { newId } from "@/lib/ids";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function WarrantyAlertSettings({ organizationId }: { organizationId: string }) {
  const [days, setDays] = useState("30, 7");
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    void supabase.from("organization_settings").select("notify_low_stock, warranty_reminder_days").eq("organization_id", organizationId).maybeSingle().then(({ data }) => {
      const row = data as { notify_low_stock?: boolean; warranty_reminder_days?: number[] } | null;
      if (!row) return;
      if (Array.isArray(row.warranty_reminder_days)) setDays(row.warranty_reminder_days.join(", "));
      if (typeof row.notify_low_stock === "boolean") setNotify(row.notify_low_stock);
    });
  }, [organizationId]);

  async function save() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const parsed = days.split(/[^0-9]+/).filter(Boolean).map((day) => Number(day));
    const { error: rpcError } = await supabase.rpc("save_stock_alert_settings", {
      p_organization_id: organizationId,
      p_event_id: newId(),
      p_notify_low_stock: notify,
      p_warranty_days: parsed,
    });
    if (rpcError) {
      setError(messageFrom(rpcError));
      setMessage(null);
      return;
    }
    setError(null);
    setMessage("Alert settings saved.");
  }

  return (
    <div className="grid gap-2 rounded-2xl bg-paper p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
        Email when stock crosses its reorder point
      </label>
      <Field label="Warranty reminder days" hint="Days before the warranty ends. 30 and 7 is the default.">
        <TextInput value={days} onChange={(event) => setDays(event.target.value)} />
      </Field>
      <Button type="button" variant="ghost" onClick={() => void save()}>Save alert days</Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-ember">{error}</p> : null}
    </div>
  );
}
