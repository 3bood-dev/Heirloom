// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IHederaAccountService} from "../src/interfaces/IHederaAccountService.sol";
import {IHederaTokenService} from "../src/interfaces/IHederaTokenService.sol";
import {IHederaScheduleService} from "../src/interfaces/IHederaScheduleService.sol";

/// @notice THROWAWAY Phase-0 probe. Exercises every Hedera primitive the vault depends on.
///         Not part of the production codebase.
contract GateProbe {
    address constant HTS = address(0x167);
    address constant HAS = address(0x16a);
    address constant HSS = address(0x16b);

    uint256 public ticks;
    uint256 public lastTick;
    address public lastSchedule;
    uint256 public lastScheduledFor;

    event Ticked(uint256 n, uint256 timestamp, address caller);
    event Scheduled(int64 code, address schedule, uint256 target);
    event AllowanceRead(int64 code, int256 amount);
    event Spent(int64 code, address from, address to, int64 tinybars);

    receive() external payable {}

    // ---------- GATE-1: can a contract read an EOA's balance? ----------
    function probeBalance(address account) external view returns (uint256 weibars) {
        return account.balance;
    }

    // ---------- GATE-2 step 2: read live allowance via HAS ----------
    function readAllowance(address owner) external returns (int64 code, int256 amount) {
        (bool ok, bytes memory res) = HAS.call(
            abi.encodeWithSelector(IHederaAccountService.hbarAllowance.selector, owner, address(this))
        );
        require(ok, "HAS call failed");
        (code, amount) = abi.decode(res, (int64, int256));
        emit AllowanceRead(code, amount);
    }

    // ---------- GATE-2 step 3: spend allowance owner -> to, never touching this contract ----------
    function spendAllowance(address owner, address to, int64 tinybars) external returns (int64 code) {
        IHederaTokenService.AccountAmount[] memory t = new IHederaTokenService.AccountAmount[](2);
        t[0] = IHederaTokenService.AccountAmount({accountID: owner, amount: -tinybars, isApproval: true});
        t[1] = IHederaTokenService.AccountAmount({accountID: to, amount: tinybars, isApproval: false});
        IHederaTokenService.TransferList memory hbar = IHederaTokenService.TransferList({transfers: t});
        IHederaTokenService.TokenTransferList[] memory none = new IHederaTokenService.TokenTransferList[](0);

        (bool ok, bytes memory res) = HTS.call(abi.encodeWithSelector(IHederaTokenService.cryptoTransfer.selector, hbar, none));
        require(ok, "HTS call failed");
        code = abi.decode(res, (int64));
        emit Spent(code, owner, to, tinybars);
    }

    // ---------- GATE-3: HIP-1215 self-scheduling ----------
    function hasCapacity(uint256 target, uint256 gas) external view returns (bool) {
        return IHederaScheduleService(HSS).hasScheduleCapacity(target, gas);
    }

    function scheduleTick(uint256 delaySeconds, uint256 gasLimit) external returns (int64 code, address sched) {
        uint256 target = block.timestamp + delaySeconds;
        (code, sched) = IHederaScheduleService(HSS).scheduleCall(
            address(this), target, gasLimit, 0, abi.encodeCall(this.tick, ())
        );
        lastSchedule = sched;
        lastScheduledFor = target;
        emit Scheduled(code, sched, target);
    }

    /// @dev Also tests the chain pattern: tick() reschedules itself `chainRemaining` more times.
    uint256 public chainRemaining;
    uint256 public chainDelay;
    uint256 public chainGas; // gasLimit for each chained self-call (must cover a scheduleCall, ~1.5M)

    function startChain(uint256 links, uint256 delaySeconds, uint256 gasLimit) external returns (int64 code, address sched) {
        chainRemaining = links;
        chainDelay = delaySeconds;
        chainGas = gasLimit;
        uint256 target = block.timestamp + delaySeconds;
        (code, sched) = IHederaScheduleService(HSS).scheduleCall(
            address(this), target, gasLimit, 0, abi.encodeCall(this.tick, ())
        );
        lastSchedule = sched;
        lastScheduledFor = target;
        emit Scheduled(code, sched, target);
    }

    function tick() external {
        ticks += 1;
        lastTick = block.timestamp;
        emit Ticked(ticks, block.timestamp, msg.sender);
        if (chainRemaining > 0) {
            chainRemaining -= 1;
            uint256 target = block.timestamp + chainDelay;
            (int64 code, address sched) = IHederaScheduleService(HSS).scheduleCall(
                address(this), target, chainGas, 0, abi.encodeCall(this.tick, ())
            );
            lastSchedule = sched;
            lastScheduledFor = target;
            emit Scheduled(code, sched, target);
        }
    }
}
