import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectWallet } from "@/components/ConnectWallet";
import { DEMO } from "@/lib/chain";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Heirloom — non-custodial HBAR inheritance",
  description: "Your wallet stays your wallet. A dead-man's switch on Hedera that never takes custody.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <header className="border-b border-line">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
                  Heirloom
                </Link>
                <nav className="hidden gap-6 text-sm text-muted sm:flex">
                  <Link href="/setup" className="hover:text-fg">Set up</Link>
                  <Link href="/vault" className="hover:text-fg">My vaults</Link>
                  <Link href="/claim" className="hover:text-fg">Claim</Link>
                </nav>
              </div>
              <div className="flex items-center gap-3">
                {DEMO && <span className="rounded border border-amber/40 px-2 py-0.5 text-[11px] uppercase tracking-wider text-amber">demo timings</span>}
                <span className="hidden text-xs text-dim sm:inline">Hedera Testnet</span>
                <ConnectWallet />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-dim">
            Built on HIP-906 (HBAR allowances), HIP-206 (approved cryptoTransfer) and HIP-1215 (scheduled contract calls). No custody, no keeper, no server.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
