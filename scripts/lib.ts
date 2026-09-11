// Shared helpers for deploy + integration scripts (production code path, unlike spikes/).
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, http, defineChain, parseAbi, type Address, type Hex, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PrivateKey } from "@hashgraph/sdk";

export const TINYBAR_TO_WEIBAR = 10n ** 10n;
export const SUCCESS = 22n;
export const HSS = "0x000000000000000000000000000000000000016b" as Address;

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
  if (k.length > 64) k = PrivateKey.fromStringECDSA(k).toStringRaw();
  return `0x${k}` as Hex;
}
export function accountFrom(envKey: string) {
  return privateKeyToAccount(hexKey(env(envKey)));
}
const transport = http(RPC, { timeout: 60_000, retryCount: 6, retryDelay: 2_000 });
export const publicClient = createPublicClient({ chain: hederaTestnet, transport });

/// The WSL/relay path drops connections now and then. Reads must survive that; the vault does not wait for us.
export async function retry<T>(fn: () => Promise<T>, tries = 8, label = "rpc"): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e: any) { last = e; console.log(`   (retry ${i + 1}/${tries} ${label}: ${e.shortMessage ?? e.message?.slice(0, 80)})`); await sleep(3000 * (i + 1)); }
  }
  throw last;
}
export function walletFor(envKey: string) {
  return createWalletClient({ chain: hederaTestnet, account: accountFrom(envKey), transport });
}

function artifact(name: string) {
  return JSON.parse(readFileSync(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8"));
}
export const vaultArtifact = artifact("InheritanceVault");
export const factoryArtifact = artifact("VaultFactory");
export const vaultAbi = vaultArtifact.abi;
export const factoryAbi = factoryArtifact.abi;

export const hrc632Abi = parseAbi([
  "function hbarAllowance(address spender) returns (int64 responseCode, int256 amount)",
  "function hbarApprove(address spender, int256 amount) returns (int64 responseCode)",
]);

export async function mirror<T = any>(path: string): Promise<T> {
  const r = await fetch(`${MIRROR}${path}`);
  if (!r.ok) throw new Error(`mirror ${path} -> ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}
export async function mirrorBalanceTinybars(evmOrId: string): Promise<bigint> {
  return BigInt((await mirror(`/accounts/${evmOrId}`)).balance.balance);
}
export async function mirrorContractResults(addr: string, limit = 25) {
  return (await mirror(`/contracts/${addr}/results?limit=${limit}&order=desc`)).results as any[];
}
export async function mirrorLogs(addr: string, limit = 50) {
  return (await mirror(`/contracts/${addr}/results/logs?limit=${limit}&order=desc`)).logs as any[];
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const hbar = (tinybars: bigint) => `${formatUnits(tinybars, 8)} ℏ`;
export const weiToTiny = (w: bigint) => w / TINYBAR_TO_WEIBAR;
export const tinyToWei = (t: bigint) => t * TINYBAR_TO_WEIBAR;
export const now = () => BigInt(Math.floor(Date.now() / 1000));
export const ts = () => new Date().toISOString().slice(11, 19);

export async function waitReceipt(hash: Hex, label = "tx") {
  const rcpt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`   [${ts()}] ${label} ${hash} -> ${rcpt.status} (gasUsed ${rcpt.gasUsed})`);
  return rcpt;
}

const DEPLOYED = new URL("../DEPLOYED.json", import.meta.url);
export function loadDeployed(): Record<string, any> {
  return existsSync(DEPLOYED) ? JSON.parse(readFileSync(DEPLOYED, "utf8")) : {};
}
export function saveDeployed(patch: Record<string, any>) {
  const s = { ...loadDeployed(), ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(DEPLOYED, JSON.stringify(s, null, 2));
  return s;
}
export function banner(t: string) { console.log(`\n=== [${ts()}] ${t} ===`); }
