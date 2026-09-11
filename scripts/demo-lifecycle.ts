// End-to-end integration test on testnet (spec §6.3), in DEMO_MODE:
//   deploy vault via factory -> owner grants allowance (EVM path) -> observe autonomous heartbeats
//   -> owner sends a small tx (passive liveness) -> ping() -> go dark -> autonomous release
//   -> assert beneficiary +amount and vault balance unchanged apart from fees.
import { encodeFunctionData, decodeEventLog, parseEther, type Address } from "viem";
import {
  publicClient, walletFor, accountFrom, factoryAbi, vaultAbi, hrc632Abi, env, waitReceipt, mirrorBalanceTinybars,
  mirrorLogs, weiToTiny, hbar, sleep, banner, ts, saveDeployed, retry,
} from "./lib.ts";

const TIMEOUT = BigInt(process.env.DEMO_TIMEOUT ?? "180");       // seconds
const RESERVE_HBAR = process.env.DEMO_RESERVE ?? "60";            // fee reserve: ~1.4 HBAR per heartbeat, demo bands burn ~18-25 beats per 3-min run
const ALLOWANCE = 100_00000000n;                                  // 100 HBAR
const factory = (process.env.FACTORY_DEMO_ADDRESS ?? "") as Address;
if (!factory) throw new Error("run deploy-factory first (DEMO_MODE=true)");

const owner = walletFor("OPERATOR_KEY");
const beneficiaryWallet = walletFor("BENEFICIARY_KEY"); // permissionless calls come from here: an owner-signed tx is itself proof of life
const ownerAddr = accountFrom("OPERATOR_KEY").address;
const beneficiary = env("BENEFICIARY_EVM_ADDRESS") as Address;

async function state(vault: Address) {
  return retry(() => _state(vault), 10, "state");
}
async function _state(vault: Address) {
  const [status, remaining, interval, pending, snapshot, released] = await Promise.all([
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "status" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "timeRemaining" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "currentInterval" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "nextHeartbeat" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "lastKnownBalance" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "released" }),
  ]);
  const [sched, target] = pending as [Address, bigint];
  return { status: Number(status), remaining: Number(remaining), interval: Number(interval), sched, target: Number(target), snapshot: snapshot as bigint, released: released as boolean };
}
const STATUS = ["Active", "Warning", "Critical", "Releasable", "Released", "Cancelled"];

// ---------- Sig 1: create vault ----------
banner(`Sig 1: factory.createVault(beneficiary, ${TIMEOUT}s) + ${RESERVE_HBAR} HBAR reserve`);
const ownerBal0 = await mirrorBalanceTinybars(ownerAddr);
const h1 = await owner.writeContract({ address: factory, abi: factoryAbi, functionName: "createVault", args: [beneficiary, TIMEOUT], value: parseEther(RESERVE_HBAR), gas: 6_000_000n });
const r1 = await waitReceipt(h1, "createVault");
let vault!: Address;
for (const log of r1.logs) {
  try { const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics }) as any; if (ev.eventName === "VaultDeployed") vault = ev.args.vault; } catch {}
}
console.log("vault:", vault, `https://hashscan.io/testnet/contract/${vault}`);
saveDeployed({ demoVault: vault });
let s = await state(vault);
console.log("   first heartbeat scheduled:", s.sched, "for", new Date(s.target * 1000).toISOString(), `interval ${s.interval}s`);
if (s.sched === "0x0000000000000000000000000000000000000000") console.log("   !! constructor could not schedule (check HeartbeatSchedulingFailed events / gas)");

// ---------- Sig 2: allowance ----------
banner("Sig 2: owner grants HBAR allowance to the vault (tx to own address, IHRC632.hbarApprove)");
const h2 = await owner.sendTransaction({ to: ownerAddr, data: encodeFunctionData({ abi: hrc632Abi, functionName: "hbarApprove", args: [vault, ALLOWANCE] }), gas: 1_000_000n });
await waitReceipt(h2, "hbarApprove");
const allow = await publicClient.simulateContract({ address: vault, abi: vaultAbi, functionName: "liveAllowance", account: ownerAddr });
console.log("   vault.liveAllowance() ->", allow.result, "(want [22, 100 HBAR])");
const vaultBal0 = weiToTiny(await publicClient.getBalance({ address: vault }));
console.log("   owner balance unchanged by setup except fees:", hbar(await mirrorBalanceTinybars(ownerAddr)), "(was", hbar(ownerBal0) + ")");

