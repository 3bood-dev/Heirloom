# Demo script (~3 minutes, demo timings: 3-minute timeout, 15 s / 10 s / 5 s heartbeats)

## Before going on stage

```bash
cd web && npm run dev            # http://localhost:3000, factory from web/.env.local
```
- MetaMask on **Hedera Testnet** (chain 296, RPC https://testnet.hashio.io/api). Two accounts imported: **Owner** (0.0.10482718) and **Beneficiary** (0.0.10482994).
- Owner needs ≥ 80 HBAR (60 reserve + fees). Refill at portal.hedera.com if low.
- Open HashScan for the owner account in a second tab: https://hashscan.io/testnet/account/0.0.10482718
- Have the previous autonomous release ready as proof if the network misbehaves: https://hashscan.io/testnet/contract/0xfcA188513F4ddE9a1A4248Aa5b6C0e37737B7d94 (events tab: `Released` from a scheduled call).

## Script

**1. Setup (30 s)** — `/setup`, wallet = Owner.
Beneficiary address → 3 minutes → 60 HBAR reserve → **Sig 1** (deploy). Then **Sig 2**: MetaMask shows a transaction to `0x…016a`, the Hedera Account Service. Say: *"That's the ledger's own allowance function, HIP-906. Nothing is deposited. Look at the balance on HashScan: unchanged apart from fees."* Approve 100 HBAR.

**2. Dashboard (20 s)** — auto-opens `/vault/…`.
Point at: the ring, *Next wake-up in 15 s*, *Live allowance 100 ℏ* read from the ledger, the top banner: *"Your balance: 7xx ℏ — held in your account, not ours."*

**3. Passive detection (30 s)** — don't touch the app.
Send 1 HBAR from the Owner wallet to anyone (MetaMask). Wait for the next heartbeat. The activity log shows *"Activity detected on the owner's account … Timer reset to 3m."* Say the line: **"He didn't open our app. He just used his wallet."**
(Often this has already happened: the approval fee itself counted as activity. Point at that log line instead.)

**4. Manual ping (15 s)** — tap **I am alive**. Ring resets.

**5. Go dark (60 s)** — hands off the Owner wallet. Narrate the schedule card: 15 s → 10 s at 90 s left (amber) → 5 s at 30 s left (red, ring pulses). *"The system watches harder the closer it gets to acting."*

**6. Autonomous release (20 s)** — timer hits zero; within ~10 s the activity log shows `Released 100 ℏ to 0x10aa…cd20, directly from the owner's account.` Switch wallet to Beneficiary on `/claim`: +100 HBAR. **"Nobody clicked anything."**

**7. Closing assertion (15 s)** — the banner still reads *Vault holds 2x ℏ of fee reserve and nothing else.* Show the vault on HashScan: its balance only ever went *down*, by heartbeat fees. **"The money went from his account to his son's account. It was never ours to hold."**

## If something goes wrong

| Symptom | Do |
|---|---|
| *Next wake-up: none scheduled* / chain idle | Fee reserve ran dry or a second was busy. Switch MetaMask to the **Beneficiary** and press **Restart heartbeat (poke)** on the dashboard (top up the reserve first if it is under ~3 HBAR). Say: *"Permissionless restart. This is the degradation path, not a failure of custody."* |
| Deadline passed but nothing released | Beneficiary wallet → `/claim/<vault>` → **Claim inheritance**. Anyone can trigger it; funds can only go to the beneficiary. |
| Claim says *"Activity was detected"* | You touched the Owner wallet (any fee counts). That is the fail-safe working. Wait one more timeout or ping and restart. |
| Relay timeouts | Refresh; the vault runs on-chain regardless. Fall back to HashScan events. |

## The one number a judge will ask about

~1.75 HBAR per heartbeat. Production schedule ≈ 48 beats/year ≈ 85 HBAR/year. Runway is shown on the dashboard; refundable at any time.
