// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {IHederaTokenService} from "../interfaces/IHederaTokenService.sol";
import {MockHAS} from "./MockHAS.sol";

/// @notice Foundry-only stand-in for HTS cryptoTransfer at 0x167. Moves real (test) balances with vm.deal
///         and enforces allowance semantics against the MockHAS at 0x16a, mirroring the ledger rules:
///         zero-sum, sufficient balance, and isApproval legs debit the spender's (msg.sender's) allowance.
contract MockHTS {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant HAS = address(0x16a);

    int64 public forcedCode = 22;
    uint256 public calls;

    function setForcedCode(int64 c) external {
        forcedCode = c;
    }

    function cryptoTransfer(
        IHederaTokenService.TransferList memory list,
        IHederaTokenService.TokenTransferList[] memory /*tokens*/
    ) external returns (int64) {
        calls++;
        if (forcedCode != 22) return forcedCode;
        int256 sum;
        for (uint256 i = 0; i < list.transfers.length; i++) sum += list.transfers[i].amount;
        if (sum != 0) return 173; // TRANSFERS_NOT_ZERO_SUM_FOR_TOKEN

        // debits first
        for (uint256 i = 0; i < list.transfers.length; i++) {
            IHederaTokenService.AccountAmount memory t = list.transfers[i];
            if (t.amount >= 0) continue;
            uint256 debit = uint256(uint64(-t.amount));
            if (t.accountID.balance < debit) return 28; // INSUFFICIENT_ACCOUNT_BALANCE
            if (t.isApproval) {
                int256 allowed = MockHAS(HAS).allowance(t.accountID, msg.sender);
                if (allowed <= 0) return 292; // SPENDER_DOES_NOT_HAVE_ALLOWANCE
                if (uint256(allowed) < debit) return 293; // AMOUNT_EXCEEDS_ALLOWANCE
                MockHAS(HAS).setAllowance(t.accountID, msg.sender, allowed - int256(debit));
            } else if (t.accountID != msg.sender) {
                return 7; // INVALID_SIGNATURE: only the caller can be debited without approval
            }
            vm.deal(t.accountID, t.accountID.balance - debit);
        }
        for (uint256 i = 0; i < list.transfers.length; i++) {
            IHederaTokenService.AccountAmount memory t = list.transfers[i];
            if (t.amount <= 0) continue;
            vm.deal(t.accountID, t.accountID.balance + uint256(uint64(t.amount)));
        }
        return 22;
    }
}
