import { describe, expect, it } from "vitest";
import type { Alerts } from "../src/alerts.js";
import { bizzy, breakoutCostFraction, rankedBreakouts } from "../src/bees/bizzy.js";
import { boozy } from "../src/bees/boozy.js";
import { breezy } from "../src/bees/breezy.js";
import { maxNotionalUsd } from "../src/bees/common.js";
import type { BeeContext, Intent } from "../src/bees/types.js";
import { Db } from "../src/db.js";
import { Engine } from "../src/engine.js";
import { EventBus } from "../src/events.js";
import { SimExecutor } from "../src/exec/executor.js";
import { contractsFor } from "../src/exec/sizing.js";
import { Jev, type SystemOne } from "../src/jev.js";
import { computeStats, type MarketFeed } from "../src/market/data.js";
import { hourlyTrendStats } from "../src/market/indicators.js";
import type { Candle, CoinStats, HourlyTrendStats } from "../src/market/types.js";
import { applyRisk } from "../src/risk.js";
import { bee, coin, ctx, NOW, position, testConfig, trend, view } from "./fixtures.js";

const HOUR = 3_600_000;
function hourly(over: Partial<HourlyTrendStats> = {}): HourlyTrendStats {
  return { closedAt: NOW, close: 100, channelHigh: 99, channelLow: 90, ema24: 98, ema72: 95, belowEma24: [false, false], aboveEma24: [true, true], atr14: 1, ret7dPct: 10, volatilityPct: 1, ...over };
}
function signal(name = "SOL", over: Partial<HourlyTrendStats> = {}, px = 100): CoinStats {
  return coin(name, { hourlyTrend: hourly(over), fundingAt: NOW + HOUR, fundingIntervalMs: 4 * HOUR }, px);
}
function risk(c: BeeContext, intent: Intent | null, jev: "ok" | "unreachable" | "daily_cap" | "no_options" = "ok") {
  return applyRisk({ ctx: c, brain: bizzy, proposal: intent ? { label: "entry", intent, conviction: 0, prob: 0.1 } : null, jev, sizeMult: 1, dataAgeMs: 0, maxDataAgeMs: 210_000 });
}
const entry = (s: CoinStats, side: "long" | "short" = "long"): Extract<Intent, { kind: "open" }> => ({ kind: "open", instId: s.instId, side, sizeFrac: 1, setup: "strict" });

function candles(): Candle[] {
  return Array.from({ length: 169 }, (_, i) => {
    const c = 100 + i * 0.1 + Math.sin(i) * 0.02;
    return { ts: NOW - (169 - i) * HOUR, o: c, h: c + 0.5, l: c - 0.5, c, volUsd: 1e6, confirmed: true };
  });
}

describe("confirmed hourly inputs", () => {
  it("ignores forming bars, excludes the signal from the prior72 channel and measures exactly168hours", () => {
    const bars = candles();
    const forming = { ...bars[168]!, ts: NOW, c: 9999, h: 9999, confirmed: false };
    const h = hourlyTrendStats([...bars, forming])!;
    expect(h.closedAt).toBe(NOW);
    expect(h.close).toBe(bars[168]!.c);
    expect(h.channelHigh).toBe(Math.max(...bars.slice(96, 168).map((c) => c.c)));
    expect(h.channelHigh).toBeLessThan(h.close);
    expect(h.ret7dPct).toBeCloseTo((bars[168]!.c / bars[0]!.c - 1) * 100, 10);
    expect(hourlyTrendStats(bars.slice(1))).toBeNull();
  });
  it("rejects hourly gaps, duplicates and invalid prices rather than treating169rows as7days", () => {
    for (const bad of ["gap", "duplicate", "nan"] as const) {
      const bars = candles();
      if (bad === "gap") bars[50]!.ts -= HOUR;
      if (bad === "duplicate") bars[50]!.ts = bars[49]!.ts;
      if (bad === "nan") bars[50]!.c = NaN;
      expect(hourlyTrendStats(bars)).toBeNull();
    }
  });
  it("adds hourly stats without replacing the other styles' ticker-based legacy returns", () => {
    const s = coin("SOL", {}, 500);
    const v = view([s]);
    const bars = candles();
    const got = computeStats(v.instruments.get(s.instId)!, v.tickers.get(s.instId)!, [], bars);
    expect(got.ret7dPct).toBeCloseTo((500 / bars[0]!.c - 1) * 100);
    expect(got.hourlyTrend!.ret7dPct).toBeCloseTo((bars[168]!.c / bars[0]!.c - 1) * 100);
  });
});

