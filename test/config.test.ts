import { describe, expect, it } from "vitest";
import { ConfigError, LIVE_ACK_PHRASE, loadConfig } from "../src/config.js";
import { VENUES } from "../src/okx/venue.js";
import type { Settings } from "../src/settings.js";

describe("config", () => {
  it("OKX_SITE defaults to eea, with today's base and no universe cap", () => {
    const c = loadConfig({ TYPESAFE_API_KEY: "k" });
    expect(c.okx.site).toBe("eea");
    expect(c.okx.venue).toBe(VENUES.eea);
    expect(c.okx.apiBase).toBe("https://eea.okx.com");
    expect(c.universe.max).toBe(Infinity);
  });

  it("an explicit EEA base (even with a trailing slash) still works", () => {
    expect(loadConfig({ TYPESAFE_API_KEY: "k", OKX_API_BASE: "https://eea.okx.com/" }).okx.apiBase).toBe("https://eea.okx.com");
  });

  it("OKX_SITE=global trades www.okx.com USDT swaps on paper, capped at 30 coins", () => {
    const c = loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: "global" });
    expect(c.okx.venue).toBe(VENUES.global);
    expect(c.okx.apiBase).toBe("https://www.okx.com");
    expect(c.universe.max).toBe(30);
  });

  it("UNIVERSE_MAX overrides the venue default; it must be a positive whole number", () => {
    expect(loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: "global", UNIVERSE_MAX: "12" }).universe.max).toBe(12);
    expect(loadConfig({ TYPESAFE_API_KEY: "k", UNIVERSE_MAX: "40" }).universe.max).toBe(40);
    expect(() => loadConfig({ TYPESAFE_API_KEY: "k", UNIVERSE_MAX: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ TYPESAFE_API_KEY: "k", UNIVERSE_MAX: "2.5" })).toThrow(ConfigError);
  });

  it("refuses an OKX_API_BASE on another host than OKX_SITE", () => {
    expect(() => loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: "global", OKX_API_BASE: "https://eea.okx.com" })).toThrow(ConfigError);
  });

  it("a blank or padded OKX_SITE is tolerated; blank means eea", () => {
    expect(loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: "" }).okx.site).toBe("eea");
    expect(loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: " global " }).okx.site).toBe("global");
  });

  it("each venue paper-trades in its own database file; EEA keeps today's name", () => {
    expect(loadConfig({ TYPESAFE_API_KEY: "k" }).dbPath).toBe("./data/bees-dry.sqlite");
    expect(loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: "global" }).dbPath).toBe("./data/bees-dry-global.sqlite");
  });

  it("refuses an unknown OKX_SITE", () => {
    expect(() => loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: "au" })).toThrow(ConfigError);
  });

  it("OKX_SITE=global is paper only for now: demo and live refuse to start", () => {
    const keys = Object.fromEntries(["BEE1", "BEE2", "BEE3"].flatMap((b) => ["KEY", "SECRET", "PASSPHRASE"].flatMap((f) => [[`${b}_OKX_DEMO_API_${f}`, "x"], [`${b}_OKX_API_${f}`, "x"]])));
    const msg = "OKX_SITE=global supports MODE=dry for now; demo and live come next.";
    expect(() => loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: "global", DRY_RUN: "false", MODE: "demo", ...keys })).toThrow(msg);
    expect(() => loadConfig({ TYPESAFE_API_KEY: "k", OKX_SITE: "global", DRY_RUN: "false", MODE: "live", LIVE_ACK: "I-ACCEPT-REAL-MONEY-RISK", ...keys })).toThrow(msg);
  });

  it("DRY_RUN defaults to true, which forces dry whatever MODE says", () => {
    expect(loadConfig({ TYPESAFE_API_KEY: "k", MODE: "live" }).mode).toBe("dry");
    expect(loadConfig({ TYPESAFE_API_KEY: "k", MODE: "demo", DRY_RUN: "true" }).mode).toBe("dry");
  });

  it("refuses to start without the Jev key", () => {
    expect(() => loadConfig({})).toThrow(/TYPESAFE_API_KEY/);
    expect(() => loadConfig({ TYPESAFE_API_KEY: "  " })).toThrow(/TYPESAFE_API_KEY/);
  });

  it("demo needs all three demo keys and lists the missing NAMES only", () => {
    const env = { TYPESAFE_API_KEY: "k", DRY_RUN: "false", MODE: "demo", BEE1_OKX_DEMO_API_KEY: "secret-value-1" };
    let msg = "";
    try {
      loadConfig(env);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/BEE1_OKX_DEMO_API_SECRET/);
    expect(msg).toMatch(/BEE3_OKX_DEMO_API_KEY/);
    expect(msg).not.toMatch(/secret-value-1/);
    expect(msg).not.toMatch(/BEE1_OKX_API_KEY\b/); // live keys not required in demo
  });

  it("demo with every key set loads per-bee creds", () => {
    const env: Record<string, string> = { TYPESAFE_API_KEY: "k", DRY_RUN: "false", MODE: "demo" };
    for (const b of ["BEE1", "BEE2", "BEE3"]) for (const f of ["KEY", "SECRET", "PASSPHRASE"]) env[`${b}_OKX_DEMO_API_${f}`] = `${b}-${f}`;
    const cfg = loadConfig(env);
    expect(cfg.mode).toBe("demo");
    expect(cfg.creds.bee3?.apiKey).toBe("BEE3-KEY");
  });

  it("live needs the written risk acknowledgement, and demo/dry do not", () => {
    const env: Record<string, string> = { TYPESAFE_API_KEY: "k", DRY_RUN: "false", MODE: "live" };
    for (const b of ["BEE1", "BEE2", "BEE3"]) for (const f of ["KEY", "SECRET", "PASSPHRASE"]) env[`${b}_OKX_API_${f}`] = `${b}-${f}`;
    expect(() => loadConfig(env)).toThrow(/LIVE_ACK/);
    expect(() => loadConfig({ ...env, LIVE_ACK: "yes" })).toThrow(/LIVE_ACK/);
    expect(loadConfig({ ...env, LIVE_ACK: LIVE_ACK_PHRASE }).mode).toBe("live");
    expect(loadConfig({ TYPESAFE_API_KEY: "k" }).mode).toBe("dry");
  });

  it("with no Setup file the bees are the original three", () => {
    const c = loadConfig({ TYPESAFE_API_KEY: "k" });
    expect(c.slots.bee1).toMatchObject({ style: "bizzy", name: "Bizzy", customImage: false });
    expect(c.slots.bee2).toMatchObject({ style: "breezy", name: "Breezy" });
    expect(c.slots.bee3).toMatchObject({ style: "boozy", name: "Boozy" });
  });

  it("a Setup file supplies the Jev key and the bees; the environment still wins", () => {
    const settings: Settings = {
      version: 1,
      jevKey: "from-setup",
      acceptedRiskAt: 1,
      createdAt: 1,
      bees: [
        { name: "Granny", style: "breezy", tagline: "the calm one", rules: "Buy BTC dips.", coins: ["BTC"], image: true },
        { name: "Zippy", style: "boozy", tagline: "", rules: "", coins: [], image: false },
        { name: "Rex", style: "boozy", tagline: "", rules: "", coins: [], image: false },
      ],
    };
    const c = loadConfig({}, settings);
    expect(c.jev.apiKey).toBe("from-setup");
    expect(c.mode).toBe("dry");
    expect(c.slots.bee1).toMatchObject({ name: "Granny", style: "breezy", customImage: true, rules: "Buy BTC dips.", coins: ["BTC"], fromSetup: true });
    expect(c.slots.bee3.style).toBe("boozy");
    expect(loadConfig({ TYPESAFE_API_KEY: "env" }, settings).jev.apiKey).toBe("env");
  });

});
