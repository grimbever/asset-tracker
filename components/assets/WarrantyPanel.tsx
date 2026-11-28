"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import type { AssetRecord } from "@/lib/assets/types";
import { messageFrom } from "@/lib/data/errors";
import { newId } from "@/lib/ids";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function WarrantyPanel({ asset, canEdit }: { asset: AssetRecord; canEdit: boolean }) {
  const router = useRouter();
  const [start, setStart] = useState(asset.warranty_start ?? "");
  const [end, setEnd] = useState(asset.warranty_end ?? "");
  const [provider, setProvider] = useState(asset.warranty_provider ?? "");
  const [notes, setNotes] = useState(asset.warranty_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("save_asset_warranty", {
      p_asset_id: asset.id,
      p_event_id: newId(),
      p_start: start || null,
      p_end: end || null,
      p_provider: provider,
      p_notes: notes,
    });
    setPending(false);
    if (rpcError) {
      setError(messageFrom(rpcError));
      return;
    }
    router.refresh();
  }

  return (
    <section className="mt-6 grid gap-3 rounded-3xl bg-card p-4">
      <h2 className="font-serif text-2xl">Warranty</h2>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {asset.warranty_end ? <p className="text-sm">Ends {asset.warranty_end}{asset.warranty_provider ? ` · ${asset.warranty_provider}` : ""}</p> : <p className="text-sm text-muted">No warranty date yet.</p>}
      {canEdit ? (
        <form className="grid gap-3" onSubmit={(event) => void save(event)}>
          <Field label="Start"><TextInput type="date" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
          <Field label="End"><TextInput type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
          <Field label="Provider"><TextInput value={provider} onChange={(event) => setProvider(event.target.value)} /></Field>
          <Field label="Notes"><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          <Button type="submit" disabled={pending}>Save warranty</Button>
        </form>
      ) : null}
    </section>
  );
}
