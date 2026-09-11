// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Subset of the HIP-206 Hedera Token Service system contract at 0x167.
///         Only the atomic cryptoTransfer (v2, with HBAR TransferList) is needed.
///         Struct field order matches the official IHederaTokenService.sol exactly.
interface IHederaTokenService {
    struct AccountAmount {
        address accountID;
        int64 amount;
        bool isApproval; // true on the debit leg => spend the owner's allowance
    }

    struct NftTransfer {
        address senderAccountID;
        address receiverAccountID;
        int64 serialNumber;
        bool isApproval;
    }

    struct TokenTransferList {
        address token;
        AccountAmount[] transfers;
        NftTransfer[] nftTransfers;
    }

    struct TransferList {
        AccountAmount[] transfers;
    }

    /// @dev selector 0x0e71804f. HBAR legs must sum to zero. Amounts are TINYBARS.
    function cryptoTransfer(TransferList memory transferList, TokenTransferList[] memory tokenTransfers)
        external
        returns (int64 responseCode);
}
