// GATE-3: HIP-1215 self-scheduling fires autonomously. GATE-4: what it costs.
import { publicClient, walletClient, probeAbi, probeAddress, operator, waitReceipt, mirrorTxFee, weiToTiny, hbar, result, banner, sleep, SUCCESS, saveState } from "./lib.ts";

const probe = probeAddress();
const DELAY = 60n;
const GAS = 300_000n;

banner("GATE-3 hasScheduleCapacity via HSS 0x16b");
const block = await publicClient.getBlock();
const target = block.timestamp + DELAY;
const cap = await publicClient.readContract({ address: probe, abi: probeAbi, functionName: "hasCapacity", args: [target, GAS] });
console.log({ target, cap });

banner("GATE-3 scheduleCall(self.tick) in 60s");
const ticksBefore = (await publicClient.readContract({ address: probe, abi: probeAbi, functionName: "ticks" })) as bigint;
const probeBefore = await publicClient.getBalance({ address: probe });
const sim = await publicClient.simulateContract({ address: probe, abi: probeAbi, functionName: "scheduleTick", args: [DELAY, GAS], account: operator.address });
const [code, sched] = sim.result as [bigint, `0x${string}`];
console.log("   simulated:", { code, sched });
const hash = await walletClient.writeContract({ address: probe, abi: probeAbi, functionName: "scheduleTick", args: [DELAY, GAS], gas: 1_500_000n });
const rcpt = await waitReceipt(hash);
const probeAfterSchedule = await publicClient.getBalance({ address: probe });
const fee = await mirrorTxFee(hash);
console.log("   scheduling tx fee (payer=operator):", hbar(fee.feeTinybars), "gasUsed", fee.gasUsed, "result", fee.result);
console.log("   probe balance change on scheduling (tinybars):", weiToTiny(probeAfterSchedule) - weiToTiny(probeBefore));
if (code !== SUCCESS) { result("GATE-3", false, `scheduleCall returned ${code}`); process.exit(1); }

console.log(`   waiting for autonomous tick (target consensus second ${target}) ...`);
const t0 = Date.now();
let fired = false, ticksNow = ticksBefore;
while (Date.now() - t0 < 6 * 60_000) {
  await sleep(5000);
  ticksNow = (await publicClient.readContract({ address: probe, abi: probeAbi, functionName: "ticks" })) as bigint;
  if (ticksNow > ticksBefore) { fired = true; break; }
  process.stdout.write(".");
}
console.log();
const lastTick = (await publicClient.readContract({ address: probe, abi: probeAbi, functionName: "lastTick" })) as bigint;
const probeAfterExec = await publicClient.getBalance({ address: probe });
const execCost = weiToTiny(probeAfterSchedule) - weiToTiny(probeAfterExec);
console.log({ fired, ticksBefore, ticksNow, lastTick, target, lateBySeconds: fired ? Number(lastTick - target) : null });
result("GATE-3", fired, fired ? `tick() fired autonomously ${Number(lastTick - target)}s after target; schedule ${sched}` : "tick never fired within 6 minutes");
result("GATE-4", true, `scheduleCall tx fee ${hbar(fee.feeTinybars)} (gas ${fee.gasUsed}); probe paid ${hbar(execCost)} for the scheduled execution (gasLimit ${GAS})`);
saveState({ gate4: { scheduleTxFeeTinybars: fee.feeTinybars.toString(), scheduleGasUsed: fee.gasUsed.toString(), executionCostTinybars: execCost.toString(), gasLimit: GAS.toString() } });

// Chain test: tick reschedules itself twice (heartbeat pattern)
banner("GATE-3b chained self-rescheduling (2 links, 30s apart)");
const tBefore = ticksNow;
const h2 = await walletClient.writeContract({ address: probe, abi: probeAbi, functionName: "startChain", args: [2n, 30n, GAS], gas: 1_500_000n });
await waitReceipt(h2);
const t1 = Date.now();
let t = tBefore;
while (Date.now() - t1 < 6 * 60_000 && t < tBefore + 3n) {
  await sleep(5000);
  t = (await publicClient.readContract({ address: probe, abi: probeAbi, functionName: "ticks" })) as bigint;
  process.stdout.write(`${t} `);
}
console.log();
result("GATE-3b", t >= tBefore + 3n, `ticks went ${tBefore} -> ${t} (want +3: 1 scheduled + 2 chained)`);
