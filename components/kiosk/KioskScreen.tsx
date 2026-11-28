"use client";

import { useEffect, useState } from "react";
import { Banner, Button } from "@/components/ui";
import type { Consumable } from "@/lib/inventory/data";
import type { AssetRecord } from "@/lib/assets/types";
import { checkoutAsset } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { newId } from "@/lib/ids";
import { deliverLowStockAlert } from "@/app/notify/low-stock";
import { deliverSupplyRequestAlert } from "@/app/notify/supply-request";
import { takeQuantity } from "@/lib/kiosk/take";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const IDLE_MS = 60_000;

export function KioskScreen({
  people,
  items,
  assets,
  canSetPin,
  canRequest,
  canCreateItem,
  organizationId,
}: {
  people: { id: string; name: string; hasPin: boolean }[];
  items: Consumable[];
  assets: AssetRecord[];
  canSetPin: boolean;
  canRequest: boolean;
  canCreateItem: boolean;
  organizationId: string;
}) {
  const [stockItems, setStockItems] = useState(items);
  const [toolItems, setToolItems] = useState(assets);
  const [personId, setPersonId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<"stock" | "tools" | "request">("stock");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [requestName, setRequestName] = useState("");
  const [requestQty, setRequestQty] = useState("1");
  const [requestNote, setRequestNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pinTarget, setPinTarget] = useState(people[0]?.id ?? "");
  const [newPin, setNewPin] = useState("");
  const person = people.find((entry) => entry.id === personId);

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setTimeout(() => {
      setSessionId(null);
      setPersonId(null);
      setPin("");
      setMessage(null);
    }, IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [sessionId, query, message]);

  function reset() {
    setSessionId(null);
    setPersonId(null);
    setPin("");
    setError(null);
    setMessage(null);
    setQuery("");
  }

  async function start() {
    const supabase = getBrowserSupabase();
    if (!supabase || !personId) return;
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("start_kiosk_session", { p_employee_id: personId, p_pin: pin });
    if (rpcError) {
      setError(messageFrom(rpcError));
      setPin("");
      return;
    }
    setSessionId(String(data));
    setPin("");
  }

  async function take(item: Consumable, rawQuantity: string) {
    const parsed = takeQuantity(rawQuantity, item.quantity_on_hand);
    if (!parsed.ok) {
      setError(parsed.error);
      setMessage(null);
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase || !sessionId) return;
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("kiosk_take", {
      p_session: sessionId,
      p_event_id: newId(),
      p_consumable_id: item.id,
      p_quantity: parsed.quantity,
    });
    if (rpcError) {
      setError(messageFrom(rpcError));
      return;
    }
    const result = (data ?? {}) as { crossed?: boolean; name?: string; organization_id?: string; quantity?: number };
    const nextQuantity = Number(result.quantity ?? item.quantity_on_hand - parsed.quantity);
    setStockItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, quantity_on_hand: nextQuantity } : entry)));
    setAmounts((current) => ({ ...current, [item.id]: "" }));
    if (result.crossed && result.organization_id) {
      await deliverLowStockAlert({ organizationId: result.organization_id, name: result.name ?? item.name });
    }
    setMessage(`Took ${parsed.quantity} ${item.name}. ${nextQuantity} left.`);
  }

  async function checkOut(asset: AssetRecord) {
    const supabase = getBrowserSupabase();
    if (!supabase || !personId) return;
    setError(null);
    try {
      await checkoutAsset(supabase, asset, [], { employeeId: personId, locationId: null, dueOn: null });
      setToolItems((current) => current.map((entry) => (entry.id === asset.id ? { ...entry, status: "checked_out" } : entry)));
      setMessage(`Checked out ${asset.name}.`);
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  async function savePin() {
    const supabase = getBrowserSupabase();
    if (!supabase || !pinTarget) return;
    const { error: rpcError } = await supabase.rpc("set_kiosk_pin", { p_employee_id: pinTarget, p_pin: newPin });
    if (rpcError) {
      setError(messageFrom(rpcError));
      return;
    }
    setNewPin("");
    setMessage("PIN saved.");
  }

  async function sendRequest() {
    const parsed = takeQuantity(requestQty, Number.MAX_SAFE_INTEGER);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase || !sessionId) return;
    setError(null);
    const id = newId();
    const { error: rpcError } = await supabase.rpc("submit_supply_request", {
      p_id: id,
      p_event_id: newId(),
      p_session: sessionId,
      p_name: requestName,
      p_quantity: parsed.quantity,
      p_note: requestNote,
      p_photo_path: "",
    });
    if (rpcError) {
      setError(messageFrom(rpcError));
      return;
    }
    await deliverSupplyRequestAlert({ organizationId, name: requestName, quantity: parsed.quantity, who: person?.name ?? "" });
    setRequestName("");
    setRequestQty("1");
    setRequestNote("");
    setMessage("Added to the shopping list.");
  }

  async function createItem() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    if (!requestName.trim()) {
      setError("Enter the item name.");
      return;
    }
    setError(null);
    const { error: rpcError } = await supabase.rpc("create_kiosk_item", {
      p_id: newId(),
      p_event_id: newId(),
      p_organization_id: organizationId,
      p_name: requestName.trim(),
      p_note: requestNote,
    });
    if (rpcError) {
      setError(messageFrom(rpcError));
      return;
    }
    setRequestName("");
    setRequestNote("");
    setMessage("Item added to inventory. Refresh the kiosk to take it.");
  }

  const needle = query.trim().toLowerCase();
  const stock = stockItems.filter((item) => !item.archived_at && item.active && (!needle || item.name.toLowerCase().includes(needle) || item.bin_code?.toLowerCase() === needle || item.sku?.toLowerCase() === needle));
  const tools = toolItems.filter((asset) => !asset.archived_at && asset.status === "available" && (!needle || asset.name.toLowerCase().includes(needle) || asset.tag_id.toLowerCase() === needle));

  if (!sessionId) {
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-4xl">Who are you?</h1>
        <p className="text-sm text-muted">Pick your name, then enter the 4-digit PIN set for you. The screen returns here after a minute of quiet.</p>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {message ? <Banner tone="ok">{message}</Banner> : null}
        <div className="grid grid-cols-2 gap-3">
          {people.filter((entry) => entry.hasPin).map((entry) => (
            <button key={entry.id} type="button" className={`min-h-20 rounded-3xl px-4 text-left text-lg ${personId === entry.id ? "bg-ink text-paper" : "bg-card"}`} onClick={() => { setPersonId(entry.id); setPin(""); }}>{entry.name}</button>
          ))}
        </div>
        {people.every((entry) => !entry.hasPin) ? <p className="text-sm text-muted">No PINs yet. Someone who can manage the kiosk needs to set one.</p> : null}
        {personId ? (
          <div className="grid gap-3">
            <p className="font-serif text-3xl tracking-[0.4em]">{pin.padEnd(4, "·")}</p>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "ok"].map((key) => (
                <button key={key} type="button" className="min-h-16 rounded-2xl bg-card text-2xl" onClick={() => {
                  if (key === "clear") setPin("");
                  else if (key === "ok") void start();
                  else if (pin.length < 4) setPin((current) => current + key);
                }}>{key === "ok" ? "Go" : key === "clear" ? "Clear" : key}</button>
              ))}
            </div>
          </div>
        ) : null}
        {canSetPin ? (
          <section className="grid gap-2 rounded-3xl bg-card p-4">
            <h2 className="font-serif text-2xl">Set a PIN</h2>
            <select value={pinTarget} onChange={(event) => setPinTarget(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-paper px-3">
              {people.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
            <input value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="4 digits" className="min-h-12 rounded-2xl border border-line bg-paper px-3" aria-label="New PIN" />
            <Button type="button" onClick={() => void savePin()}>Save PIN</Button>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-4xl">{person?.name}</h1>
        <Button type="button" variant="ghost" onClick={reset}>Start over</Button>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}
      <div className="flex gap-2">
        <button type="button" className={`min-h-12 flex-1 rounded-full ${mode === "stock" ? "bg-ink text-paper" : "bg-card"}`} onClick={() => setMode("stock")}>Supplies</button>
        <button type="button" className={`min-h-12 flex-1 rounded-full ${mode === "tools" ? "bg-ink text-paper" : "bg-card"}`} onClick={() => setMode("tools")}>Tools</button>
        {canRequest ? <button type="button" className={`min-h-12 flex-1 rounded-full ${mode === "request" ? "bg-ink text-paper" : "bg-card"}`} onClick={() => setMode("request")}>Request</button> : null}
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search or scan a code" className="min-h-14 rounded-2xl border border-line bg-card px-4 text-lg" aria-label="Find an item" />
      <ul className="grid gap-3">
        {(mode === "stock" ? stock : []).map((item) => (
          <li key={item.id}>
            <div className="grid gap-2 rounded-3xl bg-card px-4 py-3">
              <span className="text-lg">{item.name}<span className="mt-1 block text-sm text-muted">{item.quantity_on_hand} on hand</span></span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="min-h-12 rounded-full bg-ink px-4 text-paper" onClick={() => void take(item, "1")}>Take 1</button>
                <input
                  value={amounts[item.id] ?? ""}
                  onChange={(event) => setAmounts((current) => ({ ...current, [item.id]: event.target.value.replace(/\D/g, "") }))}
                  inputMode="numeric"
                  aria-label={`Quantity of ${item.name}`}
                  placeholder="Qty"
                  className="min-h-12 w-24 rounded-2xl border border-line bg-paper px-3"
                />
                <button type="button" className="min-h-12 rounded-full bg-card px-4" onClick={() => void take(item, amounts[item.id] ?? "")}>Take</button>
              </div>
            </div>
          </li>
        ))}
        {(mode === "tools" ? tools : []).map((asset) => (
          <li key={asset.id}>
            <button type="button" className="flex min-h-20 w-full items-center justify-between rounded-3xl bg-card px-4 text-left text-lg" onClick={() => void checkOut(asset)}>
              <span>{asset.name}<span className="mt-1 block text-sm text-muted">{asset.tag_id}</span></span>
              <span>Check out</span>
            </button>
          </li>
        ))}
      </ul>
      {mode === "request" && canRequest ? (
        <form className="grid gap-3 rounded-3xl bg-card p-4" onSubmit={(event) => { event.preventDefault(); void sendRequest(); }}>
          <h2 className="font-serif text-2xl">Shopping list</h2>
          <input value={requestName} onChange={(event) => setRequestName(event.target.value)} placeholder="Item name" aria-label="Item name" className="min-h-12 rounded-2xl border border-line bg-paper px-3" />
          <input value={requestQty} onChange={(event) => setRequestQty(event.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Quantity wanted" placeholder="Quantity" className="min-h-12 rounded-2xl border border-line bg-paper px-3" />
          <input value={requestNote} onChange={(event) => setRequestNote(event.target.value)} placeholder="Note, optional" aria-label="Note" className="min-h-12 rounded-2xl border border-line bg-paper px-3" />
          <Button type="submit">Add to shopping list</Button>
          {canCreateItem ? <Button type="button" variant="ghost" onClick={() => void createItem()}>Create this item in inventory</Button> : null}
        </form>
      ) : null}
    </div>
  );
}
