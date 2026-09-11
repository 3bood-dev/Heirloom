// GATE-3b: a scheduled self-call that ITSELF reschedules (the heartbeat pattern), with realistic gas.
// Also GATE-4b: is the scheduled execution charged on gasLimit or on gas used?
import { publicClient, walletClient, probeAbi, probeAddress, waitReceipt, mirrorTxFee, mirrorContractResults, weiToTiny, hbar, result, banner, sleep, saveState } from "./lib.ts";

const probe = probeAddress();
const LINKS = 2n, DELAY = 30n;
const CHAIN_GAS = BigInt(process.env.CHAIN_GAS ?? "3000000");

banner(`GATE-3b chain: 1 scheduled + ${LINKS} self-rescheduled ticks, ${DELAY}s apart, gasLimit ${CHAIN_GAS}`);
const t0 = (await publicClient.readContract({ address: probe, abi: probeAbi, functionName: "ticks" })) as bigint;
const bal0 = weiToTiny(await publicClient.getBalance({ address: probe }));
const hash = await walletClient.writeContract({ address: probe, abi: probeAbi, functionName: "startChain", args: [LINKS, DELAY, CHAIN_GAS], gas: 6_000_000n });
const rcpt = await waitReceipt(hash);
if (rcpt.status !== "success") { result("GATE-3b", false, "startChain reverted"); process.exit(1); }
const fee = await mirrorTxFee(hash);
console.log(`   startChain: gasUsed ${fee.gasUsed} / limit ${fee.gasLimit}, charged ${hbar(fee.feeTinybars)}`);
const bal1 = weiToTiny(await publicClient.getBalance({ address: probe }));

const start = Date.now();
let t = t0;
while (Date.now() - start < 8 * 60_000 && t < t0 + 1n + LINKS) {
  await sleep(5000);
  t = (await publicClient.readContract({ address: probe, abi: probeAbi, functionName: "ticks" })) as bigint;
  process.stdout.write(`${t} `);
}
console.log();
const bal2 = weiToTiny(await publicClient.getBalance({ address: probe }));
const execs = Number(t - t0);
const paid = bal1 - bal2;
console.log({ ticksBefore: t0, ticksAfter: t, probePaidTinybars: paid, perExecution: execs ? paid / BigInt(execs) : 0n });
result("GATE-3b", t >= t0 + 1n + LINKS, `ticks ${t0} -> ${t} (want +${1n + LINKS}); probe paid ${hbar(paid)} total, ${hbar(execs ? paid / BigInt(execs) : 0n)} per execution at gasLimit ${CHAIN_GAS}`);

banner("scheduled execution records (mirror node)");
const rs = await mirrorContractResults(probe, 6);
for (const r of rs) console.log({ ts: r.timestamp, from: r.from, result: r.result, gas_limit: r.gas_limit, gas_used: r.gas_used, gas_consumed: r.gas_consumed });
saveState({ gate3b: { chainGas: CHAIN_GAS.toString(), executions: execs, probePaidTinybars: paid.toString(), perExecutionTinybars: execs ? (paid / BigInt(execs)).toString() : "0" } });
