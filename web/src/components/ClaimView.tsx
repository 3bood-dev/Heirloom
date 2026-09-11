"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useVault } from "@/hooks/useVault";
import { useCountdown } from "@/hooks/useCountdown";
import { useAllowance } from "@/hooks/useAllowance";
import { inheritanceVaultAbi } from "@/lib/abi/InheritanceVault";
import { GAS, HASHSCAN } from "@/lib/chain";
import { fmtDuration, fmtHbar, shortAddr } from "@/lib/units";
import { CountdownRing } from "./CountdownRing";
import { StatusBadge } from "./StatusBadge";
import { NonCustodialBanner } from "./NonCustodialBanner";
import { ActivityLog } from "./ActivityLog";

export function ClaimView({ address }: { address: Address }) {
  const { address: me } = useAccount();
  const client = usePublicClient();
  const { vault: v, isLoading, error, refetch } = useVault(address);
  const remaining = useCountdown(v?.unlocksAt);
  const allowance = useAllowance(address, v?.owner);
  const w = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: w.data });
  const [preview, setPreview] = useState<"ok" | "alive" | "noallowance" | "error" | null>(null);
  useEffect(() => { if (rcpt.isSuccess) refetch(); }, [rcpt.isSuccess, refetch]);

  if (isLoading) return <div className="text-muted">Loading vault…</div>;
  if (error || !v) return <div className="text-red">Could not read vault at {address}.</div>;

  const isBeneficiary = !!me && me.toLowerCase() === v.beneficiary.toLowerCase();
  const covered = allowance.data && v.ownerBalance !== undefined ? (allowance.data.amount < v.ownerBalance ? allowance.data.amount : v.ownerBalance) : undefined;

  async function claim() {
    setPreview(null);
    // Simulate first: release() returns false (no revert) when fresh liveness is found, so show that honestly.
    try {
      const sim = await client!.simulateContract({ address, abi: inheritanceVaultAbi, functionName: "release", account: me });
      if (sim.result === false) { setPreview("alive"); return; }
    } catch (e) {
      const msg = String((e as { message?: string }).message ?? "");
      if (msg.includes("NoAllowance")) { setPreview("noallowance"); return; }
      setPreview("error");
      return;
    }
    w.writeContract({ address, abi: inheritanceVaultAbi, functionName: "release", gas: GAS.release });
  }

  return (
    <div className="space-y-6">
      <NonCustodialBanner ownerBalance={v.ownerBalance} vaultReserve={v.feeReserve} who="Owner's" />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="panel flex flex-col items-center gap-6 p-6">
          <div className="flex w-full items-center justify-between"><div className="label">Countdown</div><StatusBadge status={v.status} /></div>
          <CountdownRing remaining={remaining} total={v.timeout} status={v.status} />
        </section>
        <section className="space-y-4">
          <div className="panel p-5 text-sm">
            <div className="label">This vault</div>
            <p className="mt-2 text-muted">
              Set up by <a className="font-mono text-fg hover:underline" href={`${HASHSCAN}/account/${v.owner}`} target="_blank" rel="noreferrer">{shortAddr(v.owner)}</a> for{" "}
              <span className={`font-mono ${isBeneficiary ? "text-accent" : "text-fg"}`}>{shortAddr(v.beneficiary)}</span>{isBeneficiary && " (you)"}. Timeout {fmtDuration(v.timeout)}.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><div className="label">Currently covered</div><div className="tnum mt-1 font-mono text-2xl">{fmtHbar(covered)} ℏ</div><div className="text-xs text-dim">min(allowance {fmtHbar(allowance.data?.amount)}, balance {fmtHbar(v.ownerBalance)})</div></div>
              <div><div className="label">Unlocks</div><div className="mt-1 text-lg">{v.released ? "released" : v.cancelled ? "cancelled" : remaining > 0 ? `in ${fmtDuration(remaining)}` : "now"}</div><div className="text-xs text-dim">{new Date(v.unlocksAt * 1000).toLocaleString()}</div></div>
            </div>
          </div>

          {!v.released && !v.cancelled && (
            <div className="panel p-5">
              <button className="btn btn-accent h-14 w-full text-base" disabled={remaining > 0 || w.isPending || rcpt.isLoading} onClick={claim}>
                {remaining > 0 ? `Claim available in ${fmtDuration(remaining)}` : w.isPending ? "Confirm in wallet…" : rcpt.isLoading ? "Releasing…" : "Claim inheritance"}
              </button>
              <p className="mt-2 text-xs text-muted">Anyone may trigger the release; the funds can only go to the beneficiary. The contract re-checks the owner&apos;s activity first.</p>
              {preview === "alive" && (
                <div className="mt-3 rounded-lg border border-amber/40 bg-amber/5 p-3 text-sm text-amber">
                  Activity was detected on this account. The owner appears to be active, so the timer has been reset. This is the system working correctly.
                </div>
              )}
              {preview === "noallowance" && <div className="mt-3 rounded-lg border border-line p-3 text-sm text-muted">The owner has revoked the allowance, or the account is empty. Nothing can be released.</div>}
              {preview === "error" && <div className="mt-3 text-sm text-red">The release simulation failed. Check the activity log.</div>}
              {w.error && <p className="mt-2 text-xs text-red">{(w.error as { shortMessage?: string }).shortMessage ?? w.error.message}</p>}
              {rcpt.isSuccess && <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm text-accent">Released. Check your balance; the vault&apos;s did not change.</div>}
            </div>
          )}
          {v.released && <div className="panel p-5 text-sm text-muted">This vault has released. The transfer went directly from the owner&apos;s account to the beneficiary.</div>}
        </section>
      </div>
      <ActivityLog vault={address} timeout={v.timeout} />
    </div>
  );
}
