import { bands, fmtDuration } from "@/lib/units";

export function HeartbeatSchedule({ demo, remaining, currentInterval }: { demo: boolean; remaining: number; currentInterval?: number }) {
  const b = bands(demo);
  const active = b.findIndex((x) => remaining > x.above);
  const idx = active === -1 ? b.length - 1 : active;
  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between">
        <div className="label">Heartbeat schedule</div>
        <div className="text-xs text-muted">watches harder the closer it gets to acting</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {b.map((x, i) => (
          <div key={i} className={`rounded-lg border p-3 ${i === idx ? "border-accent/60 bg-accent/5" : "border-line"}`}>
            <div className="text-xs text-muted">{x.label}</div>
            <div className={`tnum mt-1 font-mono text-sm ${i === idx ? "text-fg" : "text-dim"}`}>{x.every}</div>
          </div>
        ))}
      </div>
      {currentInterval !== undefined && (
        <div className="mt-3 text-xs text-muted">
          Current interval: <span className="tnum font-mono text-fg">{fmtDuration(currentInterval)}</span>. Each wake-up is a HIP-1215 scheduled call the contract makes to itself. No keeper, no server.
        </div>
      )}
    </div>
  );
}
