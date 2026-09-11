// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title TinybarMath
/// @notice Denomination rules, VERIFIED on Hedera testnet in Phase 0 (see SPIKE_RESULTS.md):
///
///   INSIDE THE EVM everything is TINYBARS (8 decimals):
///     - address.balance, msg.value, call{value:}  -> tinybars
///     - HTS / HAS / HSS system-contract int64 amounts -> tinybars
///   => The contract performs NO scaling between balances and system-contract amounts.
///
///   AT THE JSON-RPC RELAY boundary (eth_getBalance, tx.value, msg.value as seen by wallets)
///   HBAR is presented with 18 decimals (weibars). 1 tinybar = 1e10 weibar.
///   => The frontend / scripts convert; the contract never does.
///
///   The original spec (§2.6) assumed weibars inside the EVM. That was wrong and would have
///   produced a 10^10 error. The constant below exists only for off-chain reference and tests.
library TinybarMath {
    /// @dev Relay-boundary factor. Not used in on-chain value paths.
    uint256 internal constant TINYBAR_TO_WEIBAR = 1e10;

    error TinybarOverflow(uint256 value);
    error NegativeTinybar(int256 value);

    /// @notice Safe uint256 (balance) -> int64 (system contract amount). No scaling.
    function toInt64(uint256 tinybars) internal pure returns (int64) {
        if (tinybars > uint256(uint64(type(int64).max))) revert TinybarOverflow(tinybars);
        return int64(uint64(tinybars));
    }

    /// @notice Safe int64 -> uint256 for comparisons against address.balance. No scaling.
    function toUint256(int64 tinybars) internal pure returns (uint256) {
        if (tinybars < 0) revert NegativeTinybar(tinybars);
        return uint256(uint64(tinybars));
    }

    /// @notice For int256 amounts returned by hbarAllowance. Reverts on negative, clamps to int64.max.
    function clampToInt64(int256 value) internal pure returns (int64) {
        if (value < 0) revert NegativeTinybar(value);
        if (value > int256(type(int64).max)) return type(int64).max;
        return int64(value);
    }

    function min(int64 a, int64 b) internal pure returns (int64) {
        return a < b ? a : b;
    }
}
