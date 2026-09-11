// Creates a second ECDSA testnet account (the beneficiary) funded from the operator.
import { AccountCreateTransaction, Hbar, PrivateKey } from "@hashgraph/sdk";
import { appendFileSync } from "node:fs";
import { sdkClient, banner } from "./lib.ts";

banner("00 create beneficiary account");
if (process.env.BENEFICIARY_ID) { console.log("BENEFICIARY_ID already set, skipping"); process.exit(0); }
const client = sdkClient();
const key = PrivateKey.generateECDSA();
const tx = await new AccountCreateTransaction()
  .setECDSAKeyWithAlias(key)              // gives the account an EVM address alias
  .setInitialBalance(new Hbar(20))
  .execute(client);
const rcpt = await tx.getReceipt(client);
const id = rcpt.accountId!.toString();
const evm = `0x${key.publicKey.toEvmAddress()}`;
console.log({ id, evm });
appendFileSync(".env", `\nBENEFICIARY_ID=${id}\nBENEFICIARY_KEY=0x${key.toStringRaw()}\nBENEFICIARY_EVM_ADDRESS=${evm}\n`);
console.log("appended to .env");
client.close();
