export const DEFAULT_WARRANTY_REMINDER_DAYS = [30, 7] as const;

export function warrantyReminderDay(end: string | null, today: string, days: readonly number[], alreadySent: readonly number[] = []): number | null {
  if (!end) return null;
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(endMs) || Number.isNaN(todayMs)) return null;
  const whole = Math.round((endMs - todayMs) / 86_400_000);
  if (!days.includes(whole) || alreadySent.includes(whole)) return null;
  return whole;
}

export function warrantyExpiringSoon(end: string | null, today: string, withinDays = 30): boolean {
  if (!end) return false;
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(endMs) || Number.isNaN(todayMs)) return false;
  const whole = Math.round((endMs - todayMs) / 86_400_000);
  return whole <= withinDays;
}
