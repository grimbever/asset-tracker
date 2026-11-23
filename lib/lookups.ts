export type StatusCard = {
  key: string;
  label: string;
  count: number;
  needsAttention: boolean;
};

export function statusCards(
  statuses: readonly { key: string; label: string; position: number; needsAttention?: boolean; archivedAt?: string | null }[],
  assets: readonly { status: string }[],
): StatusCard[] {
  return [...statuses]
    .filter((status) => !status.archivedAt)
    .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
    .map((status) => ({
      key: status.key,
      label: status.label,
      count: assets.filter((asset) => asset.status === status.key).length,
      needsAttention: Boolean(status.needsAttention),
    }));
}
