// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IHederaAccountService} from "./interfaces/IHederaAccountService.sol";
import {IHederaTokenService} from "./interfaces/IHederaTokenService.sol";
import {IHederaScheduleService} from "./interfaces/IHederaScheduleService.sol";
import {HederaResponseCodes} from "./libraries/HederaResponseCodes.sol";
import {TinybarMath} from "./libraries/TinybarMath.sol";

/// @title InheritanceVault
/// @notice Non-custodial HBAR inheritance switch. Holds only its own fee reserve.
///         The owner grants this contract an HBAR allowance (HIP-906) from their own wallet;
///         funds stay in the owner's account until a dead-man's switch fires, then move
///         owner -> beneficiary directly via HTS cryptoTransfer(isApproval=true).
///         Liveness is detected passively (owner.balance decreased => key holder acted) or by ping().
///         The contract keeps itself alive with HIP-1215 scheduled self-calls (heartbeat()).
///
/// @dev UNITS: inside the Hedera EVM, address.balance / msg.value / call{value:} are TINYBARS,
///      identical to the int64 amounts used by HTS/HAS. No scaling happens in this contract.
contract InheritanceVault {
    using TinybarMath for uint256;
    using TinybarMath for int256;

    // ------------------------------------------------------------------ system contracts
    address internal constant HTS = address(0x167);
    address internal constant HAS = address(0x16a);
    address internal constant HSS = address(0x16b);
    /// @dev Accounts 0.0.0 .. 0.0.749 are system accounts and read as zero balance from the EVM.
    address internal constant FIRST_USER_ACCOUNT = address(0x2EE);

    int64 internal constant SUCCESS = HederaResponseCodes.SUCCESS;
    uint256 public constant MAX_INTERVAL = 45 days; // measured HSS horizon ~62 days
    /// @dev Measured on testnet (SPIKE_RESULTS.md): a heartbeat that reschedules uses ~1.55M gas, almost all of
    ///      it the HIP-1215 scheduleCall, and is charged on gas USED (~114 tinybar/gas => ~1.75 HBAR per beat;
    ///      the final releasing beat cost 0.09). The limit only sets the upfront affordability check
    ///      (INSUFFICIENT_PAYER_BALANCE if reserve < limit x price), so 2.5M is headroom, not cost.
    uint256 public constant HEARTBEAT_GAS = 2_500_000;
    /// @dev Never attempt scheduleCall with less than this left: an out-of-gas would revert the whole
    ///      heartbeat, losing the liveness update and killing the chain in one stroke.
    uint256 internal constant SCHEDULE_CALL_GAS_FLOOR = 1_700_000;
    uint8 internal constant MAX_SCHEDULE_RETRIES = 5;

    // ------------------------------------------------------------------ state
    address public immutable owner;
    bool public immutable demoMode;
    /// @dev The deployer (VaultFactory) if any; notified on beneficiary changes so its index stays correct.
    address public immutable registry;
    address public beneficiary;
    uint256 public timeout; // seconds
    uint256 public lastActiveTimestamp; // reset on liveness
    uint256 public lastKnownBalance; // tinybars, always == owner.balance at last observation
    address public pendingSchedule; // HIP-1215 schedule address, or address(0)
    uint256 public scheduledFor; // consensus second the pending schedule targets
    bool public released;
    bool public cancelled;

    enum Status {
        Active,
        Warning,
        Critical,
        Releasable,
        Released,
        Cancelled
    }

    // ------------------------------------------------------------------ events
    event VaultCreated(address indexed owner, address indexed beneficiary, uint256 timeout);
    event LivenessDetected(uint256 previousBalance, uint256 newBalance, uint256 newDeadline);
    event Pinged(uint256 newDeadline);
    event SnapshotResynced(uint256 newBalance);
    event HeartbeatScheduled(address indexed schedule, uint256 targetSecond, uint256 interval);
    event HeartbeatSchedulingFailed(int64 responseCode, uint256 attemptedSecond);
    event HeartbeatExecuted(uint256 timestamp, bool livenessFound);
    event ReleaseAborted(string reason);
    event Released(address indexed beneficiary, int64 amountTinybars);
    event BeneficiaryChanged(address indexed previous, address indexed next);
    event TimeoutChanged(uint256 previous, uint256 next);
    event Cancelled();
    event FeeReserveFunded(address indexed from, uint256 amount);
    event FeeReserveWithdrawn(uint256 amount);

    // ------------------------------------------------------------------ errors
    error NotOwner();
    error AlreadyReleased();
    error VaultCancelled();
    error ZeroAddress();
    error SystemAccount(address account);
    error InvalidTimeout();
    error DeadlineNotReached(uint256 unlocksAt);
    error OwnerIsAlive();
    error NoAllowance();
    error SystemContractFailed(int64 responseCode);
    error InsufficientFeeReserve();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenLive() {
        if (released) revert AlreadyReleased();
        if (cancelled) revert VaultCancelled();
        _;
    }

    // ------------------------------------------------------------------ constructor
    /// @param _owner       the account whose HBAR is covered (grants the allowance to this vault)
    /// @param _beneficiary receives the HBAR when the switch fires
    /// @param _timeout     seconds of inactivity before release
    /// @param _demoMode    compressed interval table + relaxed minimum timeout (demo only)
    constructor(address _owner, address _beneficiary, uint256 _timeout, bool _demoMode) payable {
        _validateAccount(_owner);
        _validateAccount(_beneficiary);
        if (_timeout == 0) revert InvalidTimeout();
        if (_timeout < (_demoMode ? 60 : 1 hours)) revert InvalidTimeout();

        owner = _owner;
        demoMode = _demoMode;
        registry = msg.sender.code.length > 0 ? msg.sender : address(0);
        beneficiary = _beneficiary;
        timeout = _timeout;
        lastActiveTimestamp = block.timestamp;
        lastKnownBalance = _owner.balance;

        emit VaultCreated(_owner, _beneficiary, _timeout);
        if (msg.value > 0) emit FeeReserveFunded(msg.sender, msg.value);
        _scheduleNextHeartbeat();
    }

    receive() external payable {
        emit FeeReserveFunded(msg.sender, msg.value);
    }

    // ------------------------------------------------------------------ owner actions
    /// @notice Manual "I am alive". Works with zero external infrastructure.
    function ping() external onlyOwner whenLive {
        lastActiveTimestamp = block.timestamp;
        _resync();
        _cancelPendingSchedule();
        _scheduleNextHeartbeat();
        emit Pinged(lastActiveTimestamp + timeout);
    }

    function setBeneficiary(address next) external onlyOwner whenLive {
        _validateAccount(next);
        address previous = beneficiary;
        emit BeneficiaryChanged(previous, next);
        beneficiary = next;
        _markAlive();
        if (registry != address(0)) {
            // best effort; the vault must keep working even if the registry is gone
            registry.call(abi.encodeWithSignature("onBeneficiaryChanged(address,address)", previous, next));
        }
    }

    function setTimeout(uint256 next) external onlyOwner whenLive {
        if (next == 0 || next < (demoMode ? 60 : 1 hours)) revert InvalidTimeout();
        emit TimeoutChanged(timeout, next);
        timeout = next;
        _markAlive();
        _cancelPendingSchedule();
        _scheduleNextHeartbeat();
    }

    /// @notice Permanently disables the vault and refunds the fee reserve.
    /// @dev The AUTHORITATIVE revocation is the owner setting the HBAR allowance to 0 from their wallet;
    ///      that works at the ledger level regardless of this contract.
    function cancel() external onlyOwner whenLive {
        cancelled = true;
        _cancelPendingSchedule();
        emit Cancelled();
        uint256 bal = address(this).balance;
        if (bal > 0) {
            (bool ok,) = payable(owner).call{value: bal}("");
            if (!ok) revert TransferFailed();
            emit FeeReserveWithdrawn(bal);
        }
    }

    function fundFeeReserve() external payable {
        emit FeeReserveFunded(msg.sender, msg.value);
    }

    /// @param amount tinybars
    function withdrawFeeReserve(uint256 amount) external onlyOwner {
        if (amount > address(this).balance) revert InsufficientFeeReserve();
        if (!released && !cancelled) _markAlive();
        (bool ok,) = payable(owner).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit FeeReserveWithdrawn(amount);
    }

    // ------------------------------------------------------------------ permissionless actions
    /// @notice Manual liveness check. Restarts a dead heartbeat chain. Never reverts on "no liveness".
    function poke() external whenLive {
        _checkLiveness();
        if (pendingSchedule == address(0) || block.timestamp >= scheduledFor) {
            pendingSchedule = address(0);
            _scheduleNextHeartbeat();
        }
    }

    /// @notice Scheduled entry point (HIP-1215 self-call). Anyone may call it; worst case is a redundant check.
    function heartbeat() external {
        if (released || cancelled) return; // a stale schedule firing after the end; nothing to do
        // If invoked manually before the pending schedule is due, drop that schedule so two chains never run.
        _cancelPendingSchedule();
        bool alive = _checkLiveness();
        emit HeartbeatExecuted(block.timestamp, alive);
        if (block.timestamp > lastActiveTimestamp + timeout) {
            // Never revert here: a reverted heartbeat loses the liveness update AND kills the chain.
            // Whatever stops the release (owner alive, no allowance yet, system contract hiccup) we keep watching.
            (ReleaseOutcome outcome,) = _tryRelease();
            if (outcome != ReleaseOutcome.Done) _scheduleNextHeartbeat();
            return;
        }
        _scheduleNextHeartbeat();
    }

    /// @notice Manual release trigger for the beneficiary (or anyone). Reverts before the deadline.
    /// @return done true if the transfer happened.
    /// @dev Deviation from the draft spec: a fresh liveness detection does NOT revert, because a revert
    ///      would discard the very snapshot resync that makes the next attempt safe. Instead the timer is
    ///      reset, ReleaseAborted is emitted, and false is returned. Use isReleasable() to pre-check.
    function release() external whenLive returns (bool done) {
        uint256 deadline = lastActiveTimestamp + timeout;
        if (block.timestamp <= deadline) revert DeadlineNotReached(deadline);
        (ReleaseOutcome outcome, int64 code) = _tryRelease();
        if (outcome == ReleaseOutcome.NoAllowance) revert NoAllowance();
        if (outcome == ReleaseOutcome.AllowanceReadFailed || outcome == ReleaseOutcome.TransferFailed) {
            revert SystemContractFailed(code);
        }
        done = outcome == ReleaseOutcome.Done;
        if (done) _cancelPendingSchedule();
        else if (pendingSchedule == address(0) || block.timestamp >= scheduledFor) {
            pendingSchedule = address(0);
            _scheduleNextHeartbeat();
        }
    }

    /// @notice Live allowance the owner has granted this vault, read from HAS. NOT a view; simulate it.
    function liveAllowance() external returns (int64 responseCode, int256 amountTinybars) {
        return _readAllowance();
    }

    // ------------------------------------------------------------------ views
    function unlocksAt() public view returns (uint256) {
        return lastActiveTimestamp + timeout;
    }

    function timeRemaining() public view returns (uint256) {
        uint256 d = unlocksAt();
        return block.timestamp >= d ? 0 : d - block.timestamp;
    }

    function currentInterval() external view returns (uint256) {
        return _currentInterval();
    }

    /// @notice True when release() would actually transfer: deadline passed AND no fresh liveness signal.
    function isReleasable() public view returns (bool) {
        if (released || cancelled) return false;
        if (block.timestamp <= unlocksAt()) return false;
        return owner.balance >= lastKnownBalance;
    }

    function status() external view returns (Status) {
        if (released) return Status.Released;
        if (cancelled) return Status.Cancelled;
        if (block.timestamp > unlocksAt()) return Status.Releasable;
        (uint256 warn, uint256 crit) = _thresholds();
        uint256 rem = timeRemaining();
        if (rem <= crit) return Status.Critical;
        if (rem <= warn) return Status.Warning;
        return Status.Active;
    }

    function feeReserve() external view returns (uint256) {
        return address(this).balance;
    }

    function nextHeartbeat() external view returns (address schedule, uint256 targetSecond) {
        return (pendingSchedule, scheduledFor);
    }

    // ------------------------------------------------------------------ internals: liveness
    function _checkLiveness() private returns (bool alive) {
        uint256 current = owner.balance;
        if (current < lastKnownBalance) {
            // Only the key holder can cause a decrease (fees or outgoing transfers).
            lastActiveTimestamp = block.timestamp;
            alive = true;
            emit LivenessDetected(lastKnownBalance, current, block.timestamp + timeout);
        }
        // Unconditional resync: incoming funds must not leave a stale low baseline.
        lastKnownBalance = current;
        emit SnapshotResynced(current);
    }

    function _resync() private {
        lastKnownBalance = owner.balance;
        emit SnapshotResynced(lastKnownBalance);
    }

    /// @dev An owner-signed action on this contract is itself proof of life.
    function _markAlive() private {
        lastActiveTimestamp = block.timestamp;
        _resync();
    }

    // ------------------------------------------------------------------ internals: release
    enum ReleaseOutcome {
        Done,
        OwnerAlive,
        NoAllowance,
        AllowanceReadFailed,
        TransferFailed
    }

    /// @dev Never reverts. The caller decides whether an outcome is an error (release()) or a reason to
    ///      keep watching (heartbeat()).
    function _tryRelease() private returns (ReleaseOutcome, int64 code) {
        // Fresh liveness check. A stale snapshot must never release a living owner's funds.
        if (_checkLiveness()) {
            emit ReleaseAborted("liveness detected");
            return (ReleaseOutcome.OwnerAlive, 0);
        }
        int256 allowance;
        (code, allowance) = _readAllowance();
        if (code != SUCCESS) {
            emit ReleaseAborted("allowance read failed");
            return (ReleaseOutcome.AllowanceReadFailed, code);
        }
        int64 amount = TinybarMath.min(allowance.clampToInt64(), owner.balance.toInt64());
        if (amount <= 0) {
            emit ReleaseAborted("no allowance or empty account");
            return (ReleaseOutcome.NoAllowance, 0);
        }
        released = true; // before the external call
        code = _executeTransfer(amount);
        if (code != SUCCESS) {
            released = false;
            emit ReleaseAborted("transfer failed");
            return (ReleaseOutcome.TransferFailed, code);
        }
        emit Released(beneficiary, amount);
        return (ReleaseOutcome.Done, SUCCESS);
    }

    function _readAllowance() private returns (int64 code, int256 amount) {
        (bool ok, bytes memory res) =
            HAS.call(abi.encodeWithSelector(IHederaAccountService.hbarAllowance.selector, owner, address(this)));
        if (!ok || res.length < 64) return (0, 0);
        (code, amount) = abi.decode(res, (int64, int256));
    }

    /// @return code HAPI response code; SUCCESS (22) when the transfer executed. Never reverts.
    function _executeTransfer(int64 amountTinybars) private returns (int64 code) {
        // amountTinybars > 0 is guaranteed by the caller, so negation cannot overflow.
        IHederaTokenService.AccountAmount[] memory legs = new IHederaTokenService.AccountAmount[](2);
        legs[0] = IHederaTokenService.AccountAmount({accountID: owner, amount: -amountTinybars, isApproval: true});
        legs[1] = IHederaTokenService.AccountAmount({accountID: beneficiary, amount: amountTinybars, isApproval: false});
        IHederaTokenService.TransferList memory hbar = IHederaTokenService.TransferList({transfers: legs});
        IHederaTokenService.TokenTransferList[] memory none = new IHederaTokenService.TokenTransferList[](0);

        (bool ok, bytes memory res) = HTS.call(abi.encodeWithSelector(IHederaTokenService.cryptoTransfer.selector, hbar, none));
        if (!ok || res.length < 32) return 0;
        code = abi.decode(res, (int64));
    }

    // ------------------------------------------------------------------ internals: scheduling
    /// @dev Bands (remaining -> interval). Production: >90d->30d, >30d->7d, else 1d.
    ///      Demo: >90s->15s, >30s->10s, else 5s. Same shape, compressed.
    function _currentInterval() private view returns (uint256) {
        uint256 remaining = timeRemaining();
        (uint256 warn, uint256 crit) = _thresholds();
        uint256 interval;
        if (demoMode) {
            if (remaining > warn) interval = 15;
            else if (remaining > crit) interval = 10;
            else interval = 5;
        } else {
            if (remaining > warn) interval = 30 days;
            else if (remaining > crit) interval = 7 days;
            else interval = 1 days;
        }
        return interval > MAX_INTERVAL ? MAX_INTERVAL : interval;
    }

    function _thresholds() private view returns (uint256 warn, uint256 crit) {
        return demoMode ? (uint256(90), uint256(30)) : (90 days, 30 days);
    }

    /// @dev MUST NEVER REVERT. Failures are emitted; poke() is the restart path.
    function _scheduleNextHeartbeat() private {
        if (released || cancelled) return;
        uint256 interval = _currentInterval();
        uint256 target = block.timestamp + interval;
        bytes memory callData = abi.encodeCall(this.heartbeat, ());

        for (uint8 i = 0; i < MAX_SCHEDULE_RETRIES; i++) {
            if (_hasCapacity(target)) {
                if (gasleft() < SCHEDULE_CALL_GAS_FLOOR) {
                    emit HeartbeatSchedulingFailed(HederaResponseCodes.INSUFFICIENT_GAS, target);
                    return;
                }
                (bool ok, bytes memory res) = HSS.call(
                    abi.encodeWithSelector(
                        IHederaScheduleService.scheduleCall.selector, address(this), target, HEARTBEAT_GAS, uint64(0), callData
                    )
                );
                if (ok && res.length >= 64) {
                    (int64 code, address sched) = abi.decode(res, (int64, address));
                    if (code == SUCCESS) {
                        pendingSchedule = sched;
                        scheduledFor = target;
                        emit HeartbeatScheduled(sched, target, interval);
                        return;
                    }
                    emit HeartbeatSchedulingFailed(code, target);
                } else {
                    emit HeartbeatSchedulingFailed(0, target);
                }
            }
            target += _backoff(i);
        }
        emit HeartbeatSchedulingFailed(0, target);
    }

    function _hasCapacity(uint256 target) private view returns (bool) {
        (bool ok, bytes memory res) =
            HSS.staticcall(abi.encodeWithSelector(IHederaScheduleService.hasScheduleCapacity.selector, target, HEARTBEAT_GAS));
        if (!ok || res.length < 32) return false;
        return abi.decode(res, (bool));
    }

    /// @dev Grows with the attempt and carries address-derived jitter so vaults probing the same
    ///      ideal second scatter instead of stampeding (HIP-1215 guidance). Never manipulable by a caller.
    function _backoff(uint8 attempt) private view returns (uint256) {
        uint256 step = demoMode ? 1 : 60;
        uint256 jitter = uint256(keccak256(abi.encodePacked(address(this), attempt))) % (step * 4);
        return step * (uint256(attempt) + 1) + jitter;
    }

    /// @dev Best effort. Ignores response codes; an already-executed schedule simply returns a non-SUCCESS code.
    function _cancelPendingSchedule() private {
        address sched = pendingSchedule;
        if (sched == address(0)) return;
        pendingSchedule = address(0);
        if (block.timestamp >= scheduledFor) return; // already fired (or about to); nothing to delete
        HSS.call(abi.encodeWithSelector(IHederaScheduleService.deleteSchedule.selector, sched));
    }

    function _validateAccount(address a) private pure {
        if (a == address(0)) revert ZeroAddress();
        if (a < FIRST_USER_ACCOUNT) revert SystemAccount(a);
    }
}
