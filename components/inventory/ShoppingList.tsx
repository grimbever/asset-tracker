"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button } from "@/components/ui";
import { shoppingListHref, type ShoppingStatus } from "@/lib/inventory/shopping";
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

export function ShoppingList({
  requests,
  status,
  canUpdate,
}: {
  requests: ShoppingRequest[];
  status: ShoppingStatus | null;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const open = requests.filter((request) => (status ? request.status === status : request.status === "open" || request.status === "ordered"));
  const chip = status === "open" ? "Not ordered" : status === "ordered" ? "On order" : null;

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
      {chip ? (
        <Link href={shoppingListHref()} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-ink px-3 text-sm text-paper">
          {chip}
          <span aria-hidden="true">×</span>
          <span className="sr-only">Remove shopping list filter</span>
        </Link>
      ) : null}
      {open.length === 0 ? <p className="text-sm text-muted">No requests match.</p> : null}
      <ul className="grid gap-3">
        {open.map((request) => (
          <li key={request.id} className="grid gap-2 rounded-3xl bg-card p-4">
            <p className="text-lg font-medium">{request.item_name ?? "Item"} · {request.quantity ?? 0}</p>
            <p className="text-sm text-muted">{request.requester_name ?? "Someone"} · {request.status}{request.notes ? ` · ${request.notes}` : ""}</p>
            {canUpdate ? <div className="flex flex-wrap gap-2">
              {ACTIONS.filter((action) => request.status === "open" || action.id !== "ordered").map((action) => (
                <Button key={action.id} type="button" variant="ghost" disabled={pending === request.id} onClick={() => void update(request.id, action.id)}>
                  {action.label}
                </Button>
              ))}
            </div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
