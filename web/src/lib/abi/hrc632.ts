import { parseAbi } from "viem";
/// HIP-906 proxy-redirect interface. Called AT THE OWNER'S OWN ADDRESS (tx `to` = owner).
export const hrc632Abi = parseAbi([
  "function hbarAllowance(address spender) returns (int64 responseCode, int256 amount)",
  "function hbarApprove(address spender, int256 amount) returns (int64 responseCode)",
]);
