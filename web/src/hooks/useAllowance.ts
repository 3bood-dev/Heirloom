"use client";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { inheritanceVaultAbi } from "@/lib/abi/InheritanceVault";
import { DEMO } from "@/lib/chain";

/// hbarAllowance is NOT a view on Hedera, so we simulate the call. Never cached beyond one poll.
export function useAllowance(vault: Address, owner?: Address) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["allowance", vault, owner],
    enabled: !!client && !!owner,
    refetchInterval: DEMO ? 4000 : 20000,
    queryFn: async () => {
      const sim = await client!.simulateContract({ address: vault, abi: inheritanceVaultAbi, functionName: "liveAllowance", account: owner });
      const [code, amount] = sim.result as readonly [bigint, bigint];
      return { code: Number(code), amount }; // tinybars
    },
  });
}
