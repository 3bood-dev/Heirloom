"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hederaTestnet } from "@/lib/chain";
import { shortAddr } from "@/lib/units";

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
    return (
      <button className="btn text-sm" disabled={!injected || isPending} onClick={() => injected && connect({ connector: injected })}>
        {isPending ? "Connecting…" : "Connect MetaMask"}
      </button>
    );
  }
  if (chainId !== hederaTestnet.id) {
    return (
      <button className="btn text-sm border-amber/50 text-amber" disabled={switching} onClick={() => switchChain({ chainId: hederaTestnet.id })}>
        {switching ? "Switching…" : "Switch to Hedera Testnet"}
      </button>
    );
  }
  return (
    <button className="btn text-sm font-mono" onClick={() => disconnect()} title="Disconnect">
      {shortAddr(address)}
    </button>
  );
}
