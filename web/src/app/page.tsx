import Link from "next/link";

export default function Landing() {
  return (
    <div className="space-y-16">
      <section className="max-w-3xl pt-8">
        <div className="label mb-4">Non-custodial inheritance on Hedera</div>
        <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">Your wallet stays your wallet.</h1>
        <p className="mt-6 text-lg text-muted">
          Heirloom is a dead-man&apos;s switch for HBAR that never takes custody. You grant a permission, not a deposit. Your money stays in your account
          until the day it needs to move, and then it moves once, directly to the person you chose.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/setup" className="btn btn-accent">Set up in two signatures</Link>
          <Link href="/claim" className="btn">I might be a beneficiary</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { t: "No custody. Ever.", d: "Hedera has native HBAR allowances (HIP-906). You approve an amount; the contract holds nothing. Ethereum cannot do this for its native asset." },
          { t: "Nobody has to click.", d: "The contract schedules calls to itself (HIP-1215). It wakes up, checks whether you are alive, and reschedules. A cron job that lives on the ledger." },
          { t: "Just use your wallet.", d: "Every transaction you sign costs a fee, so any activity lowers your balance. The heartbeat sees that and resets the timer. No app, no reminder, no login." },
        ].map((x) => (
          <div key={x.t} className="panel p-5">
            <div className="font-medium">{x.t}</div>
            <p className="mt-2 text-sm text-muted">{x.d}</p>
          </div>
        ))}
      </section>

      <section className="panel p-6">
        <div className="label">How a release actually happens</div>
        <ol className="mt-4 grid gap-4 text-sm md:grid-cols-4">
          {[
            ["1", "Timer runs out", "No balance decrease and no “I am alive” for the whole timeout."],
            ["2", "Fresh re-check", "release() reads your balance again. Any decrease since the last snapshot aborts and resets the timer. It fails toward not releasing."],
            ["3", "Live allowance", "The allowance is read from the ledger at that moment, never from a cache. You may have revoked it yesterday."],
            ["4", "One transfer", "cryptoTransfer with isApproval=true. From your account to theirs. Our contract's balance does not change."],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-3">
              <span className="tnum font-mono text-dim">{n}</span>
              <div><div className="text-fg">{t}</div><div className="mt-1 text-muted">{d}</div></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-3xl">
        <div className="label">What we tell you up front</div>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>An allowance is a permission, not an escrow. If you spend it all before you go, nothing is left to inherit. That is a feature: it is still your money.</li>
          <li>Balance-decrease liveness is a heuristic. It fails in the safe direction (not releasing), and the one-tap ping covers the rest.</li>
          <li>Each on-chain wake-up costs about one HBAR. The dashboard shows your runway; top up whenever you like, withdraw whenever you like.</li>
        </ul>
      </section>
    </div>
  );
}
