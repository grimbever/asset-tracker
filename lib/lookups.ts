export type StatusCard = {
  key: string;
  label: string;
  count: number;
  needsAttention: boolean;
};

export function statusCards(
  statuses: readonly { key: string; label: string; position: number; needsAttention?: boolean; archivedAt?: string | null }[],
  assets: readonly { status: string; archivedAt?: string | null }[],
): StatusCard[] {
  return [...statuses]
    .filter((status) => !status.archivedAt)
    .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
    .map((status) => ({
      key: status.key,
      label: status.label,
      count: assets.filter((asset) => {
        if (asset.status !== status.key) return false;
        if (!asset.archivedAt) return true;
        return status.key === "disposed" || status.key === "destroyed";
      }).length,
      needsAttention: Boolean(status.needsAttention),
    }));
}
