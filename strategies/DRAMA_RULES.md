# Drama rules: shared by all three bees

The video fails if a bee sits in cash. Correct trading is dead television. These rules are enforced in **code**, in the risk layer. They are not left to Jev.

## 1. Jev chooses only when a decision exists

- The engine asks Jev when a style has a decision to make. Bizzy gets a request only when valid entry choices exist;
  with none, its menu is empty and Jev is skipped. `HOLD`/`RIDE`/`HOLD_WINNER` are position-management options while
  a position is open.
- Only offer options that are valid right now (a real setup, a real candidate). Jev picks among real moves, never impossible ones.
- The full probability distribution is shown on the dashboard, so "62% ape PENGU, 31% ride BTC" becomes a visible argument.

## 2. Flat-time forcing is style-specific

There is no shared requirement to force an entry while flat. Bizzy waits for a valid hourly breakout, and never opens
merely to avoid sitting in cash. Breezy and Boozy retain their own existing forcing behavior as implemented in code.
Bizzy's 3-trade daily cap / $3 fee budget and the shared daily loss stop or retirement limit can bench trading; these
limits do not create a Bizzy entry.

## 3. Motion without churn

- **Decisions are cheap, orders are expensive.** Each style asks Jev on its own decision cadence. Orders are rare events with a card and a sound.
- **Held positions move every tick** (unrealised P&L on mark price). Three bees holding three different things separate visibly within hours.
- **Funding lands three times a day** (00:00 / 08:00 / 16:00 UTC) as small visible steps in each bee's equity.

## 4. Designed-in story beats

- **Divergence:** breezy trades 2 majors on a slow clock, bizzy selects from a ranked set of up to 30 gated perps on
  hourly closes, boozy picks from ~29 gated coins including the weird ones. They will almost never hold the same thing.
- **Caps as plot:** each style has its own caps; every cap trip becomes a dashboard banner and an alert.
- **The spread gate as a character:** boozy wanting a coin he can't have.
- **Cost counters:** fees, funding and Jev spend to the cent. "Here is exactly what the thinking cost."
- **Reconciliation light:** our numbers vs OKX's, audited live.
- **Daily recap** (auto-generated at 00:00 UTC into the DB): each bee's best trade, worst trade, weirdest coin, longest hold and P&L. This is narration material for the check-in shots.

## 5. Things that are NOT allowed, even for drama

- Raising leverage above 2x.
- Resting limit orders (self-trade prevention would cancel them silently across bees).
- Any key with withdraw or transfer permission.
- Letting a bee trade stocks or commodities before their trading hours are verified (`ALLOW_NON_CRYPTO=false`).
