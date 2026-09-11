// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Foundry-only stand-in for the Hedera Schedule Service at 0x16b.
///         Records schedules; tests fire them with execute(). Capacity and response codes are scriptable.
contract MockHSS {
    struct Sched {
        address to;
        uint256 expiry;
        uint256 gasLimit;
        bytes callData;
        bool executed;
        bool deleted;
    }

    mapping(address => Sched) public schedules;
    address[] public created;
    uint256 public deletes;

    // scripting knobs
    mapping(uint256 => bool) public busySecond; // hasScheduleCapacity(second) => false
    uint256 public busyUntil; // every second <= busyUntil is busy
    int64 public nextCode = 22; // returned by the next scheduleCall
    uint256 public failCount; // return nextCode for this many scheduleCalls, then SUCCESS

    function setBusy(uint256 second, bool b) external {
        busySecond[second] = b;
    }

    function setBusyUntil(uint256 t) external {
        busyUntil = t;
    }

    function failNext(uint256 n, int64 code) external {
        failCount = n;
        nextCode = code;
    }

    function hasScheduleCapacity(uint256 expirySecond, uint256) external view returns (bool) {
        if (expirySecond <= block.timestamp) return false;
        if (expirySecond <= busyUntil) return false;
        return !busySecond[expirySecond];
    }

    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64, bytes memory callData)
        external
        returns (int64, address)
    {
        if (failCount > 0) {
            failCount--;
            return (nextCode, address(0));
        }
        if (expirySecond <= block.timestamp) return (307, address(0));
        if (expirySecond > block.timestamp + 62 days) return (306, address(0));
        address id = address(uint160(uint256(keccak256(abi.encode(created.length, to, expirySecond)))));
        schedules[id] = Sched(to, expirySecond, gasLimit, callData, false, false);
        created.push(id);
        return (22, id);
    }

    function deleteSchedule(address id) external returns (int64) {
        Sched storage s = schedules[id];
        if (s.to == address(0)) return 201; // INVALID_SCHEDULE_ID
        if (s.executed) return 213;
        if (s.deleted) return 212;
        s.deleted = true;
        deletes++;
        return 22;
    }

    // ---- test helpers ----
    function count() external view returns (uint256) {
        return created.length;
    }

    function last() external view returns (address) {
        return created[created.length - 1];
    }

    function isLive(address id) external view returns (bool) {
        Sched storage s = schedules[id];
        return s.to != address(0) && !s.executed && !s.deleted;
    }

    /// @dev Execute a schedule as the network would. Caller must have warped to >= expiry.
    function execute(address id) external returns (bool ok) {
        Sched storage s = schedules[id];
        require(s.to != address(0) && !s.executed && !s.deleted, "not executable");
        require(block.timestamp >= s.expiry, "not due");
        s.executed = true;
        (ok,) = s.to.call{gas: s.gasLimit}(s.callData);
    }
}
