import { VENUES } from "../okx/venue.js";
import type { Instrument, Ticker } from "./types.js";

export interface UniverseResult {
  /** Passed every gate, ranked by 24h USD volume. */
  tradable: string[];
  /** Passed volume but failed the spread gate. */
  spreadBlocked: string[];
  /** Live instruments we could not classify (never traded). */
  unknown: string[];
}

export interface GateOpts {
  min24hVolUsd: number;
  spreadGateBps: number;
  allowNonCrypto: boolean;
  /** The venue's instruments (default: EEA X-Perps). */
  matches?: (instId: string) => boolean;
  /** Keep at most this many, highest volume first (default: no cap). Coins cut here are not spread-blocked. */
  max?: number;
}

/** Hard rule 5: discover, never hard-code. Live, the venue's instruments, not TEST*, crypto unless allowed, volume and spread gates. */
export function gateUniverse(instruments: Iterable<Instrument>, tickers: Map<string, Ticker>, g: GateOpts): UniverseResult {
  const matches = g.matches ?? VENUES.eea.matches;
  const tradable: Array<[string, number]> = [];
  const spreadBlocked: string[] = [];
  const unknown: string[] = [];
  for (const i of instruments) {
    if (i.state !== "live" || !matches(i.instId) || i.coin.startsWith("TEST")) continue;
    if (i.kind === "unknown") {
      unknown.push(i.instId);
      continue;
    }
    if (i.kind === "test") continue;
    if (i.kind !== "crypto" && !g.allowNonCrypto) continue;
    const t = tickers.get(i.instId);
    if (!t || !(t.vol24hUsd >= g.min24hVolUsd)) continue;
    if (!(t.spreadBp <= g.spreadGateBps)) {
      spreadBlocked.push(i.instId);
      continue;
    }
    tradable.push([i.instId, t.vol24hUsd]);
  }
  tradable.sort((a, b) => b[1] - a[1]);
  return { tradable: tradable.slice(0, g.max ?? Infinity).map(([id]) => id), spreadBlocked, unknown };
}
