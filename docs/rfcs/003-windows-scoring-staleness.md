# RFC 003 — Window registry, misery score, staleness, and aggregates

- Status: **Decided 2026-08-23** (see §8; Codex opinion in `003-windows-scoring-staleness.codex.md`)
- Author: Claude Code (Fable 5), 2026-08-23
- Depends on: RFC 001 (`UsageWindow`, `seriesId`), RFC 002 (submission/response contract).
- Scope: how the server turns readings into rank, meters, and counters. Pure functions; the DB
  schema that stores inputs/outputs is a later RFC. Everything here lives in `@tokenbroke/shared`
  so the CLI's `--dry-run` and the site compute identical numbers.

## 1. Principle

**The CLI reports every window; the server decides what each one means.** Labs change their limits
without notice (Claude's model-scoped weekly window appeared and is now disappearing; Codex collapsed to
one weekly window for some plans). The reader never needs a release for that. The registry below does.

## 2. Window registry

```ts
type WindowRole = "ranked" | "secondary" | "ignored";
interface WindowRule {
  match: RegExp;                 // against seriesId, e.g. /^claude:session:300:$/
  role: WindowRole;
  label: string;                 // "5-hour", "Weekly", "Weekly · Fable"
  shortLabel: string;            // for ASCII/OG: "5h", "7d", "7d·Fable"
}
```
Initial rules (ordered, first match wins):

| match | role | label |
|---|---|---|
| `^claude:session:300:$` / `^claude:five_hour:300:$` | ranked | 5-hour |
| `^claude:weekly_all:10080:$` / `^claude:seven_day:10080:$` | ranked | Weekly |
| `^claude:weekly_scoped:10080:(.+)$` | secondary | Weekly · `$1` |
| `^codex:(primary\|secondary):300:$` | ranked | 5-hour |
| `^codex:(primary\|secondary):10080:$` | ranked | Weekly |
| `^codex:` (any other, incl. null window) | secondary | raw |
| anything else | secondary | raw |

**Unknown series are never dropped.** They are stored, shown as secondary, and surfaced in an admin
"unregistered series" view with first-seen date and row count, so a lab change shows up as a dashboard
signal instead of a silent miscount. Promoting one to `ranked` is a config change, not a release.

## 3. Misery score

Per window: `misery_w = usedPercent × hoursUntilReset`, where `hoursUntilReset =
max(0, (resetsAt − now) / 1h)`. Windows with null `resetsAt` get `hoursUntilReset = windowMinutes / 60
× 0.5` (assume mid-window) and are flagged `estimatedReset: true`.

Per tool: `misery_tool = max(misery_w for ranked w)`; `bindingSeriesId` = the argmax. A 5-hour window
at 100% with 20 min left scores 33; a weekly at 100% with 4 days left scores 9,600. That is the
intended asymmetry: misery is *time locked out × how locked out*.

Per dev (combined board): `max(misery_tool)` across tools, with the binding tool shown.

Display: the board shows **remaining %** (`100 − usedPercent` of the binding window) and **time to
reset**, never the raw score. The score orders; the two numbers explain.

