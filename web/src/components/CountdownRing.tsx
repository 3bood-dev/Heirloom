"use client";
import { splitCountdown } from "@/lib/units";

export function CountdownRing({ remaining, total, status, size = 280 }: { remaining: number; total: number; status: number; size?: number }) {
  const r = (size - 24) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const color = status >= 3 ? "var(--color-red)" : status === 2 ? "var(--color-red)" : status === 1 ? "var(--color-amber)" : "var(--color-accent)";
  const { big, unit, small } = splitCountdown(remaining);
  const label = status === 4 ? "released" : status === 5 ? "cancelled" : remaining <= 0 ? "deadline passed" : "until release";
  return (
    <div className="relative" style={{ width: size, height: size }} role="timer" aria-label={`${big} ${unit} ${label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={10} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          className={status === 2 ? "pulse" : ""}
          style={{ transition: "stroke-dashoffset .6s ease, stroke .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="tnum font-mono text-5xl font-semibold leading-none" style={{ color }}>{status >= 4 ? "—" : big}</div>
        <div className="mt-2 text-sm text-muted">{status >= 4 ? "" : unit}</div>
        {small && status < 4 && <div className="tnum mt-1 font-mono text-xs text-dim">{small}</div>}
        <div className="label mt-3">{label}</div>
      </div>
    </div>
  );
}
