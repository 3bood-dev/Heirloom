import type { Address } from "viem";
import { ClaimView } from "@/components/ClaimView";

export default async function ClaimPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <div className="space-y-6">
      <div><div className="label">Beneficiary view</div><h1 className="font-mono text-lg tracking-tight text-muted">{address}</h1></div>
      <ClaimView address={address as Address} />
    </div>
  );
}
