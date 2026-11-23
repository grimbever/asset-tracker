import { assetStatusLabel } from "@/lib/assets/types";

const tones: Record<string, string> = {
  available: "bg-green-soft text-green",
  checked_out: "bg-ember-soft text-ember",
  in_repair: "bg-paper-deep text-gold",
  broken: "bg-danger-soft text-danger",
  missing: "bg-danger-soft text-danger",
  retired: "bg-paper-deep text-muted",
  disposed: "bg-paper-deep text-muted",
  destroyed: "bg-paper-deep text-muted",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${tones[status] ?? "bg-paper-deep"}`}>
      {label ?? assetStatusLabel(status)}
    </span>
  );
}
