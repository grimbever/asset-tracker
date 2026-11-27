"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { messageFrom } from "@/lib/data/errors";
import { saveReminderDays } from "@/lib/subscriptions/data";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function ReminderSettings({ organizationId, days }: { organizationId: string; days: number[] }) {
  const router = useRouter();
  const [value, setValue] = useState(days.join(", "));
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = value.split(",").map((part) => Number(part.trim())).filter((day) => Number.isInteger(day));
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    try {
      await saveReminderDays(supabase, organizationId, parsed);
      setError(null);
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  return (
    <form className="grid gap-3 rounded-3xl border border-line p-4" onSubmit={(event) => void submit(event)}>
      <h2 className="font-serif text-2xl">Email reminders</h2>
      <p className="text-sm text-muted">Days before the renewal date. The daily check emails the account owner and the admins. Defaults are 30 and 7.</p>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Field label="Reminder days"><TextInput value={value} onChange={(event) => setValue(event.target.value)} /></Field>
      <Button type="submit">Save reminder days</Button>
    </form>
  );
}
