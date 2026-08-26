# RFC 006: Plan-aware misery

## Context

First live day surfaced two scoring problems (reporter: the second dev on the board, Codex Pro):

1. **Plan blindness.** Misery ranks by relative depletion (`hoursUntilReset x depletion^3`,
   floor 50). A Pro dev at 69% remaining outranks a Plus dev at 98% — yet in absolute tokens the
   Pro dev has far more runway than the Plus dev has in total. The board called the richest
   account the most miserable.
2. **Scale legibility.** On a solvent board (post-reset), misery values are fractions; the UI
   rounded them to `MISERY 0` while still ordering rows by them. (Interim display fix shipped;
   the final scale should be chosen here.)

## Two philosophies

- **Relative (current):** misery is the lived experience of one's own meter. 31% of *your* week
  gone is 31% gone, whatever you paid. Defensible, simple, needs no plan knowledge. Its failure:
  it equates fractions across wildly different absolute quotas, which reads as unfair the moment
  two plans meet on one board.
- **Absolute:** normalize by plan capacity. Fails the other way: a small-plan dev who used
  nothing would loiter near the top on scarcity alone, and capacity ratios (especially OpenAI
  Plus vs Pro) are not published numbers we can defend.

## Proposed direction: relative, discounted by plan weight

Keep depletion as the driver, discount it by plan capacity raised to a "compassion" exponent:

```
effectiveDepletion = max(FLOOR, depletion) / weight^BETA
misery             = hoursUntilReset * effectiveDepletion^3
```

- `weight` per plan tier, from a registry table:
  - Claude Code: Pro = 1, Max 5x = 5, Max 20x = 20 (the names state the ratios).
  - Codex: Plus = 1, Pro = 10 (unpublished; launch constant, calibrate on drain data).
  - Unknown plan = 1 (neutral; no punishment for missing metadata).
- `BETA` in [0, 1]: 0 recovers today's behavior, 1 is full absolute normalization.
  **Launch proposal: BETA = 0.5** — a Max 20x dev needs roughly 4.5x the relative burn of a Pro
  dev to rank equal, which matches the intuition that bigger plans should be harder to rank
  miserable, without letting empty small plans dominate.
- `FLOOR` unchanged (50) pending real-burn calibration.

Properties: pure server-side compute at leaderboard read time — no schema change, no CLI
change, no migration, instantly recalibratable. Cross-tool aggregates (medians, days-since)
are untouched; misery only orders rows within one board.

## Display scale

Raw misery spans ~0.01 (solvent) to ~170 (weekly fully burned). Options:
(a) show raw with decimals under 1 (current interim), (b) rescale x100 into an integer
"misery index", (c) normalize 0-100 against the theoretical max for the binding window.
Proposal: **(b)**, integers read better on a scoreboard and screenshots.

## Open questions for review

1. Is the weight-discount direction right at all, versus doubling down on purely-relative and
   treating plan as display-only context?
2. BETA = 0.5 and Codex Pro weight = 10: sane launch constants?
3. Should weight apply inside or outside the cube? (Current proposal: inside, so the discount
   compounds; outside would soften it.)
4. Display scale choice.

## Decision

_Pending Codex review._
