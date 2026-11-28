"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button } from "@/components/ui";
import { messageFrom } from "@/lib/data/errors";
import { newId } from "@/lib/ids";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export type ShoppingRequest = {
  id: string;
  item_name: string | null;
  quantity: number | null;
  notes: string | null;
  status: string;
  requester_name: string | null;
  created_at: string;
};

const ACTIONS = [
  { id: "ordered", label: "Mark ordered" },
  { id: "fulfilled", label: "Mark received" },
  { id: "closed", label: "Dismiss" },
] as const;

export function ShoppingList({ requests }: { requests: ShoppingRequest[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const open = requests.filter((request) => request.status === "open" || request.status === "ordered");

  async function update(id: string, status: string) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("update_supply_request", {
      p_id: id,
      p_event_id: newId(),
      p_status: status,
    });
    setPending(null);
    if (rpcError) {
      setError(messageFrom(rpcError));
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {open.length === 0 ? <p className="text-sm text-muted">No open requests.</p> : null}
      <ul className="grid gap-3">
        {open.map((request) => (
          <li key={request.id} className="grid gap-2 rounded-3xl bg-card p-4">
            <p className="text-lg font-medium">{request.item_name ?? "Item"} · {request.quantity ?? 0}</p>
            <p className="text-sm text-muted">{request.requester_name ?? "Someone"} · {request.status}{request.notes ? ` · ${request.notes}` : ""}</p>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.filter((action) => request.status === "open" || action.id !== "ordered").map((action) => (
                <Button key={action.id} type="button" variant="ghost" disabled={pending === request.id} onClick={() => void update(request.id, action.id)}>
                  {action.label}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
