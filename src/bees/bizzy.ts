// Bizzy approach 1: confirmed hourly trend breakouts. Jev chooses; code owns eligibility, expense sizing and exits.
import type { CoinStats } from "../market/types.js";
import { maxNotionalUsd, r2 } from "./common.js";
import type { BeeBrain, BeeContext, Intent, Menu, Side } from "./types.js";

const HOUR = 3_600_000;
type Entry = Extract<Intent, { kind: "open" | "switch" }>;

/** Own top-30 crypto pool; do not change the shared universe or the other brains' gates. */
function pool(ctx: BeeContext): CoinStats[] {
  return ctx.view.gated
    .map((id) => ctx.view.stats.get(id))
    .filter((s): s is CoinStats => !!s && ctx.view.instruments.get(s.instId)?.kind === "crypto" && Number.isFinite(s.vol24hUsd) && Number.isFinite(s.spreadBp) && s.spreadBp <= ctx.knobs.spreadGateBps)
    .sort((a, b) => b.vol24hUsd - a.vol24hUsd || a.instId.localeCompare(b.instId))
    .slice(0, 30);
}

function currentStats(ctx: BeeContext): CoinStats[] {
  const epoch = Math.floor(ctx.now / HOUR) * HOUR;
  return pool(ctx).filter((s) => {
    const h = s.hourlyTrend;
    return !!h && h.closedAt === epoch && [h.close, h.channelHigh, h.channelLow, h.ema24, h.ema72, h.atr14, h.ret7dPct, h.volatilityPct].every(Number.isFinite) && h.close > 0;
  });
}

/** Payable settlements within the modeled holding horizon; receiving funding never offsets expense. */
export function breakoutCostFraction(s: CoinStats, side: Side, ctx: BeeContext): number | null {
  const { takerFeeRate } = ctx.cfg.risk;
  if (s.fundingPct === null || ![s.fundingPct, s.spreadBp, takerFeeRate].every(Number.isFinite) || s.spreadBp < 0 || takerFeeRate < 0) return null;
  const interval = s.fundingIntervalMs ?? (ctx.cfg.okx.venue.funding === "fixed-slots" ? 8 * HOUR : null);
  if (interval === null || !Number.isFinite(interval) || interval <= 0) return null;
  const horizon = ctx.cfg.bizzy.fundingHorizonHours * HOUR;
  // With an unknown/stale next settlement, count conservatively from the next full interval plus an immediate one.
  const until = s.fundingAt !== null && Number.isFinite(s.fundingAt) && s.fundingAt > ctx.now ? s.fundingAt - ctx.now : 0;
  const settlements = horizon < until ? 0 : Math.floor((horizon - until) / interval) + 1;
  const payable = Math.max(0, (side === "long" ? 1 : -1) * s.fundingPct / 100);
  return 2 * takerFeeRate + s.spreadBp / 10_000 + ctx.cfg.bizzy.slippageBps / 10_000 + settlements * payable;
}

function executable(side: Side, s: CoinStats): number {
  return side === "long" ? s.ask : s.bid;
}

function executionGate(s: CoinStats, side: Side, ctx: BeeContext): string | null {
  const t = ctx.view.tickers.get(s.instId);
  const h = s.hourlyTrend;
  if (!t || !h || !Number.isFinite(t.ts) || t.ts > ctx.now || ctx.now - t.ts > 3 * ctx.cfg.dataRefreshMs + 30_000) return "stale_ticker";
  const px = executable(side, s);
  if (![px, s.mid, s.bid, s.ask].every(Number.isFinite) || !(s.bid > 0) || s.ask < s.bid) return "invalid_quote";
  if (side === "long" ? s.mid <= h.channelHigh : s.mid >= h.channelLow) return "breakout_invalidated";
  if ((side === "long" ? px - h.close : h.close - px) > 0.5 * h.atr14) return "breakout_chase";
  if (breakoutCostFraction(s, side, ctx) === null) return "unknown_entry_cost";
  return null;
}

export function rankedBreakouts(ctx: BeeContext): Array<{ stats: CoinStats; side: Side; rank: number }> {
  const stats = currentStats(ctx).sort((a, b) => b.hourlyTrend!.ret7dPct - a.hourlyTrend!.ret7dPct || b.vol24hUsd - a.vol24hUsd || a.instId.localeCompare(b.instId));
  const tail = Math.ceil(stats.length * 0.2);
  const eligible: Array<{ stats: CoinStats; side: Side; rank: number }> = [];
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i]!;
    const h = s.hourlyTrend!;
    if (!(h.atr14 > 0) || !(h.volatilityPct > 0)) continue;
    let side: Side | null = null;
    if (i < tail && h.ret7dPct > 0 && h.close > h.channelHigh && h.ema24 > h.ema72) side = "long";
    else if (i >= stats.length - tail && h.ret7dPct < 0 && h.close < h.channelLow && h.ema24 < h.ema72) side = "short";
    if (side && executionGate(s, side, ctx) === null) eligible.push({ stats: s, side, rank: Math.abs(h.ret7dPct) / h.volatilityPct });
  }
  return eligible.sort((a, b) => b.rank - a.rank || b.stats.vol24hUsd - a.stats.vol24hUsd || a.stats.instId.localeCompare(b.stats.instId));
}

