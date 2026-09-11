import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { hederaTestnet, RPC } from "./chain";

export const wagmiConfig = createConfig({
  chains: [hederaTestnet],
  connectors: [injected()],
  transports: { [hederaTestnet.id]: http(RPC, { timeout: 60_000, retryCount: 4 }) },
  ssr: true,
});