describe("hourly eligibility and ranking", () => {
  it("offers strongest20% longs and weakest20% shorts, ranked by return/volatility then volume", () => {
    const stats = [signal("A", { ret7dPct: 20, volatilityPct: 4 }), signal("B", { ret7dPct: 15, volatilityPct: 1 }), ...[10, 8, 5, 2, -2, -5].map((r, i) => signal(`C${i}`, { ret7dPct: r })), signal("X", { close: 90, channelLow: 91, ema24: 92, ema72: 95, ret7dPct: -15, volatilityPct: 1 }, 90), signal("Y", { close: 90, channelLow: 91, ema24: 92, ema72: 95, ret7dPct: -20, volatilityPct: 4 }, 90)];
    stats[1]!.vol24hUsd = 30e6;
    const c = ctx("bizzy", bee("bizzy"), view(stats));
    expect(rankedBreakouts(c).map((x) => [x.stats.coin, x.side])).toEqual([["B", "long"], ["X", "short"], ["A", "long"], ["Y", "short"]]);
    expect(Object.keys(bizzy.menu(c))).toEqual(["BREAKOUT_LONG_B", "BREAKOUT_SHORT_X", "BREAKOUT_LONG_A", "BREAKOUT_SHORT_Y", "WAIT"]);
  });
  it("uses dynamic crypto volume top30 and the existing shared gate, not a fixed coin list", () => {
    const stats = Array.from({ length: 32 }, (_, i) => ({ ...signal(`TOKEN${i}`), vol24hUsd: (32 - i) * 1e6 }));
    const v = view(stats);
    v.instruments.get(stats[0]!.instId)!.kind = "stock";
    v.gated = v.gated.filter((id) => id !== stats[1]!.instId);
    expect(bizzy.universe(ctx("bizzy", bee("bizzy"), v))).toEqual(stats.slice(2).map((s) => s.instId));
  });
  it("rejects a chase, invalidated breakout, stale ticker, missing costs and wrong-hour bars", () => {
    for (const failure of ["chase", "invalidated", "stale", "funding", "hour"] as const) {
      const s = signal();
      const v = view([s]);
      if (failure === "chase") s.ask = 100.51;
      if (failure === "invalidated") s.mid = 99;
      if (failure === "stale") v.tickers.get(s.instId)!.ts -= 300_000;
      if (failure === "funding") s.fundingPct = null;
      if (failure === "hour") s.hourlyTrend!.closedAt -= HOUR;
      expect(Object.keys(bizzy.menu(ctx("bizzy", bee("bizzy"), v)))).toEqual([]);
    }
  });
  it("requires sign, close breakout and EMA alignment, including short mirror", () => {
    for (const h of [{ ret7dPct: 0 }, { ema24: 94 }, { close: 99 }]) expect(rankedBreakouts(ctx("bizzy", bee("bizzy"), view([signal("S", h)])))).toEqual([]);
    const s = signal("SHORT", { close: 90, channelLow: 91, ema24: 92, ema72: 95, ret7dPct: -10 }, 90);
    expect(bizzy.menu(ctx("bizzy", bee("bizzy"), view([s]))).BREAKOUT_SHORT_SHORT!.intent).toMatchObject({ side: "short" });
    s.bid = 89.49;
    expect(rankedBreakouts(ctx("bizzy", bee("bizzy"), view([s])))).toEqual([]);
  });
  it("uses actual ticker age and feed freshness, independently of a faster decision loop", () => {
    const s = signal();
    const v = view([s]);
    const cfg = testConfig({ TICK_MS: "2000", DATA_REFRESH_MS: "60000" });
    const c = ctx("bizzy", bee("bizzy"), v, cfg);
    v.tickers.get(s.instId)!.ts = NOW - 210_000;
    expect(rankedBreakouts(c).map((x) => x.stats.coin)).toEqual(["SOL"]);
    v.tickers.get(s.instId)!.ts--;
    expect(rankedBreakouts(c)).toEqual([]);
    v.tickers.get(s.instId)!.ts = NOW + 1;
    expect(rankedBreakouts(c)).toEqual([]);
  });
});

