// Paper funding on venues where each coin settles on its own clock (OKX global USDT swaps: 8h, 4h or 1h).
// Pure: the engine keeps one track per bee and charges what this returns.

export interface FundingTrack {
  instId: string;
  /** The settlement time last seen for this instrument (ms). */
  at: number;
  /** The settlement already charged, so a stale feed cannot charge it twice. */
  chargedAt: number | null;
}

/**
 * One tick for one held position. `fundingAt` is the coin's current settlement time from the feed. Right after a
 * settlement the feed may already show the next one, so the settlement to charge is the one seen earlier (`track.at`).
 */
export function nextFunding(track: FundingTrack | undefined, instId: string, fundingAt: number | null, now: number): { charge: number | null; track: FundingTrack | undefined } {
  const fa = fundingAt !== null && Number.isFinite(fundingAt) ? fundingAt : null;
  if (!track || track.instId !== instId) return { charge: null, track: fa !== null ? { instId, at: fa, chargedAt: null } : undefined };
  const charge = now >= track.at && track.chargedAt !== track.at ? track.at : null;
  const chargedAt = charge ?? track.chargedAt;
  const at = fa !== null && fa > track.at ? fa : track.at;
  return { charge, track: { instId, at, chargedAt } };
}
