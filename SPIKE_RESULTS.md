# Phase 0 — Verification Spike Results

**Network:** Hedera Testnet (chain id 296) via `https://testnet.hashio.io/api` (relay/0.78.5)
**Date:** 2026-09-11
**Status: ALL GATES PASS. Primary architecture confirmed; no fallback taken.**
Operator `0.0.10482718`, beneficiary `0.0.10482994`, probes `0xf359…6668` / `0xa589…2559` (HashScan testnet).

## Headline finding: the spec's §2.6 is inverted

| Where | Denomination | Evidence |
|---|---|---|
| Inside the EVM: `address.balance`, `msg.value`, `call{value:}` | **tinybars** (8 dp) | Multicall3 `getEthBalance` on two accounts returned exactly the mirror-node tinybar balance (see GATE-1). Official docs: *"Within the EVM environment, HBAR maintains 8 decimal places."* |
| HTS / HAS / HSS `int64` amounts | tinybars | HIP-206 / HIP-906 |
| JSON-RPC relay: `eth_getBalance`, tx `value` | weibars (18 dp) | `cast balance` returned the same account × 1e10 |

**Consequence:** the vault contract does **no** scaling anywhere. `lastKnownBalance` (from `owner.balance`) is
directly comparable with allowance amounts from HAS. Only the frontend/scripts convert, at the relay boundary.
`TinybarMath.sol` was rewritten accordingly. Had we built on §2.6 as written, `release()` would have computed
`min(allowance, ownerBalance / 1e10)` and transferred 10^10× too little.

## GATE-1 — Can a contract read an EOA's balance? ✅ PASS

Method: `eth_call` to Multicall3 (`0xcA11…CA11`, deployed on testnet), whose `getEthBalance(address)` is literally
`addr.balance` executed inside a contract. No deployment or funds needed.

| Account | Type | Contract-side `balance` | Mirror node (tinybars) | Match |
|---|---|---|---|---|
| 0.0.10476224 `0xdfed…e8f9` | ECDSA alias (MetaMask-style) | 100000200000 | 100000200000 | ✅ exact |
| 0.0.10482207 `0x0000…9ff21f` | ED25519 long-zero | 17406389057 | 17406389057 | ✅ exact |
| 0.0.2 `0x…0002` | system account | 0 | 3.39e18 | ✗ (expected: system accounts < 0.0.750 are opaque to the EVM) |

Passive `poke()` liveness detection via `owner.balance` is **viable** for both ECDSA and ED25519 owners.
Note: never accept a beneficiary/owner address below `0x…02EE` (0.0.750); they read as zero.

Auto-renew check (§4.3 false-liveness risk): to be recorded when the operator account exists (`spike:gate1` prints
`auto_renew_period` / `expiry_timestamp`).

## GATE-2 — Allowance round-trip ✅ PASS (all three steps) — THE THESIS HOLDS

| Step | Result | Evidence |
|---|---|---|
| 1. Grant | ✅ **EVM path works**: a plain transaction from the owner EOA **to its own address** carrying `IHRC632.hbarApprove(probe, 100 HBAR)` calldata succeeded via the JSON-RPC relay (gasUsed 729,787). | tx `0x00959a7a…227e25` |
| 2. Read | ✅ Probe called HAS `0x16a` `hbarAllowance(owner, probe)` → `(22, 10000000000)` = exactly 100 HBAR. | simulateContract |
| 3. Spend | ✅ Probe called HTS `cryptoTransfer([{owner, -50e8, isApproval:true}, {beneficiary, +50e8, false}])` → code 22. Beneficiary 20 → **70 HBAR**. Owner −50 (+fee). **Probe balance delta: 0 tinybars.** Remaining allowance 50 HBAR. | tx `0xcf79fc76…0cae6` |

**Consequences:** MetaMask can grant the allowance without HashPack or the SDK (no extra wallet integration needed).
A contract can spend a native-HBAR allowance and the funds never touch the contract. Non-custodial inheritance is real.

## GATE-3 — HIP-1215 live, and at what address? ✅ PASS (autonomous firing + self-rescheduling chain observed)

- **HSS address = `0x16b`** — stated on docs.hedera.com "System Smart Contracts" and confirmed live:
  `hasScheduleCapacity(now+60, 100000)` → `true` at `0x16b`; `0x16c` → `CONTRACT_EXECUTION_EXCEPTION`.
- Past second → `false`. 15,000,000 gas in one second → `true` (per-second budget is generous).
- **Maximum horizon measured by bisection: ~5,357,000 s ≈ 62 days.** `+61d` true, `+90d` false.
  The spec's `MAX_INTERVAL = 45 days` leaves a 17-day margin. Keep it.
