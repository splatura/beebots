import { describe, expect, it } from "vitest";
import { customBrain, deriveStyle } from "../src/bees/custom.js";
import { BRAINS } from "../src/bees/index.js";
import { bee, coin, ctx, position, trend, view, NOW } from "./fixtures.js";

// A market where TRUMP is the weakest mover, so an unrestricted Momentum bee would never pick it.
const market = () =>
  view([
    coin("PEPE", { ret7dPct: 40, ret24hPct: 10 }),
    coin("DOGE", { ret7dPct: 25, ret24hPct: 5 }),
    coin("SOL", { ret7dPct: 10, ret24hPct: 2 }),
    coin("TRUMP", { ret7dPct: -5, ret24hPct: -1 }),
  ]);

describe("owner-designed bees", () => {
  const trump = customBrain(BRAINS.boozy, { coins: ["TRUMP"], rules: "Only trade TRUMP. Go long when it pumps." });

  it("a coin-restricted bee is only ever offered its own coins", () => {
    const c = ctx("boozy", bee("boozy"), market());
    expect(Object.keys(BRAINS.boozy.menu(c))).toContain("APE_PEPE");
    expect(Object.keys(trump.menu(c))).toEqual(["APE_TRUMP"]);
    expect(trump.universe(c).map((id) => id.split("-")[0])).toEqual(["TRUMP"]);
    expect(trump.forcedEntry(c)?.instId).toMatch(/^TRUMP-/);
    expect(trump.snapshotCoins(c).map((id) => id.split("-")[0])).toEqual(["TRUMP"]);
  });

  it("drops any move that names another coin, and forced entries outside the list become null", () => {
    const m = market();
    const pepe = m.stats.get("PEPE-USD_UM_XPERP-310404")!;
    // Holding PEPE (e.g. adopted from the exchange): managing it is fine, switching to another coin is not.
    const held = bee("boozy", { position: position(pepe, { openedAt: 0 }) });
    const menu = trump.menu(ctx("boozy", held, m));
    for (const opt of Object.values(menu)) {
      if (opt.intent.kind === "open" || opt.intent.kind === "switch") expect(opt.intent.instId).toMatch(/^(TRUMP|PEPE)-/);
    }
    expect(menu.RIDE).toBeDefined();
    const noTrump = view([coin("PEPE"), coin("DOGE")]);
    expect(trump.forcedEntry(ctx("boozy", bee("boozy"), noTrump))).toBeNull();
    expect(trump.menu(ctx("boozy", bee("boozy"), noTrump))).toEqual({});
  });

  it("keeps Bizzy's hourly decision and entry validation inside a custom bee's coin filter", () => {
    const hour = Math.floor(NOW / 3_600_000) * 3_600_000;
    const h = {
      closedAt: hour,
      close: 100,
      channelHigh: 99,
      channelLow: 98,
      ema24: 2,
      ema72: 1,
      belowEma24: [false, false] as [boolean, boolean],
      aboveEma24: [false, false] as [boolean, boolean],
      atr14: 1,
      ret7dPct: 5,
      volatilityPct: 2,
    };
    const allowed = coin("TRUMP", { hourlyTrend: h });
    const excluded = coin("PEPE", { hourlyTrend: h });
    const filtered = customBrain(BRAINS.bizzy, { coins: ["TRUMP"], rules: "Only trade TRUMP." });
    const allowedCtx = ctx("bizzy", bee("bizzy"), view([allowed, excluded]), undefined, hour);
    const menu = filtered.menu(allowedCtx);
    expect(Object.keys(menu)).toContain("BREAKOUT_LONG_TRUMP");
    expect(Object.keys(menu)).not.toContain("BREAKOUT_LONG_PEPE");
    expect(filtered.decisionEpoch?.(allowedCtx)).toBe(hour);
    expect(filtered.validateOpen?.({ kind: "open", instId: allowed.instId, side: "long", sizeFrac: 1, setup: "strict" }, allowedCtx)).toBeNull();
    expect(filtered.validateOpen?.({ kind: "open", instId: excluded.instId, side: "long", sizeFrac: 1, setup: "strict" }, allowedCtx)).not.toBeNull();

    const staleHour = coin("TRUMP", { hourlyTrend: { ...h, closedAt: hour - 60 * 60_000 } });
    const staleCtx = ctx("bizzy", bee("bizzy"), view([staleHour]), undefined, hour);
    expect(filtered.decisionEpoch?.(staleCtx)).toBeNull();
    const excludedOnly = ctx("bizzy", bee("bizzy"), view([excluded]), undefined, hour);
    expect(filtered.decisionEpoch?.(excludedOnly)).toBeNull();
    expect(filtered.validateOpen?.({ kind: "open", instId: excluded.instId, side: "long", sizeFrac: 1, setup: "strict" }, excludedOnly)).not.toBeNull();
  });

  it("retains Breezy's position rebalance for a custom coin-restricted bee", () => {
    const btc = coin("BTC", { trend: trend({ score: 9, rv90Pct: 10 }) });
    const eth = coin("ETH", { trend: trend({ score: 0, rv90Pct: 10 }) });
    const held = bee("breezy", { position: position(btc) });
    const c = ctx("breezy", held, view([btc, eth]));
    const custom = customBrain(BRAINS.breezy, { coins: ["BTC"], rules: "Trade BTC only." });
    expect(custom.rebalance?.(c)).toMatchObject({ kind: "add" });
  });


  it("keeps Bizzy for any dynamic universe or owner-selected coins", () => {
    expect(deriveStyle("bizzy", [])).toBe("bizzy");
    expect(deriveStyle("bizzy", ["TRUMP", "DOGE"])).toBe("bizzy");
    expect(deriveStyle("breezy", ["ETH"])).toBe("breezy");
    expect(deriveStyle("breezy", [])).toBe("boozy");
    expect(deriveStyle("breezy", ["BTC", "DOGE"])).toBe("boozy");
    expect(deriveStyle("boozy", ["BTC"])).toBe("boozy");
  });
});
