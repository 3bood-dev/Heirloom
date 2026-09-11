import { fmtHbar } from "@/lib/units";

export function NonCustodialBanner({ ownerBalance, vaultReserve, who = "Your" }: { ownerBalance?: bigint; vaultReserve?: bigint; who?: string }) {
  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="inline-block h-2 w-2 rounded-full bg-accent" />
        <span>
          {who} balance: <span className="tnum font-mono text-fg">{fmtHbar(ownerBalance)} ℏ</span>
          <span className="text-muted"> — held in {who === "Your" ? "your" : "their"} account, not ours.</span>
        </span>
      </div>
      <div className="text-xs text-muted">
        Vault holds <span className="tnum font-mono text-fg">{fmtHbar(vaultReserve)} ℏ</span> of fee reserve and nothing else.
      </div>
    </div>
  );
}