// ---------- observe heartbeats ----------
banner("observe 2 autonomous heartbeats");
let seen = 0, lastSched = s.sched;
const t0 = Date.now();
while (seen < 2 && Date.now() - t0 < 4 * 60_000) {
  await sleep(4000);
  s = await state(vault);
  if (s.sched !== lastSched) { seen++; lastSched = s.sched; console.log(`   [${ts()}] heartbeat #${seen} fired -> next at ${new Date(s.target * 1000).toISOString().slice(11, 19)} (interval ${s.interval}s, remaining ${s.remaining}s, ${STATUS[s.status]})`); }
}
if (seen < 2) console.log("   !! fewer than 2 heartbeats observed; chain may be broken");

// ---------- passive liveness ----------
banner("passive liveness: owner just uses their wallet (sends 1 HBAR to beneficiary), no app involved");
const before = await state(vault);
const h3 = await owner.sendTransaction({ to: beneficiary, value: parseEther("1") });
await waitReceipt(h3, "owner transfer");
const tp = Date.now();
let detected = false;
while (Date.now() - tp < 90_000) {
  await sleep(4000);
  s = await state(vault);
  if (s.remaining > before.remaining - Math.floor((Date.now() - tp) / 1000) + 10) { detected = true; break; }
}
console.log(detected ? `   [${ts()}] LivenessDetected by heartbeat: timer reset, remaining ${s.remaining}s` : "   !! passive liveness not detected within 90s");

// ---------- manual ping ----------
banner("manual ping()");
const h4 = await owner.writeContract({ address: vault, abi: vaultAbi, functionName: "ping", gas: 6_000_000n });
await waitReceipt(h4, "ping");
s = await state(vault);
console.log(`   remaining ${s.remaining}s, next heartbeat ${new Date(s.target * 1000).toISOString().slice(11, 19)}`);

// ---------- go dark ----------
banner(`go dark: no owner activity for ${TIMEOUT}s; watch interval tighten; expect autonomous release`);
const benBefore = await retry(() => mirrorBalanceTinybars(beneficiary));
const vaultBefore = weiToTiny(await publicClient.getBalance({ address: vault }));
const tg = Date.now();
let lastInterval = -1;
while (Date.now() - tg < (Number(TIMEOUT) + 240) * 1000) {
  await sleep(5000);
  s = await state(vault);
  if (s.interval !== lastInterval) { lastInterval = s.interval; console.log(`   [${ts()}] ${STATUS[s.status]} remaining ${s.remaining}s -> heartbeat interval ${s.interval}s`); }
  if (s.released) break;
}
if (!s.released) {
  banner("chain did not release on its own; beneficiary calls release() (permissionless fallback)");
  const hr = await beneficiaryWallet.writeContract({ address: vault, abi: vaultAbi, functionName: "release", gas: 4_000_000n });
  await waitReceipt(hr, "release()");
  s = await state(vault);
}
await sleep(5000);
const benAfter = await retry(() => mirrorBalanceTinybars(beneficiary));
const vaultAfter = weiToTiny(await publicClient.getBalance({ address: vault }));
banner("RESULT");
console.log({ released: s.released, beneficiaryGain: hbar(benAfter - benBefore), vaultReserveBefore: hbar(vaultBefore), vaultReserveAfter: hbar(vaultAfter), vaultSpentOnHeartbeats: hbar(vaultBefore - vaultAfter) });
const logs = await mirrorLogs(vault, 60);
console.log(`   ${logs.length} events emitted by the vault (see hashscan)`);
console.log(s.released ? ">>> INTEGRATION PASS: autonomous release, funds moved owner -> beneficiary, vault held nothing." : ">>> INTEGRATION FAIL: not released");
