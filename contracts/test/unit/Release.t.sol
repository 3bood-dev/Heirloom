// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {VaultBase} from "./VaultBase.t.sol";
import {InheritanceVault} from "../../src/InheritanceVault.sol";

contract ReleaseTest is VaultBase {
    function test_beforeDeadline_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(InheritanceVault.DeadlineNotReached.selector, vault.unlocksAt()));
        vault.release();
    }

    function test_atExactDeadline_reverts() public {
        vm.warp(vault.unlocksAt());
        vm.expectRevert();
        vault.release();
    }

    function test_afterDeadline_dormantOwner_transfersDirectly() public {
        pastDeadline();
        uint256 vaultBefore = address(vault).balance;
        vm.prank(stranger);
        bool done = vault.release();
        assertTrue(done);
        assertTrue(vault.released());
        assertEq(beneficiary.balance, 500 * HBAR, "beneficiary gets min(allowance, balance)");
        assertEq(owner.balance, OWNER_START - 500 * HBAR);
        assertEq(address(vault).balance, vaultBefore, "vault balance untouched: non-custodial");
        assertEq(has.allowance(owner, address(vault)), 0, "allowance consumed");
    }

    /// THE most important test: stale snapshot + living owner must not release.
    function test_afterDeadline_butOwnerSpentSinceSnapshot_abortsAndResetsTimer() public {
        pastDeadline();
        ownerSpends(1); // a single fee since the last snapshot
        vm.expectEmit(false, false, false, true);
        emit InheritanceVault.ReleaseAborted("liveness detected");
        bool done = vault.release();
        assertFalse(done);
        assertFalse(vault.released());
        assertEq(beneficiary.balance, 0, "nothing moved");
        assertEq(vault.lastActiveTimestamp(), block.timestamp, "timer reset persisted (no revert)");
        assertEq(vault.lastKnownBalance(), owner.balance, "snapshot resynced");
        assertTrue(vault.pendingSchedule() != address(0), "heartbeat rescheduled");
        assertFalse(vault.isReleasable());
        // beneficiary waits one more full timeout
        vm.warp(vault.unlocksAt() + 1);
        assertTrue(vault.isReleasable());
    }

    function test_isReleasable_falseWhenFreshDecrease() public {
        pastDeadline();
        assertTrue(vault.isReleasable());
        ownerSpends(1);
        assertFalse(vault.isReleasable(), "view must mirror release() safety check");
    }

    function test_allowanceRevoked_reverts_noAllowance() public {
        has.setAllowance(owner, address(vault), 0);
        pastDeadline();
        vm.expectRevert(InheritanceVault.NoAllowance.selector);
        vault.release();
        assertFalse(vault.released());
    }

    function test_allowanceExceedsBalance_transfersBalance() public {
        vm.deal(owner, 80 * HBAR);
        vault.poke(); // resync so the drop isn't read as liveness
        pastDeadline();
        vault.release();
        assertEq(beneficiary.balance, 80 * HBAR);
        assertEq(owner.balance, 0);
    }

    function test_doubleRelease_reverts() public {
        pastDeadline();
        vault.release();
        vm.expectRevert(InheritanceVault.AlreadyReleased.selector);
        vault.release();
    }

    function test_hasFailure_revertsSystemContractFailed() public {
        has.setForcedCode(300); // INVALID_ALLOWANCE_OWNER_ID
        pastDeadline();
        vm.expectRevert(abi.encodeWithSelector(InheritanceVault.SystemContractFailed.selector, int64(300)));
        vault.release();
    }

    function test_htsFailure_revertsAndDoesNotMarkReleased() public {
        hts.setForcedCode(293);
        pastDeadline();
        vm.expectRevert(abi.encodeWithSelector(InheritanceVault.SystemContractFailed.selector, int64(293)));
        vault.release();
        assertFalse(vault.released(), "released flag rolled back with the revert");
    }

    function test_release_afterCancel_reverts() public {
        vm.prank(owner);
        vault.cancel();
        pastDeadline();
        vm.expectRevert(InheritanceVault.VaultCancelled.selector);
        vault.release();
    }

    function test_heartbeat_autoReleases_andEndsChain() public {
        pastDeadline();
        vault.heartbeat();
        assertTrue(vault.released());
        assertEq(beneficiary.balance, 500 * HBAR);
        assertEq(vault.pendingSchedule(), address(0), "chain ends after release");
    }

    function test_heartbeat_pastDeadline_butAlive_keepsWatching() public {
        pastDeadline();
        ownerSpends(1);
        vault.heartbeat();
        assertFalse(vault.released());
        assertTrue(vault.pendingSchedule() != address(0), "chain continues");
    }

    function test_heartbeat_pastDeadline_noAllowance_keepsWatching() public {
        // The owner may simply not have granted the allowance yet (e.g. mid-setup). The chain must survive.
        has.setAllowance(owner, address(vault), 0);
        pastDeadline();
        vm.expectEmit(false, false, false, true);
        emit InheritanceVault.ReleaseAborted("no allowance or empty account");
        vault.heartbeat();
        assertFalse(vault.released());
        assertTrue(vault.pendingSchedule() != address(0), "chain continues without allowance");
        // allowance granted later -> next heartbeat releases
        has.setAllowance(owner, address(vault), int256(500 * HBAR));
        assertTrue(fireHeartbeat());
        assertTrue(vault.released());
        assertEq(beneficiary.balance, 500 * HBAR);
    }

    function test_heartbeat_pastDeadline_htsFailure_keepsWatching_andUnsetsReleased() public {
        hts.setForcedCode(293);
        pastDeadline();
        vault.heartbeat();
        assertFalse(vault.released(), "released must be rolled back manually since nothing reverted");
        assertTrue(vault.pendingSchedule() != address(0));
        hts.setForcedCode(22);
        assertTrue(fireHeartbeat());
        assertTrue(vault.released());
    }

    function test_heartbeat_pastDeadline_hasFailure_keepsWatching() public {
        has.setForcedCode(300);
        pastDeadline();
        vault.heartbeat();
        assertFalse(vault.released());
        assertTrue(vault.pendingSchedule() != address(0));
    }

    function test_fundsNeverEnterVault_acrossLifecycle() public {
        uint256 v0 = address(vault).balance;
        vm.warp(block.timestamp + 100 days);
        ownerSpends(3 * HBAR);
        vault.poke();
        vm.prank(owner);
        vault.ping();
        pastDeadline();
        vault.release();
        assertEq(address(vault).balance, v0, "vault only ever holds its fee reserve");
    }
}
