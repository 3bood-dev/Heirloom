import type { Address } from "viem";
import { VaultDashboard } from "@/components/VaultDashboard";

export default async function VaultPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <div className="space-y-6">
      <div><div className="label">Owner dashboard</div><h1 className="font-mono text-lg tracking-tight text-muted">{address}</h1></div>
      <VaultDashboard address={address as Address} />
    </div>
  );
}
