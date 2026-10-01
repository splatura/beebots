// Global swaps settle per coin: the engine charges each held coin once, and retries a charge that bailed.
import { describe, expect, it } from "vitest";
import type { Alerts } from "../src/alerts.js";
import { Db } from "../src/db.js";
import { Engine } from "../src/engine.js";
import { EventBus } from "../src/events.js";
import type { Executor } from "../src/exec/executor.js";
import { Jev } from "../src/jev.js";
import type { MarketFeed } from "../src/market/data.js";
import type { MarketView } from "../src/market/types.js";
import { coin, NOW, position, testConfig, view } from "./fixtures.js";

describe("per-instrument paper funding", () => {
  it("charges a settlement once under its bill id, and retries it when the first attempt had no stats", async () => {
    const cfg = testConfig({ DRY_RUN: "true", OKX_SITE: "global" });
    const at = NOW + 60_000;
    const c = coin("ENA", { fundingPct: 0.01, fundingAt: at });
    const v: MarketView = view([c]);
    const empty: MarketView = { ...v, stats: new Map() };
    let cur = v;
    const feed = { view: () => cur, refresh: async () => {}, refreshTickers: async () => {}, lastRefreshAt: NOW } as unknown as MarketFeed;
    const exec = { kind: "sim", async init() {}, async positions() { return []; }, async fundingBills() { return []; }, async feesFor() { return new Map(); } } as unknown as Executor;
    const db = new Db(":memory:");
    let now = NOW;
    const engine = new Engine({ cfg, db, feed, jev: new Jev({ ...cfg.jev, client: { async systemOne() { throw new Error("no"); } }, now: () => now }), exec, bus: new EventBus(db), alerts: { send: () => {} } as unknown as Alerts, now: () => now });
    await engine.start();
    engine.stop();
    engine.bees.bee1.position = position(c);
    const fund = () => (engine as unknown as { simulateFunding(n: number): void }).simulateFunding(now);
    const bills = () => (db as unknown as { raw: { prepare(s: string): { all(): { bill_id: string }[] } } }).raw.prepare("SELECT bill_id FROM funding").all().map((r) => r.bill_id);
    fund(); // learns the settlement time
    now = at + 1_000;
    cur = empty; // settled, but the feed has no stats this tick: the charge bails
    fund();
    expect(bills()).toEqual([]);
    cur = v;
    fund(); // stats are back: the same settlement is retried
    fund(); // and not charged twice
    expect(bills()).toEqual([`sim-bee1-${c.instId}-${at}`]);
  });
});
