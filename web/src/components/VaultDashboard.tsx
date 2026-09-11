"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useVault } from "@/hooks/useVault";
import { useCountdown } from "@/hooks/useCountdown";
import { inheritanceVaultAbi } from "@/lib/abi/InheritanceVault";
import { GAS, HASHSCAN } from "@/lib/chain";
import { HBAR_PER_HEARTBEAT, fmtDuration, fmtHbar, shortAddr } from "@/lib/units";
import { CountdownRing } from "./CountdownRing";
import { ImAliveButton } from "./ImAliveButton";
import { StatusBadge } from "./StatusBadge";
import { NonCustodialBanner } from "./NonCustodialBanner";
import { AllowanceCard } from "./AllowanceCard";
import { HeartbeatSchedule } from "./HeartbeatSchedule";
import { ActivityLog } from "./ActivityLog";

export function VaultDashboard({ address }: { address: Address }) {
  const { address: me } = useAccount();
  const { vault: v, isLoading, error, refetch } = useVault(address);
  const remaining = useCountdown(v?.unlocksAt);
  const nextIn = v ? Math.max(0, v.scheduledFor - Date.now() / 1000) : 0;
  const isOwner = !!me && !!v && me.toLowerCase() === v.owner.toLowerCase();

  if (isLoading) return <div className="text-muted">Loading vault…</div>;
  if (error || !v) return <div className="text-red">Could not read vault at {address}. {error?.message}</div>;

  const runwayBeats = Number(v.feeReserve) / 1e8 / HBAR_PER_HEARTBEAT;

  return (
    <div className="space-y-6">
      <NonCustodialBanner ownerBalance={v.ownerBalance} vaultReserve={v.feeReserve} who={isOwner ? "Your" : "Owner's"} />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="panel flex flex-col items-center gap-6 p-6">
          <div className="flex w-full items-center justify-between">
            <div className="label">Countdown</div>
            <StatusBadge status={v.status} />
          </div>
          <CountdownRing remaining={remaining} total={v.timeout} status={v.status} />
          {isOwner && !v.released && !v.cancelled && <ImAliveButton vault={address} onDone={refetch} />}
          {!isOwner && <div className="text-center text-xs text-muted">Only the owner can ping. Anyone can run a check with <code className="font-mono">poke()</code>.</div>}
          {!v.released && !v.cancelled && (v.pendingSchedule === "0x0000000000000000000000000000000000000000" || v.scheduledFor + 30 < Date.now() / 1000) && (
            <PokeButton vault={address} onDone={refetch} />
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Stat label="Heartbeat interval" value={fmtDuration(v.currentInterval)} sub="tightens as the deadline nears" />
          <Stat label="Next wake-up" value={v.pendingSchedule === "0x0000000000000000000000000000000000000000" ? "none scheduled" : `in ${fmtDuration(nextIn)}`}
            sub={v.pendingSchedule === "0x0000000000000000000000000000000000000000" ? "chain idle; poke() restarts it" : `schedule ${shortAddr(v.pendingSchedule)}`} tone={v.pendingSchedule === "0x0000000000000000000000000000000000000000" && !v.released && !v.cancelled ? "amber" : undefined} />
          <Stat label="Owner balance vs snapshot" value={`${fmtHbar(v.ownerBalance)} / ${fmtHbar(v.lastKnownBalance)} ℏ`}
            sub={v.ownerBalance !== undefined && v.ownerBalance < v.lastKnownBalance ? "decrease since last check: next heartbeat resets the timer" : "no decrease since last check"}
            tone={v.ownerBalance !== undefined && v.ownerBalance < v.lastKnownBalance ? "accent" : undefined} />
          <Stat label="Fee reserve" value={`${fmtHbar(v.feeReserve)} ℏ`} sub={`≈ ${Math.floor(runwayBeats)} wake-ups of runway`} tone={runwayBeats < 5 ? "amber" : undefined} />
          <div className="sm:col-span-2"><AllowanceCard vault={address} owner={v.owner} ownerBalance={v.ownerBalance} isOwner={isOwner} /></div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HeartbeatSchedule demo={v.demoMode} remaining={remaining} currentInterval={v.currentInterval} />
        <ActivityLog vault={address} timeout={v.timeout} />
      </div>

      <section className="panel p-5 text-sm">
        <div className="label">Details</div>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <KV k="Vault" v={address} link={`${HASHSCAN}/contract/${address}`} />
          <KV k="Owner" v={v.owner} link={`${HASHSCAN}/account/${v.owner}`} />
          <KV k="Beneficiary" v={v.beneficiary} link={`${HASHSCAN}/account/${v.beneficiary}`} />
          <KV k="Timeout" v={fmtDuration(v.timeout)} />
          <KV k="Last activity" v={new Date(v.lastActiveTimestamp * 1000).toLocaleString()} />
          <KV k="Unlocks at" v={new Date(v.unlocksAt * 1000).toLocaleString()} />
        </dl>
      </section>

      {isOwner && !v.released && !v.cancelled && <DangerZone vault={address} beneficiary={v.beneficiary} demo={v.demoMode} onDone={refetch} />}
    </div>
  );
}

function PokeButton({ vault, onDone }: { vault: Address; onDone: () => void }) {
  const w = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: w.data });
  useEffect(() => { if (rcpt.isSuccess) onDone(); }, [rcpt.isSuccess, onDone]);
  return (
    <div className="w-full rounded-lg border border-amber/40 bg-amber/5 p-3 text-center text-xs">
      <div className="text-amber">The heartbeat chain is idle (reserve ran dry, or a busy second). Anyone can restart it.</div>
      <button className="btn mt-2 w-full" disabled={w.isPending || rcpt.isLoading} onClick={() => w.writeContract({ address: vault, abi: inheritanceVaultAbi, functionName: "poke", gas: GAS.poke })}>
        {w.isPending ? "Confirm in wallet…" : rcpt.isLoading ? "Restarting…" : "Restart heartbeat (poke)"}
      </button>
      <div className="mt-1 text-dim">Not from the owner wallet during a demo: an owner-signed transaction is itself proof of life.</div>
      {w.error && <div className="mt-1 text-red">{(w.error as { shortMessage?: string }).shortMessage ?? w.error.message}</div>}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "accent" | "amber" }) {
  return (
    <div className="panel p-5">
      <div className="label">{label}</div>
      <div className={`tnum mt-1 font-mono text-xl ${tone === "amber" ? "text-amber" : tone === "accent" ? "text-accent" : ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
function KV({ k, v, link }: { k: string; v: string; link?: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="truncate font-mono text-xs">{link ? <a className="hover:underline" href={link} target="_blank" rel="noreferrer">{v}</a> : v}</dd></div>;
}

function DangerZone({ vault, beneficiary, demo, onDone }: { vault: Address; beneficiary: Address; demo: boolean; onDone: () => void }) {
  const w = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: w.data });
  const [nb, setNb] = useState("");
  const [nt, setNt] = useState("");
  const busy = w.isPending || rcpt.isLoading;
  if (rcpt.isSuccess) { setTimeout(onDone, 0); }
  return (
    <section className="panel border-red/30 p-5">
      <div className="label text-red">Danger zone</div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <div className="label mb-1">Change beneficiary</div>
          <div className="flex gap-2"><input className="input" placeholder={shortAddr(beneficiary)} value={nb} onChange={(e) => setNb(e.target.value.trim())} />
            <button className="btn" disabled={busy || !isAddress(nb)} onClick={() => w.writeContract({ address: vault, abi: inheritanceVaultAbi, functionName: "setBeneficiary", args: [nb as Address], gas: GAS.setBeneficiary })}>Set</button></div>
        </div>
        <div>
          <div className="label mb-1">Change timeout ({demo ? "seconds" : "days"})</div>
          <div className="flex gap-2"><input className="input" inputMode="numeric" value={nt} onChange={(e) => setNt(e.target.value)} />
            <button className="btn" disabled={busy || !(Number(nt) > 0)} onClick={() => w.writeContract({ address: vault, abi: inheritanceVaultAbi, functionName: "setTimeout", args: [BigInt(demo ? Number(nt) : Number(nt) * 86400)], gas: GAS.setTimeout })}>Set</button></div>
        </div>
        <div>
          <div className="label mb-1">Cancel vault</div>
          <button className="btn btn-danger w-full" disabled={busy} onClick={() => confirm("Cancel this vault and refund the fee reserve? The allowance you granted stays until you revoke it above.") && w.writeContract({ address: vault, abi: inheritanceVaultAbi, functionName: "cancel", gas: GAS.cancel })}>Cancel and refund reserve</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Cancelling is a convenience. The authoritative kill switch is revoking the allowance in the card above: that works even if this contract is broken or we are gone.</p>
      {w.error && <p className="mt-2 text-xs text-red">{(w.error as { shortMessage?: string }).shortMessage ?? w.error.message}</p>}
    </section>
  );
}
