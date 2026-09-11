import { parseAbi } from "viem";
/// HIP-906 Hedera Account Service system contract at 0x16a.
/// Wallet path for granting an allowance: the OWNER sends a tx to 0x16a calling hbarApprove(owner, spender, amount).
/// (The IHRC632 form — a tx to the owner's own address — works on-chain but MetaMask refuses to send data to one of
///  its own accounts: "External transactions to internal accounts cannot include data".)
export const hasAbi = parseAbi([
  "function hbarAllowance(address owner, address spender) returns (int64 responseCode, int256 amount)",
  "function hbarApprove(address owner, address spender, int256 amount) returns (int64 responseCode)",
]);
export const HAS_ADDRESS = "0x000000000000000000000000000000000000016a" as const;
