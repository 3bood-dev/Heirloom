# Deployed — Hedera Testnet (chain id 296)

| What | Address | HashScan |
|---|---|---|
| VaultFactory (demo timings, current) | `0x69ec6283a1ae859b008909ab8e5ccee319cfc11d` | https://hashscan.io/testnet/contract/0x69ec6283a1ae859b008909ab8e5ccee319cfc11d |
| Demo factory v2 (run #3) | `0x02c1b79750ca3a9f17f51a91a505e6f9c254ccde` | https://hashscan.io/testnet/contract/0x02c1b79750ca3a9f17f51a91a505e6f9c254ccde |
| Previous demo factory (run #1/#2) | `0x921343ea4432035d256bb3c1b35c31637f8610e1` | https://hashscan.io/testnet/contract/0x921343ea4432035d256bb3c1b35c31637f8610e1 |
| Demo vault that released autonomously | `0xfcA188513F4ddE9a1A4248Aa5b6C0e37737B7d94` | https://hashscan.io/testnet/contract/0xfcA188513F4ddE9a1A4248Aa5b6C0e37737B7d94 |
| Owner (operator) | `0x0ef1fe546a3ba3849e6dd590d55e718033fb4e2b` (0.0.10482718) | https://hashscan.io/testnet/account/0.0.10482718 |
| Beneficiary | `0x10aaf2d4cbfe4e07d9afa6bcd72802e632cbcd20` (0.0.10482994) | https://hashscan.io/testnet/account/0.0.10482994 |
| Hedera Schedule Service | `0x000000000000000000000000000000000000016b` | system contract |
| Hedera Account Service | `0x000000000000000000000000000000000000016a` | system contract |
| Hedera Token Service | `0x0000000000000000000000000000000000000167` | system contract |

ABIs: `contracts/out/InheritanceVault.sol/InheritanceVault.json`, `contracts/out/VaultFactory.sol/VaultFactory.json`,
exported for the frontend to `web/src/lib/abi/*.ts` by `npm run abi`. Machine-readable: `DEPLOYED.json`.

Demo mode = compressed bands (15 s / 10 s / 5 s), minimum timeout 60 s. Production factory: `DEMO_MODE=false npm run deploy:factory`.
