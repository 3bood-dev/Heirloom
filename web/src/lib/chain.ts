import { defineChain } from "viem";

export const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet.hashio.io/api";
export const MIRROR = process.env.NEXT_PUBLIC_MIRROR_URL ?? "https://testnet.mirrornode.hedera.com/api/v1";
export const FACTORY = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export const HASHSCAN = "https://hashscan.io/testnet";

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "HashScan", url: HASHSCAN } },
  testnet: true,
});

/// Gas limits. Hedera charges >= 80% of the limit, so these are deliberately tight-ish.
/// A scheduleCall costs ~1.5M gas (measured, SPIKE_RESULTS.md); createVault runs one in the constructor.
export const GAS = {
  createVault: 4_000_000n,
  approve: 1_000_000n,
  ping: 4_000_000n,      // deleteSchedule + scheduleCall
  poke: 4_000_000n,
  release: 4_000_000n,   // HAS read + cryptoTransfer (+ reschedule on abort)
  cancel: 800_000n,
  setBeneficiary: 500_000n,
  setTimeout: 4_000_000n,
} as const;
