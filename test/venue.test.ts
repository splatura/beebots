import { describe, expect, it } from "vitest";
import { resolveApiBase, VENUES } from "../src/okx/venue.js";

const row = (instId: string, instCategory?: string): Record<string, string> => (instCategory === undefined ? { instId } : { instId, instCategory });

describe("venue profiles", () => {
  it("eea matches X-Perps only", () => {
    expect(VENUES.eea.matches("BTC-USD_UM_XPERP-310404")).toBe(true);
    expect(VENUES.eea.matches("BTC-USDT-SWAP")).toBe(false);
    expect(VENUES.eea.matches("BTC-USD-261225")).toBe(false);
  });

  it("global matches linear USDT swaps only (not USDC, not coin-margined, not X-Perps)", () => {
    expect(VENUES.global.matches("BTC-USDT-SWAP")).toBe(true);
    expect(VENUES.global.matches("BTC-USDC-SWAP")).toBe(false);
    expect(VENUES.global.matches("BTC-USD-SWAP")).toBe(false);
    expect(VENUES.global.matches("BTC-USD_UM_XPERP-310404")).toBe(false);
  });

  it("global kind comes from OKX's instCategory; missing or new codes are unknown", () => {
    expect(VENUES.global.kindOf(row("BTC-USDT-SWAP", "1"))).toBe("crypto");
    expect(VENUES.global.kindOf(row("AAPL-USDT-SWAP", "3"))).toBe("stock");
    expect(VENUES.global.kindOf(row("XAU-USDT-SWAP", "4"))).toBe("commodity");
    expect(VENUES.global.kindOf(row("ODD-USDT-SWAP", "9"))).toBe("unknown");
    expect(VENUES.global.kindOf(row("ODD-USDT-SWAP"))).toBe("unknown");
  });

  it("eea kind comes from the hand-kept coin list", () => {
    expect(VENUES.eea.kindOf(row("BTC-USD_UM_XPERP-310404"))).toBe("crypto");
    expect(VENUES.eea.kindOf(row("AAPL-USD_UM_XPERP-310404"))).toBe("stock");
  });

  it("TEST coins are test on both venues", () => {
    expect(VENUES.eea.kindOf(row("TEST002-USD_UM_XPERP-310404"))).toBe("test");
    expect(VENUES.global.kindOf(row("TEST1-USDT-SWAP", "1"))).toBe("test");
  });

  it("carries the venue settings", () => {
    expect(VENUES.eea).toMatchObject({ site: "eea", apiBase: "https://eea.okx.com", instType: "FUTURES", universeMax: Infinity, funding: "fixed-slots", hive: true, label: "OKX X-Perps" });
    expect(VENUES.global).toMatchObject({ site: "global", apiBase: "https://www.okx.com", instType: "SWAP", universeMax: 30, funding: "per-instrument", hive: false, label: "OKX USDT perps" });
  });
});

describe("resolveApiBase", () => {
  it("defaults to the venue's base and strips trailing slashes", () => {
    expect(resolveApiBase(VENUES.eea, undefined)).toBe("https://eea.okx.com");
    expect(resolveApiBase(VENUES.eea, "  ")).toBe("https://eea.okx.com");
    expect(resolveApiBase(VENUES.eea, "https://eea.okx.com/")).toBe("https://eea.okx.com");
    expect(resolveApiBase(VENUES.global, "https://www.okx.com")).toBe("https://www.okx.com");
  });

  it("refuses a base on another host than the venue", () => {
    expect(() => resolveApiBase(VENUES.global, "https://eea.okx.com")).toThrow(/www\.okx\.com/);
    expect(() => resolveApiBase(VENUES.eea, "https://www.okx.com")).toThrow(/eea\.okx\.com/);
    expect(() => resolveApiBase(VENUES.eea, "not a url")).toThrow();
  });
});
