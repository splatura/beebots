# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project uses [Calendar Versioning](https://calver.org/) (`YYYY.M.D`).

## [Unreleased]

The bees can now paper-trade OKX's **global** site, which is where OKX Australia accounts live, as well as
OKX EEA X-Perps. Pick the venue with `OKX_SITE` in `.env`. EEA remains the default; its existing venue and funding
behavior is unchanged.
On global, only paper trading (`MODE=dry`) is supported for now. Demo and live are planned next.

### Added

- `OKX_SITE` setting (`eea` | `global`, default `eea`) to choose the OKX venue. On `global` the bees trade
  linear USDT-margined perpetual swaps (`BTC-USDT-SWAP` and similar) from `www.okx.com`. USDC swaps and
  coin-margined swaps are left out because their margin and P&L don't fit the USD ledger.
- Venue profiles (`src/okx/venue.ts`). Each venue sets its API host, instrument type (`FUTURES` or `SWAP`), which
  instruments count, how a coin's kind is read, its universe cap, its funding model, whether the Hive is
  available, and its display label.
- On global, the asset kind comes from OKX's own `instCategory` field: crypto, stock or commodity. A missing or
  unknown category is never traded.
- `UNIVERSE_MAX` setting: the most coins the bees may consider, keeping the highest 24h volume after the
  liquidity gates. If unset, EEA has no cap and global uses 30. Coins dropped by the cap aren't reported as
  blocked by spread.
- Paper funding for each coin on its own clock (`src/funding.ts`). On global, every coin settles at its own
  `fundingTime` and each held position is charged once per period. Repeated ticks and restarts can't charge
  twice, and a charge that fails is tried again on the next tick. EEA keeps its fixed 00:00 / 08:00 / 16:00 UTC
  slots.
- Global paper trading uses its own database (`bees-<mode>-global.sqlite`), so switching venue never mixes or
  strands positions from the other venue.
- `/profile` now includes the venue's label and funding model. The dashboard header shows the venue ("OKX USDT
  perps" or "OKX X-Perps") and the funding schedule ("per coin, own clock" or "00 · 08 · 16 UTC").
- The Hive reports why it can't be joined (`status().blocked`), and the dashboard's Hive panel shows that reason.
- Tests: `test/venue.test.ts`, `test/universe.test.ts`, `test/funding.test.ts` and
  `test/funding-engine.test.ts`, plus global-venue cases in the config, REST, Hive and Setup tests.

### Changed

- Bizzy's style is now a selective hourly long/short trend-breakout design, dynamically ranked across gated OKX
  perpetuals. It accepts any eligible owner-selected coin set, unlike Breezy's BTC/ETH restriction. The new rules are
  an unvalidated strategy hypothesis, not a profitability claim or deployment status.
- Bizzy evaluates newly completed hourly closes, uses a 72-hour channel and trend filters, rejects entries chased by
  more than 0.5 hourly ATR, plans 2% all-in equity risk with a 2-ATR fill stop, and trails at 3 ATR after one initial
  stop distance of favorable movement. Two consecutive hourly EMA closes against the position exit deterministically.
  It has no forced flat entry, midnight exit or holding-time limit.
- Bizzy's daily trade/fee caps are 3 / $3. The removed `BIZZY_SIZE_FRACTION`, `BIZZY_UNIVERSE_SIZE` and
  `BIZZY_TIME_STOP_MINUTES` controls are replaced by `BIZZY_SLIPPAGE_BPS` (5) and
  `BIZZY_FUNDING_HORIZON_HOURS` (24, cost reserve only). Existing positions and ledgers are not reset by an engine
  change.

- `OKX_API_BASE` now defaults to the chosen venue's host. Startup refuses to run if it is set to a host that
  doesn't match `OKX_SITE`.
- `OKX_SITE=global` together with `MODE=demo` or `MODE=live` refuses to start: "OKX_SITE=global supports MODE=dry
  for now; demo and live come next."
- The Hive refuses bees running on the global venue ("The Hive runs on OKX EEA paper trading only."): join
  returns 409, and a saved "joined" state isn't reported. This works the same way as the existing refusal in
  `MODE=live`.
- Setup checks and lists coins against the configured venue, and its messages and the OpenAI design prompt now
  say "on OKX" instead of "on OKX EEA".
- The `snapshot`, `universe`, `jev:check` and `parity` tools and the fake-Jev end-to-end harness follow
  `OKX_SITE`.
- `docker-compose.yml` passes `OKX_SITE` and `UNIVERSE_MAX` through to the engine. `.env.example` documents them
  under a new "OKX venue" section, and the README settings table gains an `OKX_SITE` row.
- Internal: `fetchXperpCoins` is renamed `fetchCoins(venue, …)`. `FundingNow.nextFundingTime` is renamed
  `fundingAt`, because it is the current period's settlement time. `CoinStats` gains `fundingAt`.
  `createPublicApi`, `parseInstrument` and the public REST client take the venue, defaulting to EEA.
- `.gitignore` also ignores local working folders: `CLAUDE.md`, `docs/superpowers/`, `.superpowers/` and
  `.remember/`.

[Unreleased]: https://github.com/splatura/beebots/compare/5ddd6d1...HEAD
