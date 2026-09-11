// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {VaultBase} from "./VaultBase.t.sol";
import {InheritanceVault} from "../../src/InheritanceVault.sol";

contract SchedulingTest is VaultBase {
    function test_constructor_schedulesFirstHeartbeat_30dBand() public view {
        assertTrue(vault.pendingSchedule() != address(0));
        assertEq(vault.scheduledFor(), block.timestamp + 30 days);
        assertEq(vault.currentInterval(), 30 days);
        _assertScheduleInvariant();
    }

    function test_intervalBands() public {
        // remaining 365d -> 30d
        assertEq(vault.currentInterval(), 30 days);
        vm.warp(vault.unlocksAt() - 200 days);
        assertEq(vault.currentInterval(), 30 days);
        vm.warp(vault.unlocksAt() - 60 days);
        assertEq(vault.currentInterval(), 7 days);
        vm.warp(vault.unlocksAt() - 10 days);
        assertEq(vault.currentInterval(), 1 days);
        vm.warp(vault.unlocksAt() + 5 days);
        assertEq(vault.currentInterval(), 1 days, "past deadline stays in the tight band");
    }

    function testFuzz_intervalNeverZeroNorAboveMax(uint64 dt) public {
        vm.warp(uint256(block.timestamp) + dt);
        uint256 i = vault.currentInterval();
        assertGt(i, 0);
        assertLe(i, vault.MAX_INTERVAL());
    }

    function test_heartbeatChain_reschedulesEachLink() public {
        uint256 n0 = hss.count();
        for (uint256 i = 0; i < 5; i++) {
            assertTrue(fireHeartbeat(), "heartbeat call failed");
            _assertScheduleInvariant();
        }
        assertEq(hss.count(), n0 + 5);
        assertFalse(vault.released());
    }

    function test_fullLifecycle_autonomous_releaseWithoutAnyClick() public {
        // Owner never touches anything. Chain runs down; interval tightens; release fires from a heartbeat.
        uint256 links;
        uint256 lastInterval = type(uint256).max;
        while (!vault.released()) {
            uint256 iv = vault.scheduledFor() - block.timestamp;
            assertLe(iv, lastInterval + 0, "interval must be non-increasing as deadline nears");
            lastInterval = iv;
            assertTrue(fireHeartbeat());
            links++;
            require(links < 200, "runaway");
        }
        assertEq(beneficiary.balance, 500 * HBAR);
        assertEq(vault.pendingSchedule(), address(0));
        // 365d: ~9 x 30d to reach 90d, then ~8-9 x 7d to 30d, then ~30 x 1d = roughly 48 links
        assertGt(links, 40);
        assertLt(links, 60);
    }

    function test_passiveLiveness_fromHeartbeat_resetsTimer() public {
        uint256 t0 = vault.lastActiveTimestamp();
        vm.warp(block.timestamp + 10 days);
        ownerSpends(HBAR / 100); // paid a fee somewhere
        assertTrue(fireHeartbeat());
        assertGt(vault.lastActiveTimestamp(), t0);
    }

    function test_capacityBusy_retriesWithBackoff() public {
        uint256 ideal = block.timestamp + 30 days;
        hss.setBusy(ideal, true);
        hss.setBusy(ideal + 60 + 0, true); // may or may not hit jitter; ensure ideal is skipped anyway
        vm.prank(owner);
        vault.ping();
        assertTrue(vault.pendingSchedule() != address(0), "should still schedule");
        assertGt(vault.scheduledFor(), ideal, "backed off past the busy second");
        _assertScheduleInvariant();
    }

    function test_scheduleCallNonSuccess_emitsAndDoesNotRevert() public {
        hss.failNext(2, 370); // SCHEDULE_EXPIRY_IS_BUSY twice
        vm.expectEmit(false, false, false, false);
        emit InheritanceVault.HeartbeatSchedulingFailed(370, 0);
        vm.prank(owner);
        vault.ping();
        assertTrue(vault.pendingSchedule() != address(0), "third attempt succeeds");
    }

    function test_allRetriesExhausted_heartbeatStillCompletes() public {
        hss.failNext(100, 370);
        assertTrue(fireHeartbeat(), "heartbeat must not revert when scheduling fails");
        assertEq(vault.pendingSchedule(), address(0), "chain is dead");
        assertFalse(vault.released());
    }

    function test_poke_restartsDeadChain() public {
        hss.failNext(100, 370);
        fireHeartbeat();
        assertEq(vault.pendingSchedule(), address(0));
        hss.failNext(0, 22);
        vm.warp(block.timestamp + 3 days);
        vm.prank(stranger);
        vault.poke();
        assertTrue(vault.pendingSchedule() != address(0), "poke restarted the chain");
        _assertScheduleInvariant();
    }

    function test_pokeSpam_createsNoNewSchedules() public {
        uint256 n0 = hss.count();
        for (uint256 i = 0; i < 20; i++) {
            vm.prank(stranger);
            vault.poke();
        }
        assertEq(hss.count(), n0, "griefer must not drain the reserve via poke");
    }

    function test_poke_afterScheduledSecondPassedWithoutFiring_reschedules() public {
        uint256 n0 = hss.count();
        vm.warp(vault.scheduledFor() + 1 hours); // network never executed it
        vault.poke();
        assertEq(hss.count(), n0 + 1);
    }

    function test_ping_deletesPendingAndReschedules() public {
        address old = vault.pendingSchedule();
        vm.warp(block.timestamp + 1 days);
        vm.prank(owner);
        vault.ping();
        assertFalse(hss.isLive(old), "old schedule deleted");
        assertTrue(vault.pendingSchedule() != old);
        assertEq(hss.deletes(), 1);
    }

    function test_manualHeartbeatEarly_doesNotForkChain() public {
        address old = vault.pendingSchedule();
        vm.warp(block.timestamp + 1 days);
        vault.heartbeat();
        assertFalse(hss.isLive(old), "early manual heartbeat must delete the pending one");
        assertTrue(vault.pendingSchedule() != address(0));
    }

    function test_staleScheduleAfterRelease_isNoop() public {
        pastDeadline();
        vault.release();
        // pretend a stale schedule fires
        vault.heartbeat();
        assertEq(hss.count(), 1, "no new schedules after release");
    }

    function test_setTimeout_reschedulesBand() public {
        vm.prank(owner);
        vault.setTimeout(40 days); // remaining 40d -> 7d band
        assertEq(vault.scheduledFor(), block.timestamp + 7 days);
    }
}
