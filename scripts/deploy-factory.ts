// Deploys VaultFactory (production or demo) and records the address in DEPLOYED.json + .env
import { appendFileSync } from "node:fs";
import { publicClient, walletFor, factoryAbi, factoryArtifact, waitReceipt, saveDeployed, banner } from "./lib.ts";

const demo = (process.env.DEMO_MODE ?? "true") === "true";
banner(`deploy VaultFactory (demoMode=${demo})`);
const wallet = walletFor("OPERATOR_KEY");
const hash = await wallet.deployContract({ abi: factoryAbi, bytecode: factoryArtifact.bytecode.object, args: [demo] });
const rcpt = await waitReceipt(hash, "deploy");
const factory = rcpt.contractAddress!;
console.log("factory:", factory, `https://hashscan.io/testnet/contract/${factory}`);
saveDeployed({ network: "testnet", chainId: 296, [demo ? "factoryDemo" : "factory"]: factory, factoryDeployTx: hash });
appendFileSync(".env", `\n${demo ? "FACTORY_DEMO_ADDRESS" : "FACTORY_ADDRESS"}=${factory}\n`);
console.log("count:", await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "count" }));