export const bizzy: BeeBrain = {
  id: "bizzy",
  strategy: "You are Bizzy, a patient hourly trend-breakout trader. Select one eligible long or short breakout, or WAIT. Entries require a completed hourly close beyond the prior 72 closes, seven-day relative strength in the strongest or weakest 20%, and aligned EMA24/EMA72. Candidates are ordered by absolute seven-day return divided by hourly realized volatility, with volume breaking ties. Use the confirmed numeric state to compare the eligible trends; WAIT when none is convincing. Code sets a cost-aware 2% equity risk budget and handles the 2 ATR initial stop, a 3 ATR peak trail after 1R, and exit after two completed closes against EMA24. No adds, switches, fixed targets, forced entries, midnight exits or time caps.",
  convictionLabels: ["meh", "decent", "juicy", "screaming"],
  neverForce: true,
  trackPeak: true,
  executionPrice: executable,
  decisionEpoch(ctx) {
    return currentStats(ctx).length ? Math.floor(ctx.now / HOUR) * HOUR : null;
  },
  universe(ctx) {
    return pool(ctx).map((s) => s.instId);
  },
  snapshotCoins(ctx) {
    const ids = rankedBreakouts(ctx).map((x) => x.stats.instId);
    if (ctx.bee.position && !ids.includes(ctx.bee.position.instId)) ids.push(ctx.bee.position.instId);
    return ids;
  },
  coinSnapshot(s) {
    const h = s.hourlyTrend;
    return {
      closed_at: h?.closedAt ?? null,
      close: r2(h?.close, 6),
      prior72_high: r2(h?.channelHigh, 6),
      prior72_low: r2(h?.channelLow, 6),
      ema24: r2(h?.ema24, 6),
      ema72: r2(h?.ema72, 6),
      atr1h: r2(h?.atr14, 6),
      r7d_pct: r2(h?.ret7dPct),
      rv1h_pct: r2(h?.volatilityPct, 4),
      spread_bp: r2(s.spreadBp, 1),
    };
  },
  menu(ctx) {
    if (ctx.bee.position) return { HOLD: { desc: "code manages the stop, trail and completed-close exit", intent: { kind: "hold" } } };
    const menu: Menu = {};
    for (const { stats: s, side } of rankedBreakouts(ctx)) menu[`BREAKOUT_${side.toUpperCase()}_${s.coin}`] = { desc: `${side} confirmed hourly trend breakout`, intent: { kind: "open", instId: s.instId, side, sizeFrac: 1, setup: "strict" } };
    if (Object.keys(menu).length) menu.WAIT = { desc: "skip this completed hour", intent: { kind: "hold" } };
    return menu;
  },
  validateOpen(intent, ctx) {
    return rankedBreakouts(ctx).some((x) => x.stats.instId === intent.instId && x.side === intent.side) ? null : "ineligible_hourly_breakout";
  },
  forcedEntry() { return null; },
  sizeFrac(intent: Entry, _conviction, ctx) {
    const s = ctx.view.stats.get(intent.instId);
    const max = maxNotionalUsd(ctx);
    const atr = s?.hourlyTrend?.atr14;
    if (!s || !atr || !(max > 0)) return 0;
    const cost = breakoutCostFraction(s, intent.side, ctx);
    const px = executable(intent.side, s);
    if (cost === null || !(px > 0)) return 0;
    const denominator = 2 * atr / px + cost;
    return denominator > 0 ? Math.min(max, 0.02 * ctx.bee.equityUsd / denominator) / max : 0;
  },
  stopFor(instId, side, entryPx, ctx) {
    const atr = ctx.view.stats.get(instId)?.hourlyTrend?.atr14;
    if (!atr || !Number.isFinite(atr) || !(entryPx > 0)) return null;
    return entryPx + (side === "long" ? -1 : 1) * 2 * atr;
  },
  trail(ctx) {
    const p = ctx.bee.position;
    const atr = p ? ctx.view.stats.get(p.instId)?.hourlyTrend?.atr14 : null;
    if (!p || !atr || !Number.isFinite(atr) || p.initialStopPx == null || p.peakPx == null) return null;
    const initialDistance = Math.abs(p.entryPx - p.initialStopPx);
    const dir = p.side === "long" ? 1 : -1;
    if (!(initialDistance > 0) || dir * (p.peakPx - p.entryPx) < initialDistance) return null;
    return p.peakPx - dir * 3 * atr;
  },
  deterministicExit(ctx) {
    const p = ctx.bee.position;
    const h = p ? ctx.view.stats.get(p.instId)?.hourlyTrend : null;
    if (!p || !h || h.closedAt > ctx.now || h.closedAt <= p.openedAt) return null;
    const against = p.side === "long" ? h.belowEma24 : h.aboveEma24;
    return against[0] && against[1] ? "hourly_ema_exit" : null;
  },
  idleStatus() { return "waiting for a confirmed hourly trend breakout"; },
};
