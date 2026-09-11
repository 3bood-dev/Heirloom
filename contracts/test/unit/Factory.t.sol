// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {VaultBase} from "./VaultBase.t.sol";
import {InheritanceVault} from "../../src/InheritanceVault.sol";
import {VaultFactory} from "../../src/VaultFactory.sol";

contract FactoryTest is VaultBase {
    VaultFactory factory;

    function setUp() public override {
        super.setUp();
        factory = new VaultFactory(false);
    }

    function test_createVault_indexesBothSides_andFundsReserve() public {
        vm.deal(owner, OWNER_START + RESERVE);
        vm.prank(owner);
        address v = factory.createVault{value: RESERVE}(beneficiary, TIMEOUT);
        InheritanceVault iv = InheritanceVault(payable(v));
        assertEq(iv.owner(), owner, "owner is the caller, not the factory");
        assertEq(iv.beneficiary(), beneficiary);
        assertEq(iv.registry(), address(factory));
        assertEq(v.balance, RESERVE);
        assertEq(iv.lastKnownBalance(), OWNER_START, "snapshot is the owner's balance, not the factory's");
        assertEq(factory.vaultsByOwner(owner).length, 1);
        assertEq(factory.vaultsByBeneficiary(beneficiary)[0], v);
        assertTrue(factory.isVault(v));
        assertTrue(iv.pendingSchedule() != address(0), "first heartbeat scheduled from constructor");
    }

    function test_beneficiaryChange_updatesIndex() public {
        vm.prank(owner);
        address v = factory.createVault(beneficiary, TIMEOUT);
        address next = makeAddr("next");
        vm.prank(owner);
        InheritanceVault(payable(v)).setBeneficiary(next);
        assertEq(factory.vaultsByBeneficiary(beneficiary).length, 0);
        assertEq(factory.vaultsByBeneficiary(next)[0], v);
    }

    function test_onBeneficiaryChanged_rejectsNonVaults() public {
        vm.expectRevert(VaultFactory.NotAVault.selector);
        factory.onBeneficiaryChanged(owner, beneficiary);
    }

    function test_directDeploy_hasNoRegistry() public view {
        assertEq(vault.registry(), address(0));
    }

    function test_demoFactory_deploysDemoVaults() public {
        VaultFactory demo = new VaultFactory(true);
        vm.prank(owner);
        address v = demo.createVault(beneficiary, 3 minutes);
        assertTrue(InheritanceVault(payable(v)).demoMode());
        assertEq(InheritanceVault(payable(v)).currentInterval(), 15);
    }
}
