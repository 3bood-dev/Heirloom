// GATE-1: can a contract read an EOA's balance, and does it match the mirror node?
import { publicClient, probeAbi, probeAddress, operator, mirrorBalanceTinybars, weiToTiny, hbar, result, banner } from "./lib.ts";

banner("GATE-1 contract reads EOA balance");
const probe = probeAddress();
const fromContract = (await publicClient.readContract({ address: probe, abi: probeAbi, functionName: "probeBalance", args: [operator.address] })) as bigint;
const fromMirror = await mirrorBalanceTinybars(operator.address);
const fromRpc = await publicClient.getBalance({ address: operator.address });
// FINDING (Phase 0, read-only probe via Multicall3): inside the Hedera EVM, address.balance is in TINYBARS.
// The JSON-RPC relay multiplies by 1e10 so eth_getBalance reports weibars. So: contract value == mirror tinybars,
// and rpcWeibars == contract value * 1e10. This spike asserts both relations.
console.log({ contractUnits: fromContract, mirrorTinybars: fromMirror, rpcWeibars: fromRpc, rpcAsTinybars: weiToTiny(fromRpc) });
const diff = fromContract > fromMirror ? fromContract - fromMirror : fromMirror - fromContract;
// allow a tiny drift (mirror lag / a fee between the two reads)
const pass = fromContract > 0n && diff < 100_000_000n && weiToTiny(fromRpc) === fromContract;
result("GATE-1", pass, `contract sees ${hbar(fromContract)} (tinybars), mirror ${hbar(fromMirror)}, diff ${diff} tinybars; relay/1e10 matches: ${weiToTiny(fromRpc) === fromContract}`);

// Also check whether auto-renew is draining balances on testnet (false-liveness risk, §4.3)
const acct = await fetch(`${process.env.MIRROR_NODE_URL}/accounts/${operator.address}`).then(r => r.json());
console.log("auto_renew_period:", acct.auto_renew_period, "expiry:", acct.expiry_timestamp);