describe("expense-aware risk and exits", () => {
  it("bounds planned stop plus all modeled expenses at2% of current equity after lot rounding", () => {
    for (const side of ["long", "short"] as const) {
      const s = side === "long" ? signal() : signal("SHORT", { close: 90, channelLow: 91, ema24: 92, ema72: 95, ret7dPct: -10 }, 90);
      const v = view([s]);
      const c = ctx("bizzy", bee("bizzy", { equityUsd: 400 }), v);
      const result = risk(c, entry(s, side));
      expect(result.action.kind).toBe("open");
      if (result.action.kind !== "open") throw new Error("entry vetoed");
      const px = side === "long" ? s.ask : s.bid;
      const denominator = 2 * s.hourlyTrend!.atr14 / px + breakoutCostFraction(s, side, c)!;
      expect(result.action.notionalUsd).toBeCloseTo(8 / denominator, 8);
      const inst = v.instruments.get(s.instId)!;
      const lots = contractsFor(result.action.notionalUsd, inst, px);
      expect(lots * inst.ctVal * px * denominator).toBeLessThanOrEqual(8 + 1e-10);
      expect(bizzy.stopFor(s.instId, side, px, c)).toBe(px + (side === "long" ? -2 : 2));
    }
  });
  it("counts shorter funding intervals and never credits receipts; EEA keeps8h fallback", () => {
    const s = signal();
    const c = ctx("bizzy", bee("bizzy"), view([s]), testConfig({ OKX_SITE: "global" }));
    const four = breakoutCostFraction(s, "long", c)!;
    s.fundingIntervalMs = HOUR;
    expect(breakoutCostFraction(s, "long", c)! - four).toBeCloseTo(18 * 0.0001);
    s.fundingPct = -0.01;
    expect(breakoutCostFraction(s, "long", c)).toBeCloseTo(0.0016);
    expect(breakoutCostFraction(s, "short", c)!).toBeGreaterThan(0.0016);
    s.fundingIntervalMs = null;
    expect(breakoutCostFraction(s, "short", c)).toBeNull();
    expect(breakoutCostFraction(s, "short", { ...c, cfg: testConfig() })).not.toBeNull();
  });
  it("respects the unchanged headroom ceiling and rejects instrument minimums after rounding", () => {
    const s = signal("SOL", { atr14: 0.1 });
    const v = view([s]);
    const c = ctx("bizzy", bee("bizzy"), v);
    expect(bizzy.sizeFrac(entry(s), 3, c) * maxNotionalUsd(c)).toBeCloseTo(maxNotionalUsd(c));
    v.instruments.get(s.instId)!.minSz = 1000;
    expect(risk(c, entry(s)).action).toEqual({ kind: "none" });
  });
  it("accepts the exact executable-price minimum lot on both sides, and rejects a budget below it", () => {
    for (const side of ["long", "short"] as const) {
      const s = side === "long" ? signal() : signal("SHORT", { close: 90, channelLow: 91, ema24: 92, ema72: 95, ret7dPct: -10 }, 90);
      const v = view([s]);
      const c = ctx("bizzy", bee("bizzy"), v);
      const intent = entry(s, side);
      const px = side === "long" ? s.ask : s.bid;
      const budget = bizzy.sizeFrac(intent, 3, c) * maxNotionalUsd(c);
      const inst = v.instruments.get(s.instId)!;
      inst.ctVal = budget / px;
      expect(risk(c, intent).action.kind).toBe("open");
      inst.ctVal *= 1.01;
      expect(risk(c, intent).action).toEqual({ kind: "none" });
    }
  });
  it("starts peak trailing at1R, mirrors shorts and tolerates legacy favourable initial stops", () => {
    const s = signal();
    for (const side of ["long", "short"] as const) {
      const dir = side === "long" ? 1 : -1;
      const p = position(s, { side, initialStopPx: 100 - dir * 2, peakPx: 100 + dir * 1.99 });
      const c = ctx("bizzy", bee("bizzy", { position: p }), view([s]));
      expect(bizzy.trail!(c)).toBeNull();
      p.peakPx = 100 + dir * 2;
      expect(bizzy.trail!(c)).toBe(100 - dir);
      p.initialStopPx = 100 + dir * 2;
      p.peakPx = 100 + dir * 5;
      expect(bizzy.trail!(c)).toBe(100 + dir * 2);
    }
  });
  it("EMA closes are deterministic even when Jev is down, daily-capped or the bee is benched", () => {
    for (const side of ["long", "short"] as const) for (const jev of ["unreachable", "daily_cap", "no_options"] as const) {
      const s = signal("SOL", { belowEma24: [true, true], aboveEma24: [true, true] });
      const p = position(s, { side, stopPx: side === "long" ? 90 : 110, openedAt: NOW - 4 * HOUR });
      const c = ctx("bizzy", bee("bizzy", { position: p, cap: "trade_cap" }), view([s]));
      expect(risk(c, null, jev).action).toEqual({ kind: "close", reason: "hourly_ema_exit" });
      s.hourlyTrend!.belowEma24 = [false, true];
      s.hourlyTrend!.aboveEma24 = [false, true];
      expect(risk(c, null, jev).action).toEqual({ kind: "none" });
      s.hourlyTrend!.belowEma24 = [true, true];
      s.hourlyTrend!.aboveEma24 = [true, true];
      p.openedAt = NOW;
      expect(risk(c, null, jev).action).toEqual({ kind: "none" });
    }
  });
  it("does not change Breezy/Boozy menus or sizing when hourly data appears", () => {
    const s = coin("BTC", { ret24hPct: 12, trend: trend({ score: 5 }) });
    for (const [id, brain] of [["breezy", breezy], ["boozy", boozy]] as const) {
      const c = ctx(id, bee(id), view([s]));
      const before = brain.menu(c);
      const intent = Object.values(before).find((x) => x.intent.kind === "open")!.intent as Extract<Intent, { kind: "open" }>;
      const size = brain.sizeFrac(intent, 3, c);
      s.hourlyTrend = hourly({ belowEma24: [true, true] });
      expect(brain.menu(c)).toEqual(before);
      expect(brain.sizeFrac(intent, 3, c)).toBe(size);
      delete s.hourlyTrend;
    }
  });
});

