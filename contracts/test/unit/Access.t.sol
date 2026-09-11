// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {VaultBase} from "./VaultBase.t.sol";
import {InheritanceVault} from "../../src/InheritanceVault.sol";

contract AccessTest is VaultBase {
    function test_onlyOwner_ping() public {
        vm.prank(stranger);
        vm.expectRevert(InheritanceVault.NotOwner.selector);
        vault.ping();
    }

    function test_onlyOwner_setBeneficiary() public {
        vm.prank(stranger);
        vm.expectRevert(InheritanceVault.NotOwner.selector);
        vault.setBeneficiary(stranger);
    }

    function test_onlyOwner_setTimeout() public {
        vm.prank(stranger);
        vm.expectRevert(InheritanceVault.NotOwner.selector);
        vault.setTimeout(2 days);
    }

    function test_onlyOwner_cancel() public {
        vm.prank(stranger);
        vm.expectRevert(InheritanceVault.NotOwner.selector);
        vault.cancel();
    }

    function test_onlyOwner_withdrawFeeReserve() public {
        vm.prank(stranger);
        vm.expectRevert(InheritanceVault.NotOwner.selector);
        vault.withdrawFeeReserve(1);
    }

    function test_permissionless_heartbeat_poke_release() public {
        vm.prank(stranger);
        vault.poke();
        vm.prank(stranger);
        vault.heartbeat();
        pastDeadline();
        vm.prank(stranger);
        vault.release();
        assertEq(beneficiary.balance, 500 * HBAR, "funds only ever go to beneficiary");
        assertEq(stranger.balance, 0);
    }

    function test_setBeneficiary_countsAsLiveness() public {
        vm.warp(block.timestamp + 100 days);
        ownerReceives(5 * HBAR);
        address next = makeAddr("next");
        vm.prank(owner);
        vault.setBeneficiary(next);
        assertEq(vault.beneficiary(), next);
        assertEq(vault.lastActiveTimestamp(), block.timestamp);
        assertEq(vault.lastKnownBalance(), owner.balance);
    }

    function test_setBeneficiary_rejectsZeroAndSystem() public {
        vm.startPrank(owner);
        vm.expectRevert(InheritanceVault.ZeroAddress.selector);
        vault.setBeneficiary(address(0));
        vm.expectRevert(abi.encodeWithSelector(InheritanceVault.SystemAccount.selector, address(0x2)));
        vault.setBeneficiary(address(0x2));
        vm.stopPrank();
    }

    function test_constructor_validation() public {
        vm.expectRevert(InheritanceVault.InvalidTimeout.selector);
        new InheritanceVault(owner, beneficiary, 0, false);
        vm.expectRevert(InheritanceVault.InvalidTimeout.selector);
        new InheritanceVault(owner, beneficiary, 30 minutes, false);
        // demo mode relaxes to 60s
        new InheritanceVault(owner, beneficiary, 3 minutes, true);
        vm.expectRevert(InheritanceVault.ZeroAddress.selector);
        new InheritanceVault(owner, address(0), TIMEOUT, false);
    }

    function test_cancel_refundsReserve_deletesSchedule_blocksEverything() public {
        address sched = vault.pendingSchedule();
        uint256 before = owner.balance;
        vm.prank(owner);
        vault.cancel();
        assertTrue(vault.cancelled());
        assertEq(owner.balance, before + RESERVE);
        assertEq(address(vault).balance, 0);
        assertFalse(hss.isLive(sched));
        vm.prank(owner);
        vm.expectRevert(InheritanceVault.VaultCancelled.selector);
        vault.ping();
        vm.expectRevert(InheritanceVault.VaultCancelled.selector);
        vault.poke();
    }

    function test_withdrawFeeReserve_countsAsLiveness_andBounds() public {
        vm.warp(block.timestamp + 10 days);
        vm.startPrank(owner);
        vm.expectRevert(InheritanceVault.InsufficientFeeReserve.selector);
        vault.withdrawFeeReserve(RESERVE + 1);
        vault.withdrawFeeReserve(5 * HBAR);
        vm.stopPrank();
        assertEq(address(vault).balance, RESERVE - 5 * HBAR);
        assertEq(vault.lastActiveTimestamp(), block.timestamp);
    }

    function test_fundFeeReserve_anyone() public {
        vm.deal(stranger, 3 * HBAR);
        vm.prank(stranger);
        vault.fundFeeReserve{value: 3 * HBAR}();
        assertEq(vault.feeReserve(), RESERVE + 3 * HBAR);
    }

    function test_status_transitions() public {
        assertEq(uint8(vault.status()), uint8(InheritanceVault.Status.Active));
        vm.warp(vault.unlocksAt() - 60 days);
        assertEq(uint8(vault.status()), uint8(InheritanceVault.Status.Warning));
        vm.warp(vault.unlocksAt() - 10 days);
        assertEq(uint8(vault.status()), uint8(InheritanceVault.Status.Critical));
        pastDeadline();
        assertEq(uint8(vault.status()), uint8(InheritanceVault.Status.Releasable));
        vault.release();
        assertEq(uint8(vault.status()), uint8(InheritanceVault.Status.Released));
    }
}