- All 6 selectors in `IHederaScheduleService.sol` match `cast sig`.
- **Autonomous firing observed:** `scheduleCall(self, now+60s, 300k gas, tick())` → code 22, schedule
  `0x…9fF94f`; `tick()` executed **9 s after the target second** with no external caller (HIP-423: "first available
  slot after"). tx `0x847d4639…de7f60`.
- **Self-rescheduling chain observed (GATE-3b):** `startChain(2 links, 30s, 3M gas)` → ticks 0 → 3. Each scheduled
  `tick()` created the next schedule from inside the scheduled execution. This is exactly the heartbeat pattern.
- Scheduled executions are paid from the **contract's own balance** (the fee reserve), as HIP-1215 states.

## GATE-4 — Fee measurement ✅ PASS — and it reshapes the gas budget

| Item | Measured |
|---|---|
| Gas used by one `scheduleCall` (from EOA, incl. probe overhead) | **1,480,917** (first) / 1,547,408 (chain start) |
| Charged for that EOA tx (relay, limit 1.5M / 6M) | 1.688 HBAR / 1.764 HBAR (Hedera charges ≥80% of the gas limit) |
| Scheduled execution, gasLimit 300k, no reschedule | **0.079 HBAR** paid by the probe |
| Scheduled execution, gasLimit 3M, WITH reschedule | **1.14 HBAR** paid by the probe (3.42 HBAR for 3) |
| A heartbeat that fails to reschedule (limit 1.5M, used 1,455,674) | **reverted out-of-gas** — the spec's 400k `HEARTBEAT_GAS` would kill the chain on link 1 |

**Decisions:** `HEARTBEAT_GAS = 2_500_000`; a `gasleft()` floor of 1.7M before any `scheduleCall` so a heartbeat
degrades to "emit failure, keep state" instead of reverting. Measured in the live runs below: **~1.75 HBAR per
rescheduling heartbeat**, billed on gas used. Production: ~48 heartbeats/year (9×30d + 9×7d + 30×1d) ≈ **85 HBAR/year**.
Surface as "runway" in the UI. Because HIP-1215 gas is pegged to the HAPI ScheduleCreate fee, it moves with the
HBAR/USD rate; keep headroom.

## Other verified facts

- All 11 system-contract selectors in the spec match `cast sig` output.
- Response-code ordinals loaded from `response_code.proto`: SUCCESS=22, SCHEDULE_EXPIRY_IS_BUSY=370,
  SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE=306, AMOUNT_EXCEEDS_ALLOWANCE=293, SPENDER_DOES_NOT_HAVE_ALLOWANCE=292,
  INVALID_ALLOWANCE_OWNER_ID=300, INSUFFICIENT_ACCOUNT_BALANCE=28, INVALID_CONTRACT_ID=16.
- `cryptoTransfer` struct field order taken from the official HIP-206 `IHederaTokenService.sol`.

## Decisions carried into Phase 1+

1. Contract stores and compares **tinybars** everywhere; no `TINYBAR_TO_WEIBAR` in on-chain value paths.
2. HSS at `0x16b`, `MAX_INTERVAL = 45 days` (62-day ceiling measured).
3. Reject owner/beneficiary addresses `< 0x2EE`.
4. Allowance grant from the frontend = MetaMask tx to the owner's own address with `hbarApprove` calldata. No HashPack needed.
5. `HEARTBEAT_GAS = 2.5M`, gas-floor guard, fee reserve sized in the UI at ~1 HBAR per heartbeat.
6. Auto-renew on testnet: `auto_renew_period` 7776000 s (90 d) is set on accounts but Hedera does not currently
   charge auto-renew for accounts; no false-liveness signal observed. Documented as a limitation regardless.


## Live lifecycle run #1 (demo vault `0xfcA1…7d94`, factory `0x9213…10e1`) — two lessons

Full demo-mode run on testnet, 180 s timeout, 30 HBAR reserve, 2.5M `HEARTBEAT_GAS`:

1. **Passive liveness worked without anyone touching the app.** The owner's *approval transaction fee* lowered
   their balance by 0.83 HBAR; the next heartbeat (19:43:27) emitted `LivenessDetected` and reset the timer.
2. **The adaptive schedule was visible on-chain:** 15 s beats → 10 s at 90 s remaining → 5 s at 30 s remaining.
3. **The chain died at the finish line: `INSUFFICIENT_PAYER_BALANCE` at 19:46:07.** Each scheduled heartbeat
   was charged **1.754 HBAR** (≈ 1.55M gas used × ~114 tinybar/gas; the final *releasing* beat, which does not
   reschedule, cost only 0.089 HBAR — so billing is on gas USED, and the cost *is* the scheduleCall).
   16 beats drained the 30 HBAR reserve exactly when the release was due. The limit matters only for the upfront
   affordability check: with 2.147 HBAR left, a 2.5M-gas beat (≈ 2.9 HBAR at that price) was refused.
   → demo reserve default raised to 60 HBAR, `HBAR_PER_HEARTBEAT = 1.8` in the UI runway, `HEARTBEAT_GAS`
   kept at 2.5M as headroom (it costs nothing extra). Limitation #5 is not theoretical.
4. **An owner-signed `release()` aborts itself — correctly.** I called `release()` from the owner account as a
   fallback; paying that fee decreased the owner's balance, the fresh check saw it, and the vault emitted
   `ReleaseAborted("liveness detected")`, reset the timer, and rescheduled. Signing a transaction is proof of
   life; only a *non-owner* (the beneficiary, anyone) can trigger a real release. Scripts and UI now do that.
5. **Recovery path works:** `fundFeeReserve` (+50 HBAR) then `poke()` **from the beneficiary** restarted the
   chain permissionlessly (`HeartbeatScheduled` immediately after).

## Live lifecycle run #2 — AUTONOMOUS RELEASE OBSERVED ✅

Same vault, reserve refunded to 52 HBAR, chain restarted by the beneficiary's `poke()` at 19:56:28, then nobody
touched anything.

| | |
|---|---|
| Heartbeats | 15 s → 10 s → 5 s bands, 20 beats, last 8 at 5 s spacing, every one a scheduled self-call |
| 19:59:33 | scheduled `heartbeat()` found the deadline passed, fresh liveness check clean, read allowance (100 HBAR), `cryptoTransfer(isApproval)` → **`Released(beneficiary, 100 HBAR)`** |
| Beneficiary | 68 → **168 HBAR** |
| Owner | 791.48 → **691.48 HBAR** (exactly −100) |
| Vault | 52.12 → 17.04 HBAR: heartbeat fees only. **Never held the inheritance.** |
| Releasing beat cost | 0.089 HBAR |

**Nobody clicked anything.** The money went from the owner's account to the beneficiary's account. It was never ours to hold.

## Live lifecycle run #3 — scripted rehearsal (`npm run demo`), factory `0x02c1…ccde`, vault `0x1862…C2b7` ✅

Unattended, 4 min 8 s wall clock, exactly the §9.2 demo script:

| Time | Step | Observed |
|---|---|---|
| 20:02:36 | Sig 1 `createVault` (60 HBAR reserve) | first heartbeat scheduled from the constructor |
| 20:02:42 | Sig 2 `hbarApprove` (tx to own address) | `liveAllowance()` → `(22, 100 HBAR)`; owner balance unchanged apart from fees |
| 20:02:50, 20:03:00 | two autonomous heartbeats | rescheduled themselves at 15 s |
| 20:03:06 | owner sends 1 HBAR from their wallet, app untouched | 20:03:15 `LivenessDetected`, timer back to 178 s |
| 20:03:22 | `ping()` | ring reset, next heartbeat rescheduled |
| 20:03:23 → | go dark | 15 s → **10 s at 90 s left** → **5 s at 26 s left**, all on-chain |
| 20:06:33 | **autonomous release** | beneficiary **+100 HBAR**; vault 54.68 → 19.28 HBAR, i.e. 35.4 HBAR of heartbeat fees and nothing else |

Result line from the script: `INTEGRATION PASS: autonomous release, funds moved owner -> beneficiary, vault held nothing.`

## Wallet finding — MetaMask refuses the IHRC632 path; use HAS `0x16a` from wallets

The GATE-2 "EVM path" (a transaction from the owner **to its own address** carrying `IHRC632.hbarApprove` calldata)
works on-chain, but **MetaMask rejects it before it is signed** (`-32602`, "External transactions to internal
accounts cannot include data"): MetaMask will not send calldata to one of its own accounts. Verified alternative:
the owner sends a transaction **to the Hedera Account Service `0x16a`** calling `hbarApprove(owner, spender, amount)`
→ `SUCCESS`, allowance readable via `hbarAllowance(owner, spender)`. The frontend uses this path; scripts (local
signing) may use either.

Related hardening from the browser run: a vault whose owner has not granted the allowance yet reaches its
(3-minute) deadline mid-setup; the heartbeat used to revert with `NoAllowance` and kill the chain. `heartbeat()`
now never reverts at the deadline — no allowance / HAS or HTS failure emit `ReleaseAborted` and keep watching —
and the dashboard shows a permissionless **Restart heartbeat (poke)** button whenever the chain is idle.
