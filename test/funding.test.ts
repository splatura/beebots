import { describe, expect, it } from "vitest";
import { nextFunding, type FundingTrack } from "../src/funding.js";

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);

describe("per-instrument paper funding", () => {
  it("the first sighting only starts tracking: nothing is charged", () => {
    const r = nextFunding(undefined, "BTC-USDT-SWAP", T0, T0 - H);
    expect(r).toEqual({ charge: null, track: { instId: "BTC-USDT-SWAP", at: T0, chargedAt: null } });
  });

  it("nothing before the settlement", () => {
    const t: FundingTrack = { instId: "BTC-USDT-SWAP", at: T0, chargedAt: null };
    expect(nextFunding(t, "BTC-USDT-SWAP", T0, T0 - 1).charge).toBeNull();
  });

  it("charges the earlier settlement once, even when the feed already shows the next period", () => {
    let t: FundingTrack | undefined = { instId: "BTC-USDT-SWAP", at: T0, chargedAt: null };
    const a = nextFunding(t, "BTC-USDT-SWAP", T0 + 8 * H, T0 + 5_000);
    expect(a.charge).toBe(T0);
    expect(a.track).toEqual({ instId: "BTC-USDT-SWAP", at: T0 + 8 * H, chargedAt: T0 });
    t = a.track;
    expect(nextFunding(t, "BTC-USDT-SWAP", T0 + 8 * H, T0 + 15_000).charge).toBeNull();
  });

  it("a stale feed (fundingAt not moved on yet) still charges only once", () => {
    const t: FundingTrack = { instId: "BTC-USDT-SWAP", at: T0, chargedAt: null };
    const a = nextFunding(t, "BTC-USDT-SWAP", T0, T0 + 1_000);
    expect(a.charge).toBe(T0);
    expect(nextFunding(a.track, "BTC-USDT-SWAP", T0, T0 + 2_000).charge).toBeNull();
    const b = nextFunding(a.track, "BTC-USDT-SWAP", T0 + 8 * H, T0 + 60_000);
    expect(b.charge).toBeNull();
    expect(b.track!.at).toBe(T0 + 8 * H);
    expect(nextFunding(b.track, "BTC-USDT-SWAP", T0 + 16 * H, T0 + 8 * H + 1).charge).toBe(T0 + 8 * H);
  });

  it("a different coin starts over without charging", () => {
    const t: FundingTrack = { instId: "BTC-USDT-SWAP", at: T0, chargedAt: null };
    expect(nextFunding(t, "ETH-USDT-SWAP", T0 + 4 * H, T0 + 1).charge).toBeNull();
    expect(nextFunding(t, "ETH-USDT-SWAP", T0 + 4 * H, T0 + 1).track).toEqual({ instId: "ETH-USDT-SWAP", at: T0 + 4 * H, chargedAt: null });
  });

  it("no fundingAt yet: keep the existing track, charge nothing", () => {
    const t: FundingTrack = { instId: "BTC-USDT-SWAP", at: T0, chargedAt: null };
    expect(nextFunding(t, "BTC-USDT-SWAP", null, T0 - 1)).toEqual({ charge: null, track: t });
    expect(nextFunding(undefined, "BTC-USDT-SWAP", null, T0)).toEqual({ charge: null, track: undefined });
  });
});
