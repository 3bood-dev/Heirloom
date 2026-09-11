"use client";
import { useState } from "react";
import { encodeFunctionData, type Address } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { useAllowance } from "@/hooks/useAllowance";
import { hasAbi, HAS_ADDRESS } from "@/lib/abi/has";
import { GAS, HASHSCAN } from "@/lib/chain";
import { codeName, fmtHbar, hbarToTiny } from "@/lib/units";

export function AllowanceCard({ vault, owner, ownerBalance, isOwner }: { vault: Address; owner: Address; ownerBalance?: bigint; isOwner: boolean }) {
  const q = useAllowance(vault, owner);
  const { address } = useAccount();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const [hash, setHash] = useState<`0x${string}`>();
  const [amt, setAmt] = useState("");
  const rcpt = useWaitForTransactionReceipt({ hash });

  const covered = q.data && ownerBalance !== undefined ? (q.data.amount < ownerBalance ? q.data.amount : ownerBalance) : undefined;

  async function approve(tinybars: bigint) {
    if (!address) return;
    // HIP-906: the owner signs a call to the Hedera Account Service (0x16a) setting the allowance on their own account.
    const h = await sendTransactionAsync({ to: HAS_ADDRESS, data: encodeFunctionData({ abi: hasAbi, functionName: "hbarApprove", args: [address, vault, tinybars] }), gas: GAS.approve });
    setHash(h);
    setTimeout(() => q.refetch(), 4000);
  }

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="label">Live allowance</div>
          <div className="tnum mt-1 font-mono text-2xl">{q.data ? `${fmtHbar(q.data.amount)} ℏ` : "…"}</div>
          <div className="mt-1 text-xs text-muted">
            {q.data && q.data.code !== 22 ? <span className="text-red">{codeName(q.data.code)}</span> : "Read live from the Hedera Account Service, never cached."}
          </div>
        </div>
        <div className="text-right">
          <div className="label">Would transfer today</div>
          <div className="tnum mt-1 font-mono text-lg">{fmtHbar(covered)} ℏ</div>
          <div className="mt-1 text-xs text-dim">min(allowance, balance)</div>
        </div>
      </div>

      {isOwner && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-40">
              <div className="label mb-1">Change allowance (HBAR)</div>
              <input className="input" placeholder="e.g. 100" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </div>
            <button className="btn" disabled={isPending || !amt} onClick={() => approve(hbarToTiny(amt))}>Set</button>
            <button className="btn btn-danger" disabled={isPending} onClick={() => approve(0n)}>Revoke (set to 0)</button>
          </div>
          <p className="mt-3 text-xs text-muted">
            <span className="text-fg">This is the authoritative kill switch.</span> Revoking works at the ledger level, signed by your wallet alone. It does not need this contract to cooperate, or even to exist.
          </p>
          {hash && (
            <div className="mt-2 text-xs">
              {rcpt.isLoading ? "Confirming…" : rcpt.isSuccess ? <span className="text-accent">Allowance updated.</span> : rcpt.isError ? <span className="text-red">Failed.</span> : null}{" "}
              <a className="text-dim underline" href={`${HASHSCAN}/transaction/${hash}`} target="_blank" rel="noreferrer">view</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
