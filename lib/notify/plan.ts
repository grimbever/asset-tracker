export function shouldEmail(input: {
  eventType: string;
  statusKey?: string | null;
  statusNotify?: boolean;
}): boolean {
  if (input.eventType === "checked_out" || input.eventType === "checked_in") return true;
  if (input.eventType !== "status_changed") return false;
  if (input.statusNotify) return true;
  return input.statusKey === "broken" || input.statusKey === "missing" || input.statusKey === "in_repair";
}

export function notificationRecipients(customEmails: readonly string[], adminEmails: readonly string[]): string[] {
  const source = customEmails.map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@"));
  const chosen = source.length > 0 ? source : adminEmails.map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@"));
  return [...new Set(chosen)];
}

export function notifySkipReason(apiKey: string | undefined, from: string | undefined, recipients: readonly string[]): string | null {
  if (!apiKey?.trim() || !from?.trim()) return "RESEND_API_KEY or NOTIFY_FROM is not set";
  if (recipients.length === 0) return "no recipients";
  return null;
}
