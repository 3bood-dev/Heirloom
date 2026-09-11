// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice HIP-906 proxy-redirect interface. Called AT THE ACCOUNT'S OWN ADDRESS.
///         The owner's wallet calls IHRC632(owner).hbarApprove(vault, amount).
interface IHRC632 {
    /// @dev selector 0xbbee989e
    function hbarAllowance(address spender) external returns (int64 responseCode, int256 amount);
    /// @dev selector 0x86aff07c
    function hbarApprove(address spender, int256 amount) external returns (int64 responseCode);
}
