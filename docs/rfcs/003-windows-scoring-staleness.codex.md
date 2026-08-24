# Codex opinion on RFC 003: windows, scoring, and staleness

Research date: 2026-08-23. Codex source citations are pinned to commit
[`c9b19deb09c1841ce7acc33ddb96276030936a29`](https://github.com/openai/codex/tree/c9b19deb09c1841ce7acc33ddb96276030936a29).

## Q1 — Misery formula

**Verdict:** Reject `usedPercent × hoursUntilReset`. It makes window length dominate depletion and
produces visibly absurd rankings. Use a convex depletion gate, then multiply by confirmed hours left.

**Evidence:** Under [RFC 003 §3](./003-windows-scoring-staleness.md#3-misery-score), scores have units
of percent-hours:

| State | Proposed RFC score |
| --- | ---: |
| Weekly 10% used, 6 days left | `10 × 144 = 1,440` |
| Weekly 60% used, 6 days left | `60 × 144 = 8,640` |
| Five-hour 100% used, 4 hours left | `100 × 4 = 400` |
| Weekly 100% used, 4 days left | `100 × 96 = 9,600` |
| Five-hour 100% used, 20 minutes left | `100 × 0.333 = 33.3` |

Thus someone with 90% remaining for the week outranks someone completely blocked for four hours.
That contradicts “most rate-limited” and makes ordinary weekly consumption dominate the board.

Use:

```text
depletion = clamp((usedPercent - 50) / 50, 0, 1)
miseryHours = hoursUntilReset × depletion³
```

The same states become:

| State | Convex score |
| --- | ---: |
| Weekly 10% used, 6 days left | `0` |
| Weekly 60% used, 6 days left | `144 × 0.2³ = 1.152` |
| Five-hour 100% used, 4 hours left | `4` |
| Weekly 100% used, 4 days left | `96` |
| Five-hour 100% used, 20 minutes left | `0.333` |
| Weekly 90% used, 6 days left | `144 × 0.8³ = 73.728` |

This preserves the intended extreme—fully exhausted for days is worst—without treating mild weekly
use as misery. The 50% threshold and exponent are policy knobs, but they are explicit and testable.
Do not let an estimated `resetsAt` bind the public rank: a midpoint assumption gives a 10%-used weekly
window `840` RFC points despite no evidence about time remaining. Keep such a window visible but
unranked until reset time is known.

**Confidence:** high that the RFC formula is degenerate; medium on the exact alternative parameters,
which should be calibrated against real launch distributions.

## Q2 — Codex window classification across plans

**Verdict:** Exact `300`/`10080` matching is not robust enough for a trust-critical registry. Never
infer meaning from `primary`/`secondary`; structurally classify duration with narrow tolerances and
leave unmatched series secondary.

**Evidence:** The pinned Codex protocol makes `limit_id`, `window_minutes`, `resets_at`, `primary`, and
`secondary` optional. It does not define plan-specific window counts or durations; `used_percent` is
the only required window field. See [`RateLimitSnapshot` and `RateLimitWindow`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/protocol/src/protocol.rs#L2174-L2221).
RFC 001 correctly preserves those unknowns.

Recent reports show why ordinal and exact-duration assumptions fail:

- A Plus report includes 300-minute primary and 10080-minute secondary windows
  ([issue #24896](https://github.com/openai/codex/issues/24896)).
- A current Pro 20x report shows a 10080-minute **primary** and `secondary: null`
  ([issue #39167](https://github.com/openai/codex/issues/39167)); user report, not an API guarantee).
- A Team report shows telemetry becoming `null`, while its earlier sample used approximately
  299/10079-minute windows ([issue #14728](https://github.com/openai/codex/issues/14728)).

These issues are observations, not normative documentation. Current exact behavior for Team and
Enterprise is **unverified**; I found no primary contract mapping those plans to fixed windows. Pro
can presently be weekly-only in reports, and weekly may occupy either raw slot.

Match normalized fields, not a regex over the colon-concatenated `seriesId`: tool = Codex and
`windowMinutes` within an explicit tolerance around 300 or 10080. Store the raw value. Version the
classification. A null duration or novel `limitId` remains visible/secondary until evidence supports a
new rule.

**Confidence:** high that exact/ordinal matching is unsafe; medium on current plan observations because
they come from issue payloads rather than a published plan schema.

## Q3 — Claude five-hour expiry

**Verdict:** Keep hard expiry at `resetsAt`. Official semantics describe a reset, not a decaying
window. The exact post-boundary transition of `used_percentage` to zero is unverified, but an old
snapshot must stop ranking once the window it describes ends.

**Evidence:** Claude's statusline contract defines `rate_limits.five_hour.used_percentage` as percent
consumed and `resets_at` as the Unix time when that limit window resets
([available statusline data](https://code.claude.com/docs/en/statusline#available-data)). Anthropic's
plan documentation says the session limit resets every five hours
([Pro plan limits](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan)). I found no
official source describing decay of the five-hour percentage.

What is **unverified** is whether every client snapshot visibly changes to exactly 0 at the boundary
without another API response, or whether a newly observed window can begin nonzero immediately. That
does not rescue the old observation: after `resetsAt`, it refers to a completed window and is invalid
for current rank. Display it as expired until a fresh snapshot arrives.

**Confidence:** high on documented reset semantics; medium on the exact client-field transition.

## Q4 — Dormancy policy

**Verdict:** Use 24 hours fresh, 24 hours–7 days visible-but-unranked, and hidden after 7 days. Remove
the 0.5 aggregate weight.

**Evidence:** [RFC 003 §4](./003-windows-scoring-staleness.md#4-staleness-dormancy-and-retention)
contradicts itself: “rankable iff not dormant” and exclusion after 24 hours do
not coexist with “dormant entries are still rankable” at weight 0.5. A half-weighted row also leaves
median and denominator semantics underspecified and lets known-stale measurements alter a supposedly
live aggregate.

Use one state machine:

- **Fresh:** source observation age ≤24 hours and ranked window not expired; rank and aggregate.
- **Stale:** >24 hours through 7 days; show “as of,” exclude from rank and aggregates.
- **Hidden:** >7 days; omit from default views.

Anchor age to the source measurement, not receipt time: Codex `observedAt`; Claude
`sourceFetchedAt`. A later hook submission must not freshen an old lab snapshot. The 24-hour number is
a reasonable launch constant because exact reset expiry already removes short windows sooner and
hooks should refresh active users. Seven days preserves claimed-row continuity without polluting live
statistics.

**Confidence:** high on the state semantics; medium on constants pending observed participation data.

## Q5 — Automatic reset detection

**Verdict:** Keep detection candidate-only with manual confirmation. The proposed cohort rule is too
easy to trigger falsely and too ambiguous to close a public reset cycle automatically.

**Evidence:** The candidate rule in
[RFC 003 §6.3](./003-windows-scoring-staleness.md#63-reset-detection--phase-2) can fire under all of
these false-positive scenarios:

- a client release changing field names, window assignment, or rounding;
- one plan cohort receiving a limit change while others do not;
- stale/heavy users expiring out while fresh/light users enter the sample;
- the normal five-hour reset cadence being mistaken for a lab-wide discretionary reset;
- hooks or an outage creating a burst of correlated fresh submissions;
- a timezone/cohort mix shifting the median;
- `resetsAt` correction or missing-window recovery without any allowance reset.

Require same canonical series, same plan cohort, minimum distinct established devices, bounded
observation age, and a discontinuity in matched devices observed both before and after. Exclude newly
created devices and client-version transitions. Even then, emit a candidate with evidence; an admin
confirms the launch-phase reset event. Automatic closure needs an independent lab announcement or a
much stronger longitudinal detector.

**Confidence:** high.

## Q6 — Registry, unknowns, tie breaks, and plan tier

**Verdict:** Preserve unknown series and keep plan tier as a facet, but replace regex-on-`seriesId`,
reverse the observation-time tie-break, and do not claim measured “dev-hours idled” from snapshots.

**Evidence:** The [proposed registry and tie-break contracts](./003-windows-scoring-staleness.md#2-server-side-window-registry)
should match structured attributes (`tool`, normalized duration band,
possibly `limitId`/scope) and carry rule version/provenance. `seriesId` is an identity string containing
open-ended source text, not a durable classification language. First-match precedence is acceptable
only with validation that overlapping ranked rules cannot ship.

Unknown series should be stored and displayed as unranked secondary data. That is the correct
forward-compatible default. Promote only via a versioned registry change; never silently reclassify
historical aggregates without recording the rule version.

“Earlier observation means longer suffered” is not supported: a snapshot says when state was seen,
not when exhaustion began, and earlier data are less trustworthy. For equal scores use newer source
observation first, then a stable device-ID hash. If “time suffered” matters later, derive it from
successive server-side observations crossing a defined threshold.

Plan tier belongs in filters and cohort aggregates, never in the score. Treat unknown as a first-class
bucket and retain the tier attached to each observation so later plan changes do not rewrite history.

Finally, summing future reset time for 0%-remaining users measures **blocked hours remaining**, not
hours already idled. Rename it. Actual idled hours require integrating an observed exhausted state over
time; a single snapshot cannot establish that history.

**Confidence:** high.

## Critique

The strongest parts are preservation of every raw window, server-side interpretation, fail-closed
unknowns, hard expiry, and keeping plan tier out of ranking. Those choices respect RFC 001's deliberately
open reader contract.

The central scoring formula does not. It optimizes for long windows rather than acute exhaustion, and
estimated reset times can dominate real measurements. The staleness section contains an internal
contract contradiction. Regexes over `seriesId` blur identity with semantics, and the aggregate named
“dev-hours idled” asserts more than snapshots measure. Each issue is fixable without changing the
reader payload or database direction.

## What I would build instead

1. Store all RFC 001 windows unchanged, plus a versioned structural classification result.
2. Rank only classified windows with observed reset times using the convex depletion formula above;
   show estimated/unknown-reset windows but keep them out of binding rank.
3. Use a three-state freshness policy: fresh/ranked, stale/visible, hidden—no half-weight aggregates.
4. Tie on newer source observation and then stable identity; never infer suffering duration from one
   timestamp.
5. Report `blockedHoursRemaining` from snapshots. Add actual idled-time integration only after enough
   longitudinal data exist.
6. Treat reset detection as an evidence-producing candidate system until manually confirmed.
