// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {VaultBase} from "./VaultBase.t.sol";
import {InheritanceVault} from "../../src/InheritanceVault.sol";

contract LivenessTest is VaultBase {
    function test_constructor_snapshotsOwnerBalanceInTinybars() public view {
        assertEq(vault.lastKnownBalance(), OWNER_START);
        assertEq(vault.owner(), owner);
        assertEq(vault.unlocksAt(), block.timestamp + TIMEOUT);
        assertEq(address(vault).balance, RESERVE, "fee reserve only");
    }

    function test_decrease_resetsTimerAndResyncs() public {
        vm.warp(block.timestamp + 100 days);
        ownerSpends(1 * HBAR);
        vm.expectEmit(true, true, true, true);
        emit InheritanceVault.LivenessDetected(OWNER_START, OWNER_START - HBAR, block.timestamp + TIMEOUT);
        vault.poke();
        assertEq(vault.lastActiveTimestamp(), block.timestamp);
        assertEq(vault.lastKnownBalance(), OWNER_START - HBAR);
    }

    function test_increase_doesNotResetTimer_butResyncs() public {
        uint256 t0 = vault.lastActiveTimestamp();
        vm.warp(block.timestamp + 100 days);
        ownerReceives(50 * HBAR);
        vault.poke();
        assertEq(vault.lastActiveTimestamp(), t0, "timer must not reset on inflow");
        assertEq(vault.lastKnownBalance(), OWNER_START + 50 * HBAR, "snapshot must resync");
    }

    function test_unchanged_nothingResets() public {
        uint256 t0 = vault.lastActiveTimestamp();
        vm.warp(block.timestamp + 100 days);
        vault.poke();
        assertEq(vault.lastActiveTimestamp(), t0);
        assertEq(vault.lastKnownBalance(), OWNER_START);
    }

    /// Grief resistance: attacker dusts the owner monthly; timer never resets; vault becomes releasable.
    function test_attackerDust_neverResetsTimer() public {
        uint256 t0 = vault.lastActiveTimestamp();
        for (uint256 i = 0; i < 12; i++) {
            vm.warp(block.timestamp + 30 days);
            ownerReceives(1); // 1 tinybar from an attacker
            vault.poke();
            assertEq(vault.lastActiveTimestamp(), t0, "dust reset the timer");
        }
        vm.warp(t0 + TIMEOUT + 1);
        assertTrue(vault.isReleasable());
    }

    function test_largeIncreaseThenSmallDecrease_detectedAgainstResyncedBaseline() public {
        vm.warp(block.timestamp + 10 days);
        ownerReceives(500 * HBAR);
        vault.poke(); // resync to 1500
        uint256 t0 = vault.lastActiveTimestamp();
        vm.warp(block.timestamp + 10 days);
        ownerSpends(1); // one tinybar of fees
        vault.poke();
        assertGt(vault.lastActiveTimestamp(), t0, "decrease vs resynced baseline must count");
    }

    /// Netting problem (spec 4.5): spend then receive between samples nets positive => not detected. Documented.
    function test_nettingProblem_isRealAndDocumented() public {
        uint256 t0 = vault.lastActiveTimestamp();
        ownerSpends(100 * HBAR);
        ownerReceives(500 * HBAR);
        vm.warp(block.timestamp + 30 days);
        vault.poke();
        assertEq(vault.lastActiveTimestamp(), t0, "net increase is invisible to a single sample");
    }

    function test_ping_resetsAndResyncs() public {
        vm.warp(block.timestamp + 200 days);
        ownerReceives(7 * HBAR);
        vm.prank(owner);
        vault.ping();
        assertEq(vault.lastActiveTimestamp(), block.timestamp);
        assertEq(vault.lastKnownBalance(), OWNER_START + 7 * HBAR, "ping must resync snapshot");
    }

    function test_ping_staleSnapshotBugAvoided() public {
        // Without resync in ping(), a later poke would misread an inflow-then-spend as liveness incorrectly,
        // or miss a real spend. Verify: after ping, snapshot == balance, and no phantom liveness on next poke.
        ownerReceives(100 * HBAR);
        vm.prank(owner);
        vault.ping();
        uint256 t0 = vault.lastActiveTimestamp();
        vm.warp(block.timestamp + 5 days);
        vault.poke();
        assertEq(vault.lastActiveTimestamp(), t0, "phantom liveness after ping");
    }

    function testFuzz_lastActiveNeverMovesBackwards(uint128 bal1, uint128 bal2, uint32 dt) public {
        vm.deal(owner, bal1);
        vault.poke();
        uint256 t0 = vault.lastActiveTimestamp();
        vm.warp(block.timestamp + dt);
        vm.deal(owner, bal2);
        vault.poke();
        assertGe(vault.lastActiveTimestamp(), t0);
        assertEq(vault.lastKnownBalance(), bal2, "snapshot always == current balance");
    }
}
