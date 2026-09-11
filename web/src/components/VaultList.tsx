"use client";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useVaultsFor } from "@/hooks/useVaultsFor";

export function VaultList({ mode }: { mode: "owner" | "beneficiary" }) {
  const { address, isConnected } = useAccount();
  const { asOwner, asBeneficiary, isLoading } = useVaultsFor(address);
  const list = mode === "owner" ? asOwner : asBeneficiary;
  if (!isConnected) return <div className="panel p-8 text-center text-muted">Connect your wallet to see {mode === "owner" ? "your vaults" : "vaults naming you as beneficiary"}.</div>;
  if (isLoading) return <div className="text-muted">Looking up the factory index…</div>;
  if (list.length === 0)
    return (
      <div className="panel p-8 text-center text-muted">
        {mode === "owner" ? <>No vaults yet. <Link href="/setup" className="text-accent underline">Set one up.</Link></> : "No vault names this wallet as beneficiary."}
      </div>
    );
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {list.map((v) => (
        <li key={v}>
          <Link href={mode === "owner" ? `/vault/${v}` : `/claim/${v}`} className="panel block p-4 font-mono text-sm hover:border-muted">{v}</Link>
        </li>
      ))}
    </ul>
  );
}
