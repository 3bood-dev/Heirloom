// Shared helpers for the Phase-0 gate spikes. Throwaway code.
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, defineChain, parseAbi,
  type Address, type Hex, formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";

export const TINYBAR_TO_WEIBAR = 10n ** 10n;
export const SUCCESS = 22n;

export function env(name: string, required = true): string {
  const v = process.env[name];
  if (!v && required) throw new Error(`Missing ${name} in .env`);
  return v ?? "";
}

export const RPC = env("JSON_RPC_RELAY_URL");
export const MIRROR = env("MIRROR_NODE_URL");

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

export function hexKey(raw: string): Hex {
  let k = raw.trim();
  if (k.startsWith("0x")) k = k.slice(2);
  // Portal sometimes gives DER-encoded ECDSA keys (starts with 3030...). Extract the raw 32 bytes.
  if (k.length > 64) k = PrivateKey.fromStringECDSA(k).toStringRaw();
  return `0x${k}` as Hex;
}

export const operator = privateKeyToAccount(hexKey(env("OPERATOR_KEY")));
export const publicClient = createPublicClient({ chain: hederaTestnet, transport: http(RPC, { timeout: 120_000 }) });
export const walletClient = createWalletClient({ chain: hederaTestnet, account: operator, transport: http(RPC, { timeout: 120_000 }) });

export function sdkClient(): Client {
  const c = Client.forTestnet();
  c.setOperator(AccountId.fromString(env("OPERATOR_ID")), PrivateKey.fromStringECDSA(hexKey(env("OPERATOR_KEY")).slice(2)));
  return c;
}

export const probeArtifact = JSON.parse(
  readFileSync(new URL("../contracts/out-spikes/GateProbe.sol/GateProbe.json", import.meta.url), "utf8"),
);
export const probeAbi = probeArtifact.abi;
export const probeBytecode = probeArtifact.bytecode.object as Hex;

export const hrc632Abi = parseAbi([
  "function hbarAllowance(address spender) returns (int64 responseCode, int256 amount)",
  "function hbarApprove(address spender, int256 amount) returns (int64 responseCode)",
]);

const STATE = new URL("./state.json", import.meta.url);
export function loadState(): Record<string, any> {
  return existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
}
export function saveState(patch: Record<string, any>) {
  const s = { ...loadState(), ...patch };
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  return s;
}

// ---- mirror node ----
export async function mirror<T = any>(path: string): Promise<T> {
  const r = await fetch(`${MIRROR}${path}`);
  if (!r.ok) throw new Error(`mirror ${path} -> ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}
export async function mirrorBalanceTinybars(evmOrId: string): Promise<bigint> {
  const a = await mirror(`/accounts/${evmOrId}`);
  return BigInt(a.balance.balance);
}
export async function mirrorAccountId(evm: string): Promise<string> {
  return (await mirror(`/accounts/${evm}`)).account;
}
export async function mirrorContractId(evm: string): Promise<string> {
  return (await mirror(`/contracts/${evm}`)).contract_id;
}
export async function mirrorTxFee(hash: Hex): Promise<{ feeTinybars: bigint; gasUsed: bigint; gasLimit: bigint; result: string }> {
  // mirror node indexes with a small lag
  for (let i = 0; i < 20; i++) {
    try {
      const r = await mirror(`/contracts/results/${hash}`);
      const t = await mirror(`/transactions?timestamp=${r.timestamp}`);
      const fee = t.transactions.reduce((a: bigint, x: any) => a + BigInt(x.charged_tx_fee ?? 0), 0n);
      return { feeTinybars: fee, gasUsed: BigInt(r.gas_used ?? 0), gasLimit: BigInt(r.gas_limit ?? 0), result: r.result };
    } catch { await sleep(3000); }
  }
  throw new Error("mirror node never indexed " + hash);
}
/// All contract results for an address, newest first (to inspect scheduled executions: from == HSS/system)
export async function mirrorContractResults(addr: string, limit = 10) {
  return (await mirror(`/contracts/${addr}/results?limit=${limit}&order=desc`)).results as any[];
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const hbar = (tinybars: bigint) => `${formatUnits(tinybars, 8)} ℏ`;
export const weiToTiny = (w: bigint) => w / TINYBAR_TO_WEIBAR;

export async function waitReceipt(hash: Hex) {
  const rcpt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`   tx ${hash} -> ${rcpt.status} (gasUsed ${rcpt.gasUsed})`);
  return rcpt;
}

export function banner(t: string) { console.log(`\n=== ${t} ===`); }
export function result(gate: string, pass: boolean, note: string) {
  const s = loadState();
  s.results = { ...(s.results ?? {}), [gate]: { pass, note, at: new Date().toISOString() } };
  saveState(s);
  console.log(`\n>>> ${gate}: ${pass ? "PASS" : "FAIL"} — ${note}`);
}
export function probeAddress(): Address {
  const a = loadState().probe;
  if (!a) throw new Error("run 01-deploy-probe first");
  return a as Address;
}
