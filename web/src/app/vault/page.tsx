import { VaultList } from "@/components/VaultList";
export default function MyVaults() {
  return <div className="space-y-6"><div><div className="label">My vaults</div><h1 className="text-2xl font-semibold tracking-tight">Vaults you own</h1></div><VaultList mode="owner" /></div>;
}
