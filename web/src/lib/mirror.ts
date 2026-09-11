import { decodeEventLog, type Address, type Hex } from "viem";
import { MIRROR } from "./chain";
import { inheritanceVaultAbi } from "./abi/InheritanceVault";

async function get<T = unknown>(path: string): Promise<T> {
  const r = await fetch(`${MIRROR}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`mirror ${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export type VaultEvent = { time: number; name: string; args: Record<string, unknown>; tx: string };

export async function fetchVaultEvents(vault: Address, limit = 100): Promise<VaultEvent[]> {
  const data = await get<{ logs: { timestamp: string; data: Hex; topics: Hex[]; transaction_hash: string }[] }>(
    `/contracts/${vault}/results/logs?limit=${limit}&order=desc`,
  );
  const out: VaultEvent[] = [];
  for (const l of data.logs) {
    try {
      const ev = decodeEventLog({ abi: inheritanceVaultAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      out.push({ time: Math.floor(Number(l.timestamp)), name: ev.eventName, args: (ev.args ?? {}) as Record<string, unknown>, tx: l.transaction_hash });
    } catch {
      /* unknown event */
    }
  }
  return out;
}

export async function fetchAccountTinybars(evm: Address): Promise<bigint | null> {
  try {
    const a = await get<{ balance: { balance: number } }>(`/accounts/${evm}`);
    return BigInt(a.balance.balance);
  } catch {
    return null;
  }
}
