// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice HIP-1215 Hedera Schedule Service system contract at 0x16b
///         (address per docs.hedera.com system smart contracts reference; confirmed live on testnet).
///         These calls NEVER revert: always check responseCode == 22 (SUCCESS).
///         expirySecond is an ABSOLUTE consensus second, must be strictly in the future,
///         and at most scheduling.maxExpirationFutureSeconds (~2 months) ahead.
interface IHederaScheduleService {
    /// @dev selector 0x6f5bfde8. The calling contract pays for the future execution.
    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
        external
        returns (int64 responseCode, address scheduleAddress);

    /// @dev selector 0xe6599c18
    function scheduleCallWithPayer(
        address to,
        address payer,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);

    /// @dev selector 0x105772b2
    function executeCallOnPayerSignature(
        address to,
        address payer,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);

    /// @dev selector 0x72d42394
    function deleteSchedule(address scheduleAddress) external returns (int64 responseCode);

    /// @dev selector 0xdfb4a999. Cheap (~cold SLOAD); if true, a valid scheduleCall for that second succeeds.
    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) external view returns (bool);
}

/// @notice Redirect form callable at the schedule's own address.
interface IHederaScheduleRedirect {
    /// @dev selector 0xc61dea85
    function deleteSchedule() external returns (int64 responseCode);
}