async function harness(choice = "WAIT") {
  let now = NOW;
  const cfg = testConfig();
  const s = signal();
  const v = view([s]);
  let calls = 0;
  let selected = choice;
  const client: SystemOne = { async systemOne() {
    calls++;
    if (selected === "ERROR") throw new Error("offline");
    return { model: "fake", usage: { input_tokens: 1, output_tokens: 0 }, answers: { action: { type: "choice", choice: selected, probabilities: { [selected]: 1 }, confidence: 1 }, conviction: { type: "score", score: 3, confidence: 1, probabilities: {}, legend: {} } } } as never;
  } };
  const feed = { lastRefreshAt: NOW, view: () => v, async refresh() {}, async refreshTickers() {} } as unknown as MarketFeed;
  const db = new Db(":memory:");
  const exec = new SimExecutor(() => v, cfg.risk.takerFeeRate, () => now);
  const engine = new Engine({ cfg, db, exec, feed, bus: new EventBus(db), jev: new Jev({ ...cfg.jev, client, now: () => now }), alerts: { send() {} } as unknown as Alerts, now: () => now });
  await engine.start();
  engine.stop();
  engine.bees.bee2.cap = "trade_cap";
  engine.bees.bee3.cap = "trade_cap";
  return { engine, db, s, v, calls: () => calls, select: (x: string) => { selected = x; }, advance: (ms: number) => { now += ms; feed.lastRefreshAt = now; v.tickers.get(s.instId)!.ts = now; }, now: () => now };
}

