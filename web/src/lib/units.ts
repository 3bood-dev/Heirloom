/// Denominations (verified on testnet, see SPIKE_RESULTS.md):
///  - contract state, HAS/HTS amounts: TINYBARS (1e8 per HBAR)
///  - JSON-RPC relay balances and tx value: WEIBARS (1e18 per HBAR)
export const TINYBARS_PER_HBAR = 100_000_000n;
export const WEI_PER_TINYBAR = 10_000_000_000n;

export const weiToTiny = (w: bigint) => w / WEI_PER_TINYBAR;
export const tinyToWei = (t: bigint) => t * WEI_PER_TINYBAR;
export const hbarToTiny = (h: number | string) => BigInt(Math.round(Number(h) * 1e8));

export function fmtHbar(tinybars: bigint | undefined | null, digits = 2): string {
  if (tinybars === undefined || tinybars === null) return "—";
  const neg = tinybars < 0n;
  const abs = neg ? -tinybars : tinybars;
  const whole = abs / TINYBARS_PER_HBAR;
  const frac = abs % TINYBARS_PER_HBAR;
  const fracStr = frac.toString().padStart(8, "0").slice(0, digits);
  const wholeStr = whole.toLocaleString("en-US");
  return `${neg ? "-" : ""}${wholeStr}${digits > 0 ? "." + fracStr : ""}`;
}

export function fmtDuration(totalSeconds: number, parts = 2): string {
  let s = Math.max(0, Math.floor(totalSeconds));
  const units: [string, number][] = [["y", 31_536_000], ["d", 86_400], ["h", 3600], ["m", 60], ["s", 1]];
  const out: string[] = [];
  for (const [label, size] of units) {
    if (s >= size || (label === "s" && out.length === 0)) {
      const n = Math.floor(s / size);
      s -= n * size;
      out.push(`${n}${label}`);
      if (out.length === parts) break;
    }
  }
  return out.join(" ");
}

/// Countdown split for the ring: big number + unit, small remainder.
export function splitCountdown(totalSeconds: number): { big: string; unit: string; small: string } {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s >= 2 * 86_400) return { big: String(Math.floor(s / 86_400)), unit: "days", small: `${Math.floor((s % 86_400) / 3600)}h ${Math.floor((s % 3600) / 60)}m` };
  if (s >= 3600) return { big: String(Math.floor(s / 3600)), unit: "hours", small: `${Math.floor((s % 3600) / 60)}m ${s % 60}s` };
  if (s >= 60) return { big: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, unit: "min", small: "" };
  return { big: String(s), unit: "sec", small: "" };
}

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const STATUS = ["Active", "Warning", "Critical", "Releasable", "Released", "Cancelled"] as const;
export type StatusName = (typeof STATUS)[number];

export const RESPONSE_CODES: Record<number, string> = {
  22: "SUCCESS",
  7: "INVALID_SIGNATURE",
  9: "INSUFFICIENT_TX_FEE",
  10: "INSUFFICIENT_PAYER_BALANCE",
  15: "INVALID_ACCOUNT_ID",
  16: "INVALID_CONTRACT_ID",
  28: "INSUFFICIENT_ACCOUNT_BALANCE",
  30: "INSUFFICIENT_GAS",
  33: "CONTRACT_REVERT_EXECUTED",
  173: "TRANSFERS_NOT_ZERO_SUM",
  201: "INVALID_SCHEDULE_ID",
  212: "SCHEDULE_ALREADY_DELETED",
  213: "SCHEDULE_ALREADY_EXECUTED",
  290: "NEGATIVE_ALLOWANCE_AMOUNT",
  292: "SPENDER_DOES_NOT_HAVE_ALLOWANCE",
  293: "AMOUNT_EXCEEDS_ALLOWANCE",
  300: "INVALID_ALLOWANCE_OWNER_ID",
  301: "INVALID_ALLOWANCE_SPENDER_ID",
  306: "SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE",
  307: "SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME",
  308: "SCHEDULE_FUTURE_THROTTLE_EXCEEDED",
  309: "SCHEDULE_FUTURE_GAS_LIMIT_EXCEEDED",
  370: "SCHEDULE_EXPIRY_IS_BUSY",
};
export const codeName = (c: number | bigint) => RESPONSE_CODES[Number(c)] ?? `code ${c}`;

/// Interval bands as the contract defines them.
export function bands(demo: boolean) {
  return demo
    ? [{ above: 90, interval: 15, label: "> 90 s left", every: "every 15 s" }, { above: 30, interval: 10, label: "30–90 s left", every: "every 10 s" }, { above: 0, interval: 5, label: "< 30 s left", every: "every 5 s" }]
    : [{ above: 90 * 86400, interval: 30 * 86400, label: "> 90 days left", every: "every 30 days" }, { above: 30 * 86400, interval: 7 * 86400, label: "30–90 days left", every: "every 7 days" }, { above: 0, interval: 86400, label: "< 30 days left", every: "every day" }];
}

/// Heartbeats needed to run a full timeout down with nobody alive, and the reserve that buys.
export const HBAR_PER_HEARTBEAT = 1.8; // measured: ~1.75 HBAR per rescheduling heartbeat, charged on gas used (SPIKE_RESULTS.md)
export function heartbeatsForTimeout(timeoutSeconds: number, demo: boolean): number {
  let remaining = timeoutSeconds, n = 0;
  const b = bands(demo);
  while (remaining > 0 && n < 100_000) {
    const band = b.find((x) => remaining > x.above) ?? b[b.length - 1];
    remaining -= band.interval;
    n++;
  }
  return n;
}
