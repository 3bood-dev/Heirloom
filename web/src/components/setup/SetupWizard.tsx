"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { decodeEventLog, encodeFunctionData, isAddress, parseEther, type Address } from "viem";
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { vaultFactoryAbi } from "@/lib/abi/VaultFactory";
import { hasAbi, HAS_ADDRESS } from "@/lib/abi/has";
import { DEMO, FACTORY, GAS, HASHSCAN } from "@/lib/chain";
import { HBAR_PER_HEARTBEAT, bands, fmtDuration, fmtHbar, hbarToTiny, heartbeatsForTimeout, weiToTiny } from "@/lib/units";

const PRESETS = DEMO
  ? [{ label: "3 minutes (demo)", s: 180 }, { label: "5 minutes", s: 300 }, { label: "10 minutes", s: 600 }]
  : [{ label: "6 months", s: 182 * 86400 }, { label: "1 year", s: 365 * 86400 }, { label: "2 years", s: 730 * 86400 }];

export function SetupWizard() {
  const { address, isConnected } = useAccount();
  const bal = useBalance({ address });
  const [step, setStep] = useState(1);
  const [beneficiary, setBeneficiary] = useState("");
  const [timeout, setTimeout_] = useState(PRESETS[DEMO ? 0 : 1].s);
  const [custom, setCustom] = useState("");
  const [reserve, setReserve] = useState(DEMO ? "60" : "100");
  const [allowance, setAllowance] = useState("");
  const [vault, setVault] = useState<Address>();

  const create = useWriteContract();
  const createRcpt = useWaitForTransactionReceipt({ hash: create.data });
  const approve = useSendTransaction();
  const approveRcpt = useWaitForTransactionReceipt({ hash: approve.data });

  useEffect(() => {
    if (!createRcpt.data) return;
    for (const log of createRcpt.data.logs) {
      try {
        const ev = decodeEventLog({ abi: vaultFactoryAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "VaultDeployed") { setVault((ev.args as { vault: Address }).vault); setStep(4); }
      } catch { /* other logs */ }
    }
  }, [createRcpt.data]);

  const ownerTiny = bal.data ? weiToTiny(bal.data.value) : undefined;
  useEffect(() => { if (ownerTiny !== undefined && allowance === "") setAllowance(String(Math.max(0, Math.floor(Number(ownerTiny) / 1e8) - 5))); }, [ownerTiny, allowance]);

  const beats = useMemo(() => heartbeatsForTimeout(timeout, DEMO), [timeout]);
  const reserveNum = Number(reserve);
  const runway = Number.isFinite(reserveNum) && reserveNum > 0 ? reserveNum / HBAR_PER_HEARTBEAT : 0;
  const validBeneficiary = isAddress(beneficiary) && BigInt(beneficiary) >= 0x2een && beneficiary.toLowerCase() !== address?.toLowerCase();

  if (!isConnected) return <div className="panel p-8 text-center text-muted">Connect MetaMask (top right) to begin. You will sign exactly two transactions.</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Steps step={step} />

        {step === 1 && (
          <section className="panel p-6">
            <h2 className="text-lg font-medium">Who should receive your HBAR?</h2>
            <p className="mt-1 text-sm text-muted">They need no setup and need not know this exists. They will be able to find it by connecting their wallet.</p>
            <input className="input mt-4" placeholder="0x… beneficiary EVM address" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value.trim())} />
            <div className="mt-2 h-5 text-xs">
              {beneficiary && !isAddress(beneficiary) && <span className="text-red">Not a valid address.</span>}
              {isAddress(beneficiary) && BigInt(beneficiary) < 0x2een && <span className="text-red">System accounts (below 0.0.750) cannot receive.</span>}
              {isAddress(beneficiary) && beneficiary.toLowerCase() === address?.toLowerCase() && <span className="text-red">That is your own address.</span>}
              {validBeneficiary && <span className="text-accent">If the switch fires, everything covered by your allowance goes to this address.</span>}
            </div>
            <div className="mt-4 flex justify-end"><button className="btn btn-accent" disabled={!validBeneficiary} onClick={() => setStep(2)}>Continue</button></div>
          </section>
        )}

        {step === 2 && (
          <section className="panel p-6">
            <h2 className="text-lg font-medium">How long can you go quiet?</h2>
            <p className="mt-1 text-sm text-muted">If neither your balance decreases nor you tap “I am alive” for this long, the switch fires.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => (
                <button key={p.s} className={`btn ${timeout === p.s && !custom ? "border-accent text-accent" : ""}`} onClick={() => { setTimeout_(p.s); setCustom(""); }}>{p.label}</button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-muted">or custom:</span>
              <input className="input w-32" placeholder={DEMO ? "seconds" : "days"} inputMode="numeric" value={custom} onChange={(e) => { setCustom(e.target.value); const n = Number(e.target.value); if (n > 0) setTimeout_(DEMO ? n : n * 86400); }} />
            </div>
            <div className="mt-5 rounded-lg border border-line p-4 text-sm">
              <div className="label mb-2">Resulting heartbeat schedule</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {bands(DEMO).map((b) => <div key={b.label}><div className="text-muted">{b.label}</div><div className="tnum font-mono">{b.every}</div></div>)}
              </div>
              <div className="mt-3 text-muted">About <span className="tnum font-mono text-fg">{beats}</span> wake-ups if you never show up. The system watches harder the closer it gets to acting.</div>
            </div>
            <div className="mt-4 flex justify-between"><button className="btn" onClick={() => setStep(1)}>Back</button><button className="btn btn-accent" disabled={timeout < (DEMO ? 60 : 3600)} onClick={() => setStep(3)}>Continue</button></div>
          </section>
        )}

        {step === 3 && (
          <section className="panel p-6">
            <div className="label">Signature 1 of 2</div>
            <h2 className="mt-1 text-lg font-medium">Deploy the vault and fund its wake-ups</h2>
            <p className="mt-1 text-sm text-muted">
              The reserve pays for the contract&apos;s own scheduled calls, about {HBAR_PER_HEARTBEAT} ℏ each. It is <span className="text-fg">refundable</span> at any time and is the only HBAR the contract will ever hold.
            </p>
            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1"><div className="label mb-1">Fee reserve (HBAR)</div><input className="input" inputMode="decimal" value={reserve} onChange={(e) => setReserve(e.target.value)} /></div>
              <div className="pb-2 text-sm text-muted">≈ <span className="tnum font-mono text-fg">{Math.floor(runway)}</span> wake-ups {beats > 0 && <>· {runway >= beats ? <span className="text-accent">covers the full timeout</span> : <span className="text-amber">covers {(runway / beats * 100).toFixed(0)}% of one timeout</span>}</>}</div>
            </div>
            <div className="mt-4 flex justify-between">
              <button className="btn" onClick={() => setStep(2)}>Back</button>
              <button className="btn btn-accent" disabled={create.isPending || createRcpt.isLoading || !(reserveNum > 0)}
                onClick={() => create.writeContract({ address: FACTORY, abi: vaultFactoryAbi, functionName: "createVault", args: [beneficiary as Address, BigInt(timeout)], value: parseEther(String(reserveNum)), gas: GAS.createVault })}>
                {create.isPending ? "Confirm in wallet…" : createRcpt.isLoading ? "Deploying…" : "Deploy vault"}
              </button>
            </div>
            {create.error && <p className="mt-2 text-xs text-red">{(create.error as { shortMessage?: string }).shortMessage ?? create.error.message}</p>}
            {create.data && <p className="mt-2 text-xs text-dim"><a className="underline" href={`${HASHSCAN}/transaction/${create.data}`} target="_blank" rel="noreferrer">view transaction</a></p>}
          </section>
        )}

        {step === 4 && vault && (
          <section className="panel p-6">
            <div className="label">Signature 2 of 2</div>
            <h2 className="mt-1 text-lg font-medium">Grant the allowance</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li className="text-fg">No money moves. Your HBAR stays in your account.</li>
              <li className="text-fg">You can keep spending normally.</li>
              <li className="text-fg">You can revoke this at any time from your wallet, without us.</li>
            </ul>
            <div className="mt-5 rounded-lg border border-line p-4">
              <div className="label">Amount to approve</div>
              <div className="mt-1 flex items-baseline gap-3">
                <input className="input tnum max-w-56 text-3xl font-semibold" inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
                <span className="text-2xl text-muted">ℏ</span>
              </div>
              <div className="mt-2 text-xs text-muted">
                A cap, not unlimited: a bug in our contract can never reach more than this. Your balance is <span className="tnum font-mono text-fg">{fmtHbar(ownerTiny)} ℏ</span>. The vault is <span className="font-mono">{vault}</span>.
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-accent" disabled={approve.isPending || approveRcpt.isLoading || !(Number(allowance) > 0)}
                onClick={() => approve.sendTransaction({ to: HAS_ADDRESS, data: encodeFunctionData({ abi: hasAbi, functionName: "hbarApprove", args: [address!, vault, hbarToTiny(allowance)] }), gas: GAS.approve })}>
                {approve.isPending ? "Confirm in wallet…" : approveRcpt.isLoading ? "Granting…" : approveRcpt.isSuccess ? "Granted" : "Grant allowance"}
              </button>
            </div>
            <p className="mt-2 text-xs text-dim">MetaMask will show a transaction to <span className="font-mono">0x…016a</span>, the Hedera Account Service. That is the ledger&apos;s own allowance function (HIP-906), signed by you, for your account.</p>
            {approve.error && <p className="mt-2 text-xs text-red">{(approve.error as { shortMessage?: string }).shortMessage ?? approve.error.message}</p>}
            {approveRcpt.isSuccess && (
              <div className="mt-5 rounded-lg border border-accent/40 bg-accent/5 p-4 text-sm">
                <div className="text-accent">Done. The first heartbeat is already scheduled.</div>
                <Link href={`/vault/${vault}`} className="btn btn-accent mt-3">Open dashboard</Link>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <div className="panel p-5 text-sm">
          <div className="label">Summary</div>
          <dl className="mt-3 space-y-2">
            <Row k="Owner" v={address} mono />
            <Row k="Beneficiary" v={validBeneficiary ? beneficiary : "—"} mono />
            <Row k="Timeout" v={fmtDuration(timeout)} />
            <Row k="Fee reserve" v={`${reserve || 0} ℏ`} />
            <Row k="Allowance" v={step >= 4 ? `${allowance || 0} ℏ` : "—"} />
            <Row k="Custody" v="none" />
          </dl>
        </div>
        <div className="panel p-5 text-xs text-muted">
          Two signatures. The first deploys and funds. The second is an allowance from your account to the vault address. Nothing is deposited, then or later.
        </div>
      </aside>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className={`truncate text-right ${mono ? "font-mono text-xs" : ""}`}>{v ?? "—"}</dd></div>;
}
function Steps({ step }: { step: number }) {
  const names = ["Beneficiary", "Timeout", "Deploy + reserve", "Allowance"];
  return (
    <ol className="flex gap-2 text-xs">
      {names.map((n, i) => (
        <li key={n} className={`flex items-center gap-2 rounded-full border px-3 py-1 ${i + 1 === step ? "border-accent text-accent" : i + 1 < step ? "border-line text-muted" : "border-line text-dim"}`}>
          <span className="tnum font-mono">{i + 1}</span>{n}
        </li>
      ))}
    </ol>
  );
}