describe("restart-safe hourly engine cadence", () => {
  it.each(["WAIT", "ERROR"])("consumes %s once, survives serialization, and waits for new completed data at hour rollover", async (choice) => {
    const h = await harness(choice);
    try {
      await h.engine.tick();
      await h.engine.tick();
      expect(h.calls()).toBe(1);
      h.engine.bees.bee1 = h.db.loadBee("bee1")!;
      await h.engine.tick();
      expect(h.calls()).toBe(1);
      h.advance(HOUR);
      await h.engine.tick();
      expect(h.engine.bees.bee1.hourlyDecisionAt).toBe(NOW);
      h.s.hourlyTrend!.closedAt = h.now();
      await h.engine.tick();
      expect(h.calls()).toBe(2);
    } finally { h.engine.stop(); h.db.raw.close(); }
  });
  it("consumes a completed hour with no eligible entries, including zero volatility, without a model call", async () => {
    const h = await harness("BREAKOUT_LONG_SOL");
    try {
      h.s.hourlyTrend!.volatilityPct = 0;
      await h.engine.tick();
      expect(h.calls()).toBe(0);
      h.s.hourlyTrend!.volatilityPct = 1;
      await h.engine.tick();
      expect(h.calls()).toBe(0);
      expect(h.engine.bees.bee1.position).toBeNull();
      h.advance(HOUR);
      h.s.hourlyTrend!.closedAt = h.now();
      await h.engine.tick();
      expect(h.engine.bees.bee1.position?.side).toBe("long");
      expect(h.calls()).toBe(1);
    } finally { h.engine.stop(); h.db.raw.close(); }
  });
  it("opens at the touch, tracks monotonic peaks/stops, exits benched and cannot reenter the same hour", async () => {
    const h = await harness("BREAKOUT_LONG_SOL");
    try {
      await h.engine.tick();
      const p = h.engine.bees.bee1.position!;
      expect(p.entryPx).toBe(h.s.ask);
      expect(p.stopPx).toBe(p.entryPx - 2);
      const quote = (px: number) => { h.s.mid = px; h.s.bid = px - 0.005; h.s.ask = px + 0.005; const t = h.v.tickers.get(h.s.instId)!; Object.assign(t, { mid: px, bid: h.s.bid, ask: h.s.ask }); };
      quote(101);
      await h.engine.tick();
      expect(p.stopPx).toBe(p.entryPx - 2);
      quote(105);
      await h.engine.tick();
      expect(p.peakPx).toBe(105);
      expect(p.stopPx).toBe(102);
      h.s.hourlyTrend!.atr14 = 2;
      quote(104);
      await h.engine.tick();
      expect(p.peakPx).toBe(105);
      expect(p.stopPx).toBe(102);
      h.advance(HOUR);
      h.s.hourlyTrend!.closedAt = h.now();
      h.s.hourlyTrend!.belowEma24 = [true, true];
      h.engine.bees.bee1.cap = "trade_cap";
      await h.engine.tick();
      expect(h.engine.bees.bee1.position).toBeNull();
      expect(h.db.raw.prepare("SELECT purpose FROM orders WHERE bee='bee1' ORDER BY id DESC LIMIT 1").get()).toMatchObject({ purpose: "hourly_ema_exit" });
      h.engine.bees.bee1.cap = null;
      quote(100);
      await h.engine.tick();
      expect(h.engine.bees.bee1.position).toBeNull();
      expect(h.calls()).toBe(1);
    } finally { h.engine.stop(); h.db.raw.close(); }
  });
  it("a stop on the entry candle cannot ask Jev again or reopen that candle", async () => {
    const h = await harness("BREAKOUT_LONG_SOL");
    try {
      await h.engine.tick();
      h.s.mid = 97;
      const t = h.v.tickers.get(h.s.instId)!;
      t.mid = 97; t.bid = 96.995; t.ask = 97.005;
      await h.engine.tick();
      expect(h.engine.bees.bee1.position).toBeNull();
      h.s.mid = 100;
      t.mid = 100; t.bid = h.s.bid; t.ask = h.s.ask;
      await h.engine.tick();
      expect(h.calls()).toBe(1);
      expect(h.engine.bees.bee1.position).toBeNull();
    } finally { h.engine.stop(); h.db.raw.close(); }
  });
});
