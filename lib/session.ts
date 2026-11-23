export function chooseOrganization(orgIds: readonly string[], cookieValue: string | undefined): string | null {
  if (orgIds.length === 0) return null;
  if (cookieValue && orgIds.includes(cookieValue)) return cookieValue;
  return orgIds[0] ?? null;
}
