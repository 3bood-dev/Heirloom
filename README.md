# Heirloom — non-custodial HBAR inheritance on Hedera

**Your wallet stays your wallet.** A dead-man's switch that never takes custody, needs no keeper, and has no server.

- The owner grants the vault an **HBAR allowance** (HIP-906) from their own wallet. Nothing is deposited.
- The vault keeps itself alive with **scheduled self-calls** (HIP-1215). It wakes up, checks whether the owner is alive, reschedules.
- Liveness is detected **passively**: every transaction the owner signs costs a fee, so any activity lowers their balance. Only a decrease counts (an attacker cannot fake it by sending dust). A one-tap `ping()` covers everything else.
- When the timer runs out, the vault re-checks liveness one last time, reads the **live** allowance, and executes one HTS `cryptoTransfer` with `isApproval = true`: **owner → beneficiary, directly.** The vault's balance does not change.

All of this was verified on Hedera Testnet before the vault was written. See [`SPIKE_RESULTS.md`](SPIKE_RESULTS.md) — including the finding that the spec's unit model was inverted (inside the Hedera EVM everything is tinybars; the JSON-RPC relay shows weibars).

## Layout

```
contracts/          Foundry project
  src/InheritanceVault.sol      the vault (tinybar-native, never-reverting scheduler, fail-safe release)
  src/VaultFactory.sol          deploys vaults, indexes them by owner AND beneficiary
  src/interfaces/               HIP-906 (IHRC632, HAS), HIP-206 (HTS cryptoTransfer), HIP-1215 (HSS)
  src/mocks/                    HAS/HTS/HSS mocks for unit tests (vm.etch at 0x16a/0x167/0x16b)
  test/unit/                    61 tests: liveness, release, scheduling, access, demo mode, factory
  spikes/GateProbe.sol          throwaway Phase-0 probe
spikes/             tsx runners for the four verification gates
scripts/            deploy-factory.ts, demo-lifecycle.ts (spec §6.3 integration), export-abi.ts
web/                Next.js 16 + Tailwind 4 + wagmi/viem frontend (MetaMask via the JSON-RPC relay)
SPIKE_RESULTS.md    what was verified, what was measured, what was wrong in the plan
```

## Run it

```bash
# contracts
cd contracts && forge test -vv

# testnet scripts (needs .env — see .env.example; ECDSA account from portal.hedera.com)
npm install
npm run build                  # forge build both profiles
DEMO_MODE=true npm run deploy:factory
npm run demo                   # full lifecycle: 2 sigs, heartbeats, passive liveness, ping, go dark, release

# frontend
npm run abi                    # export ABIs into web/src/lib/abi
cd web && cp .env.example .env.local   # set NEXT_PUBLIC_FACTORY_ADDRESS from DEPLOYED.json
npm install && npm run dev     # http://localhost:3000
```

MetaMask: add Hedera Testnet (chain id 296, RPC `https://testnet.hashio.io/api`, symbol HBAR). The app offers the switch.

## Numbers that matter (testnet, 2026-09-11)

| | |
|---|---|
| Unit inside the EVM | tinybar (8 dp). Relay presents weibar (18 dp). Contract converts nothing. |
| Schedule Service | `0x16b`; max horizon ≈ 62 days (bisected); vault caps intervals at 45 days |
| One `scheduleCall` | ≈ 1.5M gas |
| One scheduled heartbeat | charged on gas **used** at ~114 tinybar/gas: **≈ 1.75 HBAR** (the final releasing beat: 0.09) |
| Production year (365 d timeout, nobody alive) | 9×30 d + 9×7 d + 30×1 d ≈ 48 beats ≈ **85 HBAR** |
| Scheduled call latency | fired 9 s after its target second |

## Safety properties (asserted in tests)

1. The vault never holds user funds; its balance is only the fee reserve.
2. `release()` cannot move funds while `owner.balance < lastKnownBalance`. A fresh decrease resets the timer and **persists** (it does not revert, because the revert would discard the very resync that makes the next attempt safe — a deliberate deviation from the draft spec).
3. Only balance **decreases** reset the timer; inflows only resync the snapshot (grief resistance).
4. `_scheduleNextHeartbeat` never reverts; failures are emitted and `poke()` (permissionless) restarts the chain.
5. `heartbeat()`, `poke()`, `release()` are permissionless and can only ever send funds to the beneficiary.
6. The authoritative kill switch is the owner setting the allowance to 0 from their wallet. It needs nothing from us.

## Known limitations (stated up front)

1. **An allowance is a permission, not an escrow.** Spend it all and nothing is left to inherit. Roadmap: hybrid small vault + large allowance.
2. **Blast radius = approved amount.** Mitigation: capped allowance by default, instant ledger-level revocation.
3. **Balance-decrease liveness is a heuristic.** Auto-renew fees would look like life. It fails toward *not releasing*, and `ping()` exists.
4. **The heartbeat chain can break silently**, and we watched it happen: the fee reserve ran dry at the finish line in run #1 (`INSUFFICIENT_PAYER_BALANCE`). `poke()`/`release()` stay permissionless, the UI shows runway, and the chain restarted with one `poke()` and then **released autonomously** in run #2.
5. **The fee reserve is a real cost** (~1.75 HBAR per wake-up, and the next beat is only accepted if the reserve covers gasLimit × price ≈ 2.9 HBAR). A multi-decade product needs a funding model.
6. **A dormant-but-living owner is the core risk**, and it correlates with the target user. Hence `ping()`, escalating attention (30 d / 7 d / 1 d), and fail-safe release.
7. **An owner-signed `release()` aborts itself.** Signing is proof of life. Beneficiaries (or anyone else) trigger releases; the UI enforces it.
8. **HIP-1215 is new** (services v0.68). Verified live on testnet; the keeper fallback would be `poke()` on a cron.

## Source HIPs

206 (HTS precompile, approved `cryptoTransfer`) · 423 (long-term schedules) · 632 (HAS) · 906 (HBAR allowance proxy redirect) · 1215 (generalized scheduled contract calls).
