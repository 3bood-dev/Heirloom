"use client";
import { useBalance, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { inheritanceVaultAbi } from "@/lib/abi/InheritanceVault";
import { DEMO } from "@/lib/chain";
import { weiToTiny } from "@/lib/units";

export function useVault(address: Address) {
  const c = { address, abi: inheritanceVaultAbi } as const;
  const q = useReadContracts({
    contracts: [
      { ...c, functionName: "owner" },
      { ...c, functionName: "beneficiary" },
      { ...c, functionName: "timeout" },
      { ...c, functionName: "lastActiveTimestamp" },
      { ...c, functionName: "lastKnownBalance" },
      { ...c, functionName: "pendingSchedule" },
      { ...c, functionName: "scheduledFor" },
      { ...c, functionName: "released" },
      { ...c, functionName: "cancelled" },
      { ...c, functionName: "status" },
      { ...c, functionName: "currentInterval" },
      { ...c, functionName: "feeReserve" },
      { ...c, functionName: "demoMode" },
      { ...c, functionName: "unlocksAt" },
      { ...c, functionName: "isReleasable" },
    ],
    query: { refetchInterval: DEMO ? 3000 : 15000 },
  });
  const r = q.data;
  const owner = r?.[0]?.result as Address | undefined;
  const ownerBal = useBalance({ address: owner, query: { enabled: !!owner, refetchInterval: DEMO ? 3000 : 15000 } });

  const v = r && r.every((x) => x.status === "success")
    ? {
        owner: owner!,
        beneficiary: r[1].result as Address,
        timeout: Number(r[2].result as bigint),
        lastActiveTimestamp: Number(r[3].result as bigint),
        lastKnownBalance: r[4].result as bigint, // tinybars
        pendingSchedule: r[5].result as Address,
        scheduledFor: Number(r[6].result as bigint),
        released: r[7].result as boolean,
        cancelled: r[8].result as boolean,
        status: Number(r[9].result),
        currentInterval: Number(r[10].result as bigint),
        feeReserve: r[11].result as bigint, // tinybars
        demoMode: r[12].result as boolean,
        unlocksAt: Number(r[13].result as bigint),
        isReleasable: r[14].result as boolean,
        ownerBalance: ownerBal.data ? weiToTiny(ownerBal.data.value) : undefined, // tinybars
      }
    : undefined;

  return { vault: v, isLoading: q.isLoading, error: q.error ?? undefined, refetch: () => { q.refetch(); ownerBal.refetch(); } };
}
export type VaultState = NonNullable<ReturnType<typeof useVault>["vault"]>;
