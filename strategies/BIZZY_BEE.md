# Bizzy Bee: selective hourly trend breakout

> **Unvalidated strategy hypothesis.** This is not a profitability claim or a statement about any deployment's status.
> Bizzy trades liquid OKX perps long or short from completed hourly candles. Every Bizzy-style bee shares these rules
> and settings; changing a style affects every bee assigned to it.

## Universe and setup

- Start from the top 30 dynamically gated crypto perps that pass the existing liquidity and spread gates. No fixed
  BTC/ETH/SOL/HYPE allowlist. For each completed hour, unavailable coins without a ready current-hour bar are excluded
  from that hour's comparison rather than stalling the remaining pool.
- Apply the long/short 7-day return percentiles to the ready subset of that pool: top 20% for longs and bottom 20% for
  shorts. Require the close above the **prior 72 hourly closes** for a long, or below all of them for a short, plus
  EMA(24) > EMA(72) for longs / EMA(24) < EMA(72) for shorts.
- Rank valid entry candidates by descending `abs(7d return) / hourly realized volatility`; use 24-hour volume as the
  tie-breaker.
- When valid entries exist, Jev chooses among them or `WAIT`; Bizzy does not force an entry just because it is flat.
- Reject an entry if the current price has chased more than 0.5 hourly ATR from the signal close. Bars are sourced
  from the existing market requests (100 15-minute and 200 hourly); the strategy adds no requests.

## Sizing and management

- Initial stop: 2 × hourly ATR from the actual fill. Plan all-in risk at 2% of current equity, sizing notional as
  `min($700, 2 × equity, risk budget / (stop fraction + fees + spread + slippage + payable funding))`.
  The existing 0.97 margin-headroom factor makes the operational notional ceiling 1.94 × current equity. A gap or
  slippage can still make realized loss exceed the budget; it is not a guarantee.
- Reserve fees, spread and slippage (documented allowance `BIZZY_SLIPPAGE_BPS=5`) plus payable funding over the
  documented 24-hour cost horizon (`BIZZY_FUNDING_HORIZON_HOURS=24`); this horizon is a cost reserve, not a maximum
  holding period.
- Begin trailing after price advances one initial stop distance in Bizzy's favor; trail at 3 × hourly ATR and ratchet
  only in the position's favor.
- Close when two consecutive completed hourly closes are below EMA(24) for a long or above EMA(24) for a short.
  This deterministic exit remains active if Jev is unavailable or the bee is benched.
- No fixed take-profit, averaging down, adds, or rank rotation. No forced flat entry, UTC-midnight exit, or holding-time
  limit. A position can continue across UTC midnight.

## Safety and operational transition

Global safety remains unchanged: maximum leverage 2x, the existing 8% daily loss stop, and retirement below 40% of
starting equity. Bizzy-specific trade and fee caps are controlled by its own environment settings.

This is a code/strategy change, not a deployment instruction. On an existing deployment, changing the engine does not
reset its ledger. Any existing Bizzy position remains in place and is managed by the new available stop ratcheting and
exit rules; do not assume it is closed or reset during the transition.

## Honest expectation

Hourly breakouts with trend and cross-sectional filters are a hypothesis, not a validated edge. They can suffer
whipsaws, gaps, fees, spread, slippage and funding; actual losses can exceed planned risk. Paper-trade and evaluate
before drawing conclusions.

## Jev menu

Jev receives a choice request only when one or more valid breakout entries exist. When there is no valid entry, the
menu is empty and the engine skips Jev; it does not ask Jev to choose `WAIT`. While a position is open, only valid
position-management options are offered. Risk limits and deterministic exits remain code-enforced.

## Operational cadence

Evaluate only new completed hourly candles. Existing market refreshes provide the bars; Bizzy adds no market-data
requests.
