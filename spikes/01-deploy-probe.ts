import { parseEther } from "viem";
import { publicClient, walletClient, probeAbi, probeBytecode, saveState, waitReceipt, banner, operator } from "./lib.ts";

banner("01 deploy GateProbe");
console.log("operator EVM:", operator.address, "balance:", await publicClient.getBalance({ address: operator.address }));
const hash = await walletClient.deployContract({ abi: probeAbi, bytecode: probeBytecode, args: [] });
const rcpt = await waitReceipt(hash);
const probe = rcpt.contractAddress!;
console.log("probe deployed at", probe);
// Fund the probe so it can pay for its own scheduled calls (GATE-3/4).
const fund = await walletClient.sendTransaction({ to: probe, value: parseEther("20") });
await waitReceipt(fund);
saveState({ probe, deployTx: hash });
console.log("probe balance:", await publicClient.getBalance({ address: probe }));
