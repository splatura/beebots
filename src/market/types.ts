import type { Kind } from "./kinds.js";

export interface Instrument {
  instId: string;
  coin: string;
  kind: Kind;
  ctVal: number;
  lotSz: number;
  minSz: number;
  tickSz: number;
  state: string;
}

export interface Ticker {
  instId: string;
  last: number;
  bid: number;
  ask: number;
  mid: number;
  spreadBp: number;
  vol24hUsd: number;
  open24h: number;
  ts: number;
}

/** Oldest first. `volUsd` is quote volume in USD. */
export interface Candle {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  volUsd: number;
  confirmed: boolean;
}

export interface FundingNow {
  rate: number;
  /** When the current funding period settles (OKX's `fundingTime`), ms. */
  fundingAt: number;
  /** Next settlement, used only to infer the instrument's current interval. */
  nextFundingAt?: number;
  intervalMs?: number;
}

/** Everything the snapshot builder and risk layer may know about one coin. Numbers only. */
export interface CoinStats {
  instId: string;
  coin: string;
  last: number;
  mid: number;
  bid: number;
  ask: number;
  spreadBp: number;
  vol24hUsd: number;
  // 15m bars
  rsi14: number | null;
  pctB: number | null;
  bbWidthPct: number | null;
  bbMid: number | null;
  atr14Pct: number | null;
  macdHistPct: number | null;
  ret1hPct: number | null;
  // 1h bars
  ret24hPct: number | null;
  ret7dPct: number | null;
  volZ: number | null;
  // funding + OI
  fundingPct: number | null;
  fundingZ: number | null;
  /** When the coin's current funding period settles (ms), null when unknown. */
  fundingAt: number | null;
  /** Current settlement interval, used by hourly breakout cost sizing only. */
  fundingIntervalMs?: number | null;
  oiUsd: number | null;
  oiChg1hPct: number | null;
  // news (kit news module; null when unavailable)
  newsZ: number | null;
  sentiment: number | null;
  // 4h trend (breezy's coins only)
  trend?: TrendStats;
  /** Confirmed hourly inputs for Bizzy; legacy indicators above deliberately retain their semantics. */
  hourlyTrend?: HourlyTrendStats | null;
}

export interface HourlyTrendStats {
  /** End of the latest confirmed candle (its opening timestamp plus one hour). */
  closedAt: number;
  close: number;
  /** Highest/lowest of the PRIOR 72 closes, excluding the signal candle. */
  channelHigh: number;
  channelLow: number;
  ema24: number;
  ema72: number;
  /** Previous and latest completed close compared with their own EMA24. */
  belowEma24: readonly [boolean, boolean];
  aboveEma24: readonly [boolean, boolean];
  atr14: number;
  ret7dPct: number;
  /** Standard deviation of the latest 168 hourly log returns, in percent (not annualised). */
  volatilityPct: number;
}

export interface TrendStats {
  /** Ensemble Donchian score, -9..+9 (long slices on minus short slices on). */
  score: number;
  longOn: number;
  shortOn: number;
  slicesAvailable: number;
  atr4hPct: number | null;
  rv90Pct: number | null;
  /** Average trailing stop of the slices in the dominant direction, or null if none on. */
  trailStop: number | null;
  /** At a 10-day (60 x 4h) closing high (+1) or low (-1), else 0. */
  tenDayExtreme: -1 | 0 | 1;
}

export interface MarketView {
  ts: number;
  instruments: Map<string, Instrument>;
  tickers: Map<string, Ticker>;
  stats: Map<string, CoinStats>;
  /** Gated crypto universe (boozy's pool), ranked by 24h volume. */
  gated: string[];
  /** Coins that passed volume but failed the spread gate (for "boozy wanted RAY" moments). */
  spreadBlocked: string[];
  newsAvailable: boolean;
}
