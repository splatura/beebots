// Where the bees trade. EEA = OKX EEA X-Perps (the original venue). global = OKX's global site, where OKX Australia
// accounts live: linear USDT perpetual swaps. Everything that differs between the two lives here.
import { kindOf as eeaKindOf, type Kind } from "../market/kinds.js";

export type SiteId = "eea" | "global";

export interface Venue {
  /** Also the kit's `--site` value. */
  site: SiteId;
  apiBase: string;
  instType: "FUTURES" | "SWAP";
  /** The instruments this venue trades; everything else in the instType is ignored. */
  matches(instId: string): boolean;
  kindOf(row: Record<string, string>): Kind;
  /** Keep at most this many coins after the volume and spread gates (highest volume first). */
  universeMax: number;
  /** fixed-slots: charge paper funding at 00/08/16 UTC. per-instrument: at each coin's own settlement time. */
  funding: "fixed-slots" | "per-instrument";
  /** The Hive replays fills against OKX EEA prices, so only EEA bees can join. */
  hive: boolean;
  /** Shown on the dashboard. */
  label: string;
}

const coinOfRow = (row: Record<string, string>) => (row.instId ?? "").split("-")[0] ?? "";

/** OKX's own asset class on global swaps. */
const GLOBAL_CATEGORY: Record<string, Kind> = { "1": "crypto", "3": "stock", "4": "commodity" };

export const VENUES: Record<SiteId, Venue> = {
  eea: {
    site: "eea",
    apiBase: "https://eea.okx.com",
    instType: "FUTURES",
    matches: (instId) => instId.includes("_UM_XPERP-"),
    kindOf: (row) => eeaKindOf(coinOfRow(row)),
    universeMax: Infinity,
    funding: "fixed-slots",
    hive: true,
    label: "OKX X-Perps",
  },
  global: {
    site: "global",
    apiBase: "https://www.okx.com",
    instType: "SWAP",
    matches: (instId) => instId.endsWith("-USDT-SWAP"),
    kindOf: (row) => (coinOfRow(row).startsWith("TEST") ? "test" : (GLOBAL_CATEGORY[row.instCategory ?? ""] ?? "unknown")),
    universeMax: 30,
    funding: "per-instrument",
    hive: false,
    label: "OKX USDT perps",
  },
};

/** OKX_API_BASE, checked against the venue: blank means the venue's own base; another host is refused. */
export function resolveApiBase(venue: Venue, raw: string | undefined): string {
  const base = raw?.trim().replace(/\/+$/, "") || venue.apiBase;
  const want = new URL(venue.apiBase).host;
  const got = new URL(base).host;
  if (got !== want) throw new Error(`OKX_API_BASE points at ${got}, but OKX_SITE=${venue.site} uses ${want}. Remove OKX_API_BASE or make them match.`);
  return base;
}
