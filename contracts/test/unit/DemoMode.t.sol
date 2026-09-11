// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {VaultBase} from "./VaultBase.t.sol";
import {InheritanceVault} from "../../src/InheritanceVault.sol";

contract DemoModeTest is VaultBase {
    function setUp() public override {
        super.setUp();
        vm.deal(owner, OWNER_START + RESERVE);
        vm.prank(owner);
        vault = new InheritanceVault{value: RESERVE}(owner, beneficiary, 3 minutes, true);
        has.setAllowance(owner, address(vault), int256(500 * HBAR));
    }

    function test_compressedBands() public {
        assertEq(vault.currentInterval(), 15); // 180s remaining > 90
        vm.warp(vault.unlocksAt() - 60);
        assertEq(vault.currentInterval(), 10);
        vm.warp(vault.unlocksAt() - 20);
        assertEq(vault.currentInterval(), 5);
    }

    function test_threeMinuteLifecycle_autonomousRelease() public {
        uint256 links;
        while (!vault.released()) {
            assertTrue(fireHeartbeat());
            links++;
            require(links < 100, "runaway");
        }
        assertEq(beneficiary.balance, 500 * HBAR);
        // ~6 x 15s (to 90s) + 6 x 10s (to 30s) + 6-7 x 5s ≈ 19 links
        assertGt(links, 12);
        assertLt(links, 30);
    }
}
