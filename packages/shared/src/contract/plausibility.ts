import type { LocalReadings } from "../readings";

/**
 * Semantic time bounds that the pure shape validator (`validateSubmissionV1`) cannot express because
 * it has no `now`. This is anti-abuse, not shape validation: a submission with a `resetsAt` years out
 * would otherwise rank #1 forever on the leaderboard. Enforced identically by the real API and the
 * stub so "everything on the board is real" holds on both. All timestamps here already parsed finite.
 */
export const RESET_HORIZON_SLACK_MS = 60 * 60 * 1_000;
export const OBSERVED_FUTURE_SKEW_MS = 10 * 60 * 1_000;
export const OBSERVED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_WINDOW_MINUTES = 525_600; // one year: the horizon cap when a window omits its own length

export function plausibleReadingTimes(readings: LocalReadings, nowMs: number): boolean {
  for (const reading of readings) {
    if (reading.observedAt !== null) {
      const observedMs = Date.parse(reading.observedAt);
      if (observedMs > nowMs + OBSERVED_FUTURE_SKEW_MS) return false;
      if (observedMs < nowMs - OBSERVED_MAX_AGE_MS) return false;
    }
    if (
      reading.sourceFetchedAt !== null &&
      Date.parse(reading.sourceFetchedAt) > nowMs + OBSERVED_FUTURE_SKEW_MS
    ) {
      return false;
    }
    for (const window of reading.windows) {
      if (window.resetsAt === null) continue;
      const horizonMs = (window.windowMinutes ?? MAX_WINDOW_MINUTES) * 60_000;
      if (Date.parse(window.resetsAt) > nowMs + horizonMs + RESET_HORIZON_SLACK_MS) return false;
    }
  }
  return true;
}
