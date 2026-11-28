export function takeQuantity(raw: string, onHand: number): { ok: true; quantity: number } | { ok: false; error: string } {
  const text = raw.trim();
  if (!/^[1-9]\d*$/.test(text)) return { ok: false, error: "Enter a whole number greater than zero." };
  const quantity = Number(text);
  if (quantity > onHand) return { ok: false, error: onHand === 1 ? "Only 1 on hand." : `Only ${onHand} on hand.` };
  return { ok: true, quantity };
}
