"use client";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchVaultEvents } from "@/lib/mirror";
import { DEMO } from "@/lib/chain";

export function useMirrorEvents(vault: Address) {
  return useQuery({ queryKey: ["events", vault], queryFn: () => fetchVaultEvents(vault), refetchInterval: DEMO ? 4000 : 30000 });
}
