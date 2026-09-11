"use client";
import type { Address } from "viem";
import { useMirrorEvents } from "@/hooks/useMirrorEvents";
import type { VaultEvent } from "@/lib/mirror";
import { HASHSCAN } from "@/lib/chain";
import { codeName, fmtDuration, fmtHbar, shortAddr } from "@/lib/units";

function describe(e: VaultEvent, timeout: number): { text: string; tone: "accent" | "muted" | "amber" | "red" } | null {
  const a = e.args as Record<string, bigint | string | boolean>;
  switch (e.name) {
    case "LivenessDetected":
      return { tone: "accent", text: `Activity detected on the owner's account (balance ${fmtHbar(a.previousBalance as bigint)} → ${fmtHbar(a.newBalance as bigint)} ℏ). Timer reset to ${fmtDuration(timeout)}.` };
    case "Pinged":
      return { tone: "accent", text: `Owner tapped "I am alive". Timer reset to ${fmtDuration(timeout)}.` };
    case "HeartbeatExecuted":
      return { tone: "muted", text: `Heartbeat ran on its own${a.livenessFound ? " and found activity" : ", no activity found"}.` };
    case "HeartbeatScheduled":
      return { tone: "muted", text: `Next wake-up scheduled in ${fmtDuration(Number(a.interval))}.` };
    case "HeartbeatSchedulingFailed":
      return { tone: "amber", text: `Could not schedule a wake-up (${codeName(a.responseCode as bigint)}). Anyone can call poke() to restart the chain.` };
    case "ReleaseAborted":
      return { tone: "amber", text: `Release attempt aborted: ${a.reason}. This is the system working correctly.` };
    case "Released":
      return { tone: "red", text: `Released ${fmtHbar(a.amountTinybars as bigint)} ℏ to ${shortAddr(a.beneficiary as string)}, directly from the owner's account.` };
    case "VaultCreated":
      return { tone: "muted", text: `Vault created. Timeout ${fmtDuration(Number(a.timeout))}.` };
    case "BeneficiaryChanged":
      return { tone: "muted", text: `Beneficiary changed to ${shortAddr(a.next as string)}.` };
    case "TimeoutChanged":
      return { tone: "muted", text: `Timeout changed to ${fmtDuration(Number(a.next))}.` };
    case "Cancelled":
      return { tone: "red", text: "Vault cancelled by the owner. Fee reserve refunded." };
    case "FeeReserveFunded":
      return { tone: "muted", text: `Fee reserve funded with ${fmtHbar(a.amount as bigint)} ℏ.` };
    case "FeeReserveWithdrawn":
      return { tone: "muted", text: `Fee reserve withdrawal of ${fmtHbar(a.amount as bigint)} ℏ.` };
    default:
      return null; // SnapshotResynced is noise
  }
}
const toneClass = { accent: "text-accent", muted: "text-muted", amber: "text-amber", red: "text-red" };

export function ActivityLog({ vault, timeout }: { vault: Address; timeout: number }) {
  const q = useMirrorEvents(vault);
  const items = (q.data ?? []).map((e) => ({ e, d: describe(e, timeout) })).filter((x) => x.d);
  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between">
        <div className="label">Activity</div>
        <div className="text-xs text-dim">from the mirror node · {q.data?.length ?? 0} events</div>
      </div>
      <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1 text-sm">
        {q.isLoading && <li className="text-dim">Loading…</li>}
        {!q.isLoading && items.length === 0 && <li className="text-dim">No events yet.</li>}
        {items.map(({ e, d }, i) => (
          <li key={`${e.tx}-${i}`} className="flex gap-3">
            <a href={`${HASHSCAN}/transaction/${e.tx}`} target="_blank" rel="noreferrer" className="tnum shrink-0 font-mono text-xs text-dim hover:text-muted">
              {new Date(e.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </a>
            <span className={toneClass[d!.tone]}>{d!.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
