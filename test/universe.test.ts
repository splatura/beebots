import { describe, expect, it } from "vitest";
import type { Instrument, Ticker } from "../src/market/types.js";
import { gateUniverse } from "../src/market/universe.js";
import { VENUES } from "../src/okx/venue.js";

const inst = (instId: string, kind: Instrument["kind"] = "crypto"): Instrument => ({ instId, coin: instId.split("-")[0]!, kind, ctVal: 1, lotSz: 1, minSz: 1, tickSz: 0.01, state: "live" });
const tick = (instId: string, volM: number, spreadBp = 1): Ticker => ({ instId, last: 1, bid: 1, ask: 1, mid: 1, spreadBp, vol24hUsd: volM * 1e6, open24h: 1, ts: 0 });

describe("gateUniverse", () => {
  const ids = ["A-USDT-SWAP", "B-USDT-SWAP", "C-USDT-SWAP", "D-USDT-SWAP"];
  const instruments = ids.map((id) => inst(id));
  const tickers = new Map([tick(ids[0]!, 5), tick(ids[1]!, 40), tick(ids[2]!, 20, 99), tick(ids[3]!, 10)].map((t) => [t.instId, t]));
  const base = { min24hVolUsd: 1e6, spreadGateBps: 15, allowNonCrypto: false, matches: VENUES.global.matches };

  it("ranks by volume after the gates, and keeps the top `max`", () => {
    expect(gateUniverse(instruments, tickers, { ...base, max: 2 }).tradable).toEqual(["B-USDT-SWAP", "D-USDT-SWAP"]);
  });

  it("coins cut by the cap are not reported as spread-blocked", () => {
    const u = gateUniverse(instruments, tickers, { ...base, max: 1 });
    expect(u.tradable).toEqual(["B-USDT-SWAP"]);
    expect(u.spreadBlocked).toEqual(["C-USDT-SWAP"]);
  });

  it("no cap by default", () => {
    expect(gateUniverse(instruments, tickers, base).tradable).toEqual(["B-USDT-SWAP", "D-USDT-SWAP", "A-USDT-SWAP"]);
  });

  it("only the venue's instruments pass (default: EEA X-Perps)", () => {
    const x = inst("E-USD_UM_XPERP-310404");
    const t = new Map([[x.instId, tick(x.instId, 50)], ...tickers]);
    expect(gateUniverse([x, ...instruments], t, { min24hVolUsd: 1e6, spreadGateBps: 15, allowNonCrypto: false }).tradable).toEqual(["E-USD_UM_XPERP-310404"]);
    expect(gateUniverse([x, ...instruments], t, base).tradable).not.toContain("E-USD_UM_XPERP-310404");
  });
});
