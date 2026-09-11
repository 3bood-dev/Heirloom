// GATE-2: allowance round trip. grant (EVM path, then SDK fallback) -> read via HAS -> spend via HTS cryptoTransfer.
import { encodeFunctionData } from "viem";
import { AccountAllowanceApproveTransaction, AccountId, ContractId, Hbar } from "@hashgraph/sdk";
import {
  publicClient, walletClient, probeAbi, probeAddress, operator, hrc632Abi, sdkClient, env,
  mirrorBalanceTinybars, mirrorContractId, waitReceipt, weiToTiny, hbar, result, banner, sleep, saveState, SUCCESS,
} from "./lib.ts";

const probe = probeAddress();
const beneficiary = env("BENEFICIARY_EVM_ADDRESS") as `0x${string}`;
const APPROVE = 100_00000000n; // 100 HBAR in tinybars
const SPEND = 50_00000000n;    // 50 HBAR

// ---------- step 1: grant ----------
banner("GATE-2 step 1: owner grants HBAR allowance to probe");
let grantPath = "";
try {
  // EVM path: MetaMask-style tx to the owner's OWN address with IHRC632.hbarApprove calldata.
  const data = encodeFunctionData({ abi: hrc632Abi, functionName: "hbarApprove", args: [probe, APPROVE] });
  const hash = await walletClient.sendTransaction({ to: operator.address, data, gas: 1_000_000n });
  const rcpt = await waitReceipt(hash);
  if (rcpt.status !== "success") throw new Error("EVM hbarApprove tx reverted");
  grantPath = "EVM (IHRC632 at own address via JSON-RPC relay)";
} catch (e: any) {
  console.log("   EVM path failed:", e.shortMessage ?? e.message);
  console.log("   falling back to SDK AccountAllowanceApproveTransaction ...");
  const client = sdkClient();
  const probeId = ContractId.fromString(await mirrorContractId(probe));
  const tx = await new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(AccountId.fromString(env("OPERATOR_ID")), probeId, Hbar.fromTinybars(APPROVE.toString()))
    .execute(client);
  const r = await tx.getReceipt(client);
  console.log("   SDK approve status:", r.status.toString());
  client.close();
  grantPath = "SDK (AccountAllowanceApproveTransaction) — EVM path FAILED";
}
saveState({ grantPath });
console.log("   grant path used:", grantPath);

// ---------- step 2: read via HAS from inside the contract ----------
banner("GATE-2 step 2: probe reads allowance via HAS 0x16a");
await sleep(2000);
const sim = await publicClient.simulateContract({ address: probe, abi: probeAbi, functionName: "readAllowance", args: [operator.address], account: operator.address });
const [code, amount] = sim.result as [bigint, bigint];
console.log({ code, amount, expected: APPROVE });
const step2 = code === SUCCESS && amount === APPROVE;
result("GATE-2.2", step2, `hbarAllowance -> code ${code}, amount ${hbar(amount)}`);

// ---------- step 3: spend via cryptoTransfer with isApproval=true ----------
banner("GATE-2 step 3: probe moves 50 HBAR owner -> beneficiary via allowance");
const before = {
  owner: await mirrorBalanceTinybars(operator.address),
  beneficiary: await mirrorBalanceTinybars(beneficiary),
  probe: weiToTiny(await publicClient.getBalance({ address: probe })), // relay returns weibars
};
console.log("before:", { owner: hbar(before.owner), beneficiary: hbar(before.beneficiary), probe: hbar(before.probe) });

// simulate first so a non-SUCCESS response code is visible before spending gas
const simSpend = await publicClient.simulateContract({ address: probe, abi: probeAbi, functionName: "spendAllowance", args: [operator.address, beneficiary, SPEND], account: operator.address });
console.log("   simulated cryptoTransfer response code:", simSpend.result);
const hash = await walletClient.writeContract({ address: probe, abi: probeAbi, functionName: "spendAllowance", args: [operator.address, beneficiary, SPEND], gas: 1_000_000n });
await waitReceipt(hash);
await sleep(4000);
const after = {
  owner: await mirrorBalanceTinybars(operator.address),
  beneficiary: await mirrorBalanceTinybars(beneficiary),
  probe: weiToTiny(await publicClient.getBalance({ address: probe })),
};
console.log("after: ", { owner: hbar(after.owner), beneficiary: hbar(after.beneficiary), probe: hbar(after.probe) });
const benGain = after.beneficiary - before.beneficiary;
const probeDelta = after.probe - before.probe;
const step3 = benGain === SPEND && probeDelta === 0n && simSpend.result === SUCCESS;
result("GATE-2.3", step3, `beneficiary +${hbar(benGain)} (want ${hbar(SPEND)}), probe delta ${probeDelta} tinybars (want 0), code ${simSpend.result}`);

// remaining allowance should be 50
const sim2 = await publicClient.simulateContract({ address: probe, abi: probeAbi, functionName: "readAllowance", args: [operator.address], account: operator.address });
console.log("remaining allowance:", hbar((sim2.result as [bigint, bigint])[1]));
