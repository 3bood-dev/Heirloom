// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice HIP-632 / HIP-906 Hedera Account Service system contract at 0x16a.
///         NOT callable via delegatecall. hbarAllowance is NOT view (simulate from the frontend).
interface IHederaAccountService {
    /// @dev selector 0xfec46666
    function hbarAllowance(address owner, address spender) external returns (int64 responseCode, int256 amount);
    /// @dev selector 0xa0918464
    function hbarApprove(address owner, address spender, int256 amount) external returns (int64 responseCode);
}
