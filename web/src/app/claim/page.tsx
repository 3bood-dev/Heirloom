import { VaultList } from "@/components/VaultList";
export default function ClaimIndex() {
  return (
    <div className="space-y-6">
      <div><div className="label">Claim</div><h1 className="text-2xl font-semibold tracking-tight">Vaults that name you</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Someone may have set this up without telling you. The factory keeps an index by beneficiary, so connecting your wallet is enough to find out.</p></div>
      <VaultList mode="beneficiary" />
    </div>
  );
}
