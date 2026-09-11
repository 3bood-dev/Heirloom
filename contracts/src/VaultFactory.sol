// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {InheritanceVault} from "./InheritanceVault.sol";

/// @title VaultFactory
/// @notice Deploys InheritanceVaults and indexes them by owner AND by beneficiary, so a beneficiary who
///         was never told about the vault can find it just by connecting their wallet.
contract VaultFactory {
    bool public immutable demoMode;

    address[] public allVaults;
    mapping(address => bool) public isVault;
    mapping(address => address[]) private _byOwner;
    mapping(address => address[]) private _byBeneficiary;

    event VaultDeployed(address indexed owner, address indexed beneficiary, address indexed vault, uint256 timeout);
    event BeneficiaryIndexUpdated(address indexed vault, address indexed previous, address indexed next);

    error NotAVault();

    constructor(bool _demoMode) {
        demoMode = _demoMode;
    }

    /// @notice Signature 1 of setup: deploy the vault and fund its fee reserve with msg.value.
    ///         Signature 2 (the HBAR allowance) is made by the owner's wallet to the returned address.
    function createVault(address beneficiary, uint256 timeout) external payable returns (address vault) {
        vault = address(new InheritanceVault{value: msg.value}(msg.sender, beneficiary, timeout, demoMode));
        allVaults.push(vault);
        isVault[vault] = true;
        _byOwner[msg.sender].push(vault);
        _byBeneficiary[beneficiary].push(vault);
        emit VaultDeployed(msg.sender, beneficiary, vault, timeout);
    }

    /// @dev Called by a vault when its owner changes the beneficiary, keeping the claim index accurate.
    function onBeneficiaryChanged(address previous, address next) external {
        if (!isVault[msg.sender]) revert NotAVault();
        address[] storage list = _byBeneficiary[previous];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == msg.sender) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        _byBeneficiary[next].push(msg.sender);
        emit BeneficiaryIndexUpdated(msg.sender, previous, next);
    }

    function vaultsByOwner(address owner) external view returns (address[] memory) {
        return _byOwner[owner];
    }

    function vaultsByBeneficiary(address beneficiary) external view returns (address[] memory) {
        return _byBeneficiary[beneficiary];
    }

    function count() external view returns (uint256) {
        return allVaults.length;
    }
}
