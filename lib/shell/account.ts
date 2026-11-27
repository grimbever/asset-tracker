export function accountLabel(displayName: string, email: string): string {
  const name = displayName.trim();
  const address = email.trim();
  if (name && name.toLowerCase() !== address.toLowerCase()) return name;
  return address || name || "You";
}

export function accountDetail(displayName: string, email: string): string | null {
  const name = displayName.trim();
  const address = email.trim();
  if (!address || name.toLowerCase() === address.toLowerCase()) return null;
  return address;
}
