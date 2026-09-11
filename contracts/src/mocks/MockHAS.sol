// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Foundry-only stand-in for the Hedera Account Service at 0x16a (vm.etch it there).
contract MockHAS {
    mapping(address => mapping(address => int256)) public allowance;
    int64 public forcedCode = 22;

    function setAllowance(address owner, address spender, int256 amount) external {
        allowance[owner][spender] = amount;
    }

    function setForcedCode(int64 c) external {
        forcedCode = c;
    }

    function hbarAllowance(address owner, address spender) external view returns (int64, int256) {
        if (forcedCode != 22) return (forcedCode, 0);
        return (22, allowance[owner][spender]);
    }

    function hbarApprove(address owner, address spender, int256 amount) external returns (int64) {
        allowance[owner][spender] = amount;
        return 22;
    }
}
