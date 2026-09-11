"use client";
import { useEffect, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { inheritanceVaultAbi } from "@/lib/abi/InheritanceVault";
import { GAS } from "@/lib/chain";

export function ImAliveButton({ vault, disabled, onDone }: { vault: Address; disabled?: boolean; onDone?: () => void }) {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (receipt.isSuccess) { setFlash(true); onDone?.(); const t = setTimeout(() => { setFlash(false); reset(); }, 2500); return () => clearTimeout(t); }
  }, [receipt.isSuccess, onDone, reset]);
  const busy = isPending || (!!hash && receipt.isLoading);
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        className={`btn btn-accent h-16 w-full max-w-sm text-lg font-semibold ${flash ? "ring-4 ring-accent/30" : ""}`}
        disabled={disabled || busy}
        onClick={() => writeContract({ address: vault, abi: inheritanceVaultAbi, functionName: "ping", gas: GAS.ping })}
      >
        {isPending ? "Confirm in wallet…" : busy ? "Resetting timer…" : flash ? "Timer reset" : "I am alive"}
      </button>
      <div className="h-4 text-xs text-muted">
        {error ? <span className="text-red">{(error as { shortMessage?: string }).shortMessage ?? error.message}</span> : "One tap. Resets the countdown and reschedules the heartbeat."}
      </div>
    </div>
  );
}
