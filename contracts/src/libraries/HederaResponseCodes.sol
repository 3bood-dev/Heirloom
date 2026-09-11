// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Ordinals from HAPI ResponseCodeEnum (hiero-consensus-node response_code.proto).
///         Only SUCCESS is load-bearing in contract logic; the rest exist for readable diagnostics.
library HederaResponseCodes {
    int64 internal constant SUCCESS = 22;

    // generic
    int64 internal constant INVALID_SIGNATURE = 7;
    int64 internal constant INSUFFICIENT_TX_FEE = 9;
    int64 internal constant INSUFFICIENT_PAYER_BALANCE = 10;
    int64 internal constant INVALID_ACCOUNT_ID = 15;
    int64 internal constant INVALID_CONTRACT_ID = 16;
    int64 internal constant INSUFFICIENT_ACCOUNT_BALANCE = 28;
    int64 internal constant INSUFFICIENT_GAS = 30;
    int64 internal constant CONTRACT_REVERT_EXECUTED = 33;
    int64 internal constant ACCOUNT_DELETED = 72;
    int64 internal constant ACCOUNT_REPEATED_IN_ACCOUNT_AMOUNTS = 74;
    int64 internal constant TRANSFER_LIST_SIZE_LIMIT_EXCEEDED = 92;
    int64 internal constant TRANSFERS_NOT_ZERO_SUM_FOR_TOKEN = 173;
    int64 internal constant INVALID_TRANSFER_ACCOUNT_ID = 285;

    // allowances (HIP-906 / cryptoTransfer isApproval)
    int64 internal constant NEGATIVE_ALLOWANCE_AMOUNT = 290;
    int64 internal constant SPENDER_DOES_NOT_HAVE_ALLOWANCE = 292;
    int64 internal constant AMOUNT_EXCEEDS_ALLOWANCE = 293;
    int64 internal constant INVALID_ALLOWANCE_OWNER_ID = 300;
    int64 internal constant INVALID_ALLOWANCE_SPENDER_ID = 301;

    // scheduling (HIP-423 / HIP-1215)
    int64 internal constant INVALID_SCHEDULE_ID = 201;
    int64 internal constant IDENTICAL_SCHEDULE_ALREADY_CREATED = 210;
    int64 internal constant SCHEDULE_ALREADY_DELETED = 212;
    int64 internal constant SCHEDULE_ALREADY_EXECUTED = 213;
    int64 internal constant SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE = 306;
    int64 internal constant SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME = 307;
    int64 internal constant SCHEDULE_FUTURE_THROTTLE_EXCEEDED = 308;
    int64 internal constant SCHEDULE_FUTURE_GAS_LIMIT_EXCEEDED = 309;
    int64 internal constant MAX_ENTITIES_IN_PRICE_REGIME_HAVE_BEEN_CREATED = 325;
    int64 internal constant SCHEDULE_EXPIRY_IS_BUSY = 370;
    int64 internal constant MISSING_EXPIRY_TIME = 372;
}
