// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InheritanceVault} from "../../src/InheritanceVault.sol";
import {MockHAS} from "../../src/mocks/MockHAS.sol";
import {MockHTS} from "../../src/mocks/MockHTS.sol";
import {MockHSS} from "../../src/mocks/MockHSS.sol";

abstract contract VaultBase is Test {
    address constant HTS = address(0x167);
    address constant HAS = address(0x16a);
    address constant HSS = address(0x16b);

    uint256 constant HBAR = 1e8; // tinybars
    uint256 constant TIMEOUT = 365 days;
    uint256 constant OWNER_START = 1_000 * HBAR;
    uint256 constant RESERVE = 20 * HBAR;

    address owner = makeAddr("owner");
    address beneficiary = makeAddr("beneficiary");
    address stranger = makeAddr("stranger");

    MockHAS has;
    MockHTS hts;
    MockHSS hss;
    InheritanceVault vault;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        vm.etch(HAS, address(new MockHAS()).code);
        vm.etch(HTS, address(new MockHTS()).code);
        vm.etch(HSS, address(new MockHSS()).code);
        has = MockHAS(HAS);
        hts = MockHTS(HTS);
        hss = MockHSS(HSS);
        // etched code has fresh storage: re-init the "constructor" values
        vm.store(HAS, bytes32(uint256(1)), bytes32(uint256(22))); // forcedCode
        vm.store(HTS, bytes32(uint256(0)), bytes32(uint256(22))); // forcedCode
        vm.store(HSS, bytes32(uint256(5)), bytes32(uint256(22))); // nextCode

        vm.deal(owner, OWNER_START + RESERVE);
        vm.prank(owner);
        vault = new InheritanceVault{value: RESERVE}(owner, beneficiary, TIMEOUT, false);
        has.setAllowance(owner, address(vault), int256(500 * HBAR));
    }

    // ---- helpers ----
    function ownerSpends(uint256 tinybars) internal {
        vm.deal(owner, owner.balance - tinybars);
    }

    function ownerReceives(uint256 tinybars) internal {
        vm.deal(owner, owner.balance + tinybars);
    }

    function pastDeadline() internal {
        vm.warp(vault.unlocksAt() + 1);
    }

    /// @dev Fire the pending schedule the way the network would.
    function fireHeartbeat() internal returns (bool ok) {
        address s = vault.pendingSchedule();
        assertTrue(s != address(0), "no pending schedule");
        vm.warp(vault.scheduledFor());
        ok = hss.execute(s);
    }

    function _assertScheduleInvariant() internal view {
        if (vault.pendingSchedule() != address(0)) {
            assertLe(vault.scheduledFor() - block.timestamp, vault.MAX_INTERVAL(), "interval > MAX_INTERVAL");
            assertGt(vault.scheduledFor(), block.timestamp, "target not in future");
        }
    }
}
