import { STATUS } from "@/lib/units";

const styles: Record<string, string> = {
  Active: "text-accent border-accent/40",
  Warning: "text-amber border-amber/40",
  Critical: "text-red border-red/40",
  Releasable: "text-red border-red/60 bg-red/10",
  Released: "text-muted border-line",
  Cancelled: "text-muted border-line",
};

export function StatusBadge({ status }: { status: number }) {
  const name = STATUS[status] ?? "Unknown";
  return <span className={`rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider ${styles[name] ?? ""}`}>{name}</span>;
}
