"use client";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { vaultFactoryAbi } from "@/lib/abi/VaultFactory";
import { FACTORY } from "@/lib/chain";

export function useVaultsFor(account?: Address) {
  const q = useReadContracts({
    contracts: [
      { address: FACTORY, abi: vaultFactoryAbi, functionName: "vaultsByOwner", args: [account!] },
      { address: FACTORY, abi: vaultFactoryAbi, functionName: "vaultsByBeneficiary", args: [account!] },
    ],
    query: { enabled: !!account, refetchInterval: 10000 },
  });
  return {
    asOwner: (q.data?.[0]?.result as readonly Address[] | undefined) ?? [],
    asBeneficiary: (q.data?.[1]?.result as readonly Address[] | undefined) ?? [],
    isLoading: q.isLoading,
  };
}