Tie-break: lower remaining % first, then longer time to reset, then earlier `observedAt` (the longer
you've suffered, the higher you rank).

## 4. Rankability and staleness

A row is **rankable** iff: `install === "found" && observation === "ok"`, at least one `ranked`
window, and the binding window is **not expired** (`resetsAt > now`) and **not dormant**
(`observedAt > now − 24 h`).

- **Expired** (`now ≥ resetsAt` on the binding window): the limit has reset since the snapshot. The
  row leaves the rank and live aggregates. State copy: *"Sentence served. Run again to confirm you're
  still broke."* Not a penalty; a prompt. Expiry is exact because `resetsAt` is in the data.
- **Dormant** (`observedAt` older than 24 h, not yet expired): still rankable but displayed with
  "as of Nh ago"; weight 0.5 in aggregates. After 24 h it leaves aggregates; after 7 days without a
  new submission the row is hidden from the board (kept in the DB).
- **Secondary-only** rows (e.g. only a scoped window reported): visible with a badge, not ranked.

Hooks (RFC 002) make dormancy rare for opted-in users; the rules above keep the aggregate honest for
everyone else.

## 5. Aggregates (the credible layer)

Computed per tool over rankable, non-dormant rows, with the server-side anomaly filter (RFC 001 §5.1,
hardened in Phase 2) applied first:

- `devs`: distinct devices with a rankable row.
- `medianRemainingPercent` per **series** (5-hour and Weekly separately) and for the binding window.
- `brokeFraction`: share of devs at ≤ 5 % remaining on any ranked window.
- `drainVelocity` (Codex only in v1, Claude once server-side history accumulates): median of
  `Δ usedPercent / Δ hours` over the last 6 h per series.
- `devHoursIdled`: Σ over rows at 0 % remaining of `hoursUntilReset` (capped per row at the window
  length). The Poverty Line meter's headline number.
- **Days since last reset (per tool):** the factory sign. `resetAt` comes from the **manual reset
  radar** (admin-entered, RFC 002 does not cover it; it is a site feature). Automatic detection is
  *proposed* as a Phase 2 signal: a reset is detected when ≥ 30 % of non-dormant rows for a tool show
  `usedPercent` dropping by ≥ 50 points within a 2 h window outside their scheduled `resetsAt`.
  Until then, counters are manual only.

Klaxon threshold (site flips to RESET CONDITIONS MET), initial: `brokeFraction ≥ 0.35` **and**
`devs ≥ 200` for a tool. Both numbers are config, shown on the page so nobody thinks it is vibes.

## 6. Plan tier in ranking

Plan tier is **never** an input to misery. It is a facet: the board can filter by tier, and aggregates
are also cut per tier (`medianRemainingPercent` by plan), because "Max 20x users are broker than Pro
users" is a finding. Unknown tiers are a bucket, not excluded.

## 7. Open questions for Codex

- **Q1 (formula):** attack `usedPercent × hoursUntilReset`. Does it produce degenerate orderings
  (e.g. a weekly at 60 % with 6 days left outranks a 5-hour at 100 % with 4 h left — is that wanted)?
  Propose an alternative if you have one, with worked examples at the extremes.
- **Q2 (Codex windows):** with `secondary` null on Plus and `window_minutes` optional, is keying
  `ranked` rules on `300`/`10080` robust across plans? What do Pro/Team/Enterprise report today (cite
  source or issues)?
- **Q3 (expiry vs. Claude semantics):** Claude's `resets_at` for the 5-hour window is the end of the
  current rolling session; does `usedPercent` actually return to 0 at that instant, or decay? If it
  decays, "expired" is wrong for that series.
- **Q4 (dormancy numbers):** 24 h / weight 0.5 / 7 d hide. Argue for different constants.
- **Q5 (reset detection):** critique the Phase 2 auto-detection rule; false-positive scenarios.
- **Q6 (critique):** registry shape, unknown-series policy, tie-break order, plan-tier-as-facet.

## 8. Decision

Reconciled by Claude Code. Codex's review is accepted on every substantive point; §2–§5 are
superseded as follows.

### 8.1 Misery (replaces §3)
```
depletion   = clamp((usedPercent − DEPLETION_FLOOR) / (100 − DEPLETION_FLOOR), 0, 1)   // FLOOR = 50
misery_w    = hoursUntilReset × depletion ^ DEPLETION_EXPONENT                          // EXPONENT = 3
misery_tool = max over ranked windows with an *observed* resetsAt; bindingSeriesId = argmax
misery_dev  = max over tools
```
Worked: weekly 100 % / 4 d left → 96; weekly 90 % / 6 d → 73.7; 5-hour 100 % / 4 h → 4; weekly 60 % /
6 d → 1.15; anything ≤ 50 % used → 0 ("not broke, go away"). Both constants are config, displayed on
the site's methodology note, and may be recalibrated at launch without a schema change. Windows with
null `resetsAt` are **visible but never binding**; no midpoint estimate.

### 8.2 Registry (replaces §2)
Classification is **structural**, versioned, and matched on normalized fields, not on `seriesId`:
```ts
interface WindowRule { tool: ToolId | "*"; durationBand: "5h" | "7d" | null; scoped: boolean | null;
                       limitId?: string; role: WindowRole; label: string; shortLabel: string }
```
`durationBand` = `"5h"` if `|windowMinutes − 300| ≤ 15`, `"7d"` if `|windowMinutes − 10080| ≤ 60`,
else `null`. Initial rules: (claude, 5h, unscoped) ranked "5-hour"; (claude, 7d, unscoped) ranked
"Weekly"; (claude, 7d, scoped) secondary "Weekly · <scope>"; (codex, 5h) ranked; (codex, 7d) ranked;
everything else secondary with the raw kind as label. Rules carry a `registryVersion`; every stored
classification records which version produced it; a validator rejects overlapping `ranked` rules.
Unknown series: stored, displayed secondary, listed in the admin "unregistered series" view.

### 8.3 Freshness (replaces §4)
Three states, anchored on **source** time (`observedAt`, which for Claude equals `sourceFetchedAt`):
- **fresh:** age ≤ 24 h and binding window not expired → ranked, in aggregates.
- **stale:** 24 h < age ≤ 7 d, or expired → visible with "as of" / "sentence served", excluded from
  rank and aggregates.
- **hidden:** age > 7 d → omitted from default views, kept in the DB.
No fractional weights. A hook submission does not freshen an unchanged lab snapshot.

### 8.4 Aggregates (amends §5)
`devHoursIdled` → **`blockedHoursRemaining`** (Σ `hoursUntilReset` over fresh rows at ≤ 0 % remaining).
True idled time is a Phase 2 longitudinal metric. Automatic reset detection is **candidate-only**:
same series + same plan cohort + ≥ N established devices observed both before and after a
discontinuity, excluding new devices and client-version transitions; an admin confirms. The counter
is manual until then.

### 8.5 Tie-break (replaces §3 tail)
Equal score → newer source observation first → stable hash of `deviceId`. No "longer suffered"
inference from one timestamp.

### 8.6 Unchanged
Plan tier is a facet and cohort cut, never a score input; unknown tier is a bucket.
