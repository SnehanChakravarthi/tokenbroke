# Codex opinion on RFC 006: plan-aware misery

Research date: 2026-08-26.

## Executive verdict

**Reject the proposal as written.** The product concern is real—one cross-plan leaderboard invites
readers to compare absolute entitlement even though the current score compares only relative
depletion—but the proposed formula has four material defects:

1. The reported launch incident does not reconcile with the decided RFC 003 formula. At 69% and 98%
   **remaining**, the users are 31% and 2% used, respectively; both are below the 50%-used floor and
   must have misery `0`. A nonzero ordering requires a different binding window, different meaning of
   those percentages, or a production mismatch. This should be established before changing policy.
2. The RFC's formula is not a valid restatement of RFC 003. `depletion` is already the normalized
   value in `[0, 1]`; `max(FLOOR, depletion)` is therefore dimensionally wrong. The plan adjustment
   must start from RFC 003's canonical `d = clamp((usedPercent - 50) / 50, 0, 1)`.
3. `BETA = 0.5` **inside** the cube is vastly stronger than the prose suggests: it divides misery by
   `weight^1.5`. A 20x plan is discounted about 89.4x, not 4.5x.
4. The capacity evidence is window-specific and incomplete. Both vendors publish 5x/20x session
   ratios, but neither establishes that every weekly or model-specific window has the same ratio.

If the owner still wants plan awareness in the score, use a bounded adjustment that disappears at
total exhaustion, apply only exact allowlisted ratios, and keep unknown/unverified plans explicitly
unadjusted. Do not ship a Codex weight of 10.

**Confidence:** high on the mathematical and evidence corrections; medium on the preferred product
curve because that is a brand-policy choice, not an empirically identifiable constant.

## 1. What is actually known about capacity

### Claude

Anthropic's current [pricing page](https://claude.com/pricing) and
[Max plan documentation](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)
state that Max 5x provides five times and Max 20x provides twenty times Pro usage **per five-hour
session**. The same documentation says Max plans also have a weekly all-model limit and may have
other weekly, monthly, model, or feature caps. It does not say those other caps are exactly 5x/20x.
Claude and Claude Code also share the subscription pool.

Therefore:

| Plan | Defensible ratio | Defensible scope |
| --- | ---: | --- |
| Pro | 1 | five-hour session baseline |
| Max 5x | 5 | five-hour session |
| Max 20x | 20 | five-hour session |
| Any weekly/model-specific window | unknown | no published exact ratio found |

The names are not fictional marketing labels, but treating them as universal quota multipliers is
still an extrapolation.

### Codex

Current official OpenAI documentation is more specific than RFC 006 assumes. The
[Codex pricing and limits page](https://learn.chatgpt.com/docs/pricing) says Pro users choose 5x or
20x higher rate limits than Plus and gives local-message estimates whose Pro 5x and Pro 20x columns
are exactly 5 and 20 times the Plus column. It separately says local and cloud work share a
five-hour window and that additional weekly limits may apply. It does not publish a 10x tier.

Current upstream Codex source distinguishes `plus`, `prolite`, and `pro` in
[`PlanType`/`KnownPlan`](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/auth.rs), but
that source assigns display names, not capacity guarantees. Public issue evidence associates
[`prolite` with the $100/5x tier](https://github.com/openai/codex/issues/29243) and
[`pro` with the $200/20x tier](https://github.com/openai/codex/issues/38157), but that mapping is
observed rather than a normative rate-limit contract. The local reader can preserve those raw values;
it should not collapse both into a made-up 10x midpoint.

Therefore the strongest currently supportable registry is:

| Raw plan | Candidate ratio | Evidence quality |
| --- | ---: | --- |
| `plus` | 1 | official baseline |
| `prolite` | 5 | official tier exists; raw-to-tier mapping is strongly observed, not specified in pricing docs |
| `pro` | 20 | official tier exists; raw-to-tier mapping is strongly observed, not specified in pricing docs |
| Free, Go, Business, Team, Enterprise, Edu, unknown | unknown | no fixed cross-plan ratio established |

This is also temporally fragile. Models consume allowance at different rates, task size and context
matter, credits can extend usage, and vendors may vary weekly/model-specific caps. `weight` is at
best a published entitlement class for a particular window, not a measured token tank.

**Verdict:** Replace “Codex Pro = 10” with distinct 5x/20x candidates and explicitly record the
scope/provenance of every ratio. Do not claim an exact weekly ratio.

**Confidence:** high on the official 5x/20x session claims and absence of a 10x product tier; medium
on mapping Codex raw `prolite`/`pro` to those tiers; low on any weekly-capacity multiplier.

## 2. Does a weight discount solve the stated problem?

Not completely, and possibly not at all for the incident as described.

Let RFC 003's normalized depletion be:

```text
d = clamp((usedPercent - 50) / 50, 0, 1)
baseMisery = hoursUntilReset * d^3
```

If a Plus user is genuinely near **100% remaining**, `d = 0` and their score is zero. Dividing the
Pro user's positive score by any finite plan weight cannot make the zero-depletion Plus user outrank
them. The discount changes how much the Pro user wins by; it does not turn unused Plus capacity into
misery. Making the Plus user rank higher would require an absolute-scarcity score that gives misery
to people who have barely used their plan—the failure mode RFC 006 itself rejects.

The launch observation should first be reconstructed from `bindingSeriesId`, binding-window
`usedPercent`, `resetsAt`, raw plan, and query-time score. If both displayed percentages were truly
remaining percentages for the binding windows, the observed rank came from a tie-break or a bug,
not from the misery formula.

More generally, a plan discount is defensible only as a **small privilege adjustment**: at partial
depletion, a larger entitlement leaves more practical runway. It is not full absolute normalization,
and the RFC should stop calling `BETA = 1` “full absolute” without defining an absolute token unit.
Percent-used telemetry alone cannot identify that unit.

**Verdict:** The direction is reasonable as a bounded product-policy modifier, not as a capacity
normalization and not as a demonstrated fix for the reported incident.

**Confidence:** high.

## 3. `BETA = 0.5` and inside versus outside the cube

The placement is not cosmetic.

### Proposed placement: inside

```text
M = h * (d / weight^BETA)^3
  = h * d^3 / weight^(3 * BETA)
```

With `BETA = 0.5`:

| Weight | Misery divisor | Relative depletion needed to offset the plan |
| ---: | ---: | ---: |
| 5 | 11.18x | 2.24x |
| 20 | 89.44x | 4.47x |

The second column is the actual score effect. The RFC prose cites only the third. Because `d` cannot
exceed 1, a 20x user cannot offset that discount once a baseline user's `d` exceeds `1/sqrt(20) =
0.224`—only about 61.2% used after translating back through the floor. At equal reset time, a fully
exhausted Max 20x user would tie a Pro user merely 61.2% used. That is incompatible with “most
rate-limited.”

### Outside the cube

```text
M = h * d^3 / weight^BETA
```

This makes `BETA` the actual score elasticity. With `BETA = 0.5`, the divisors are `sqrt(5) = 2.24`
and `sqrt(20) = 4.47`; equal-score depletion changes by only `weight^(BETA/3)`. This is coherent,
but still aggressive: at equal reset time, a fully exhausted 20x user ties a baseline user around
80.4% used and loses to anyone more depleted than that.

If the simple power discount is retained, put it **outside** the cube and start no higher than
`BETA = 0.2`. At 20x that is still a 1.82x discount, while a fully exhausted 20x user narrowly
outranks a baseline user at 90% used. This `0.2` is a product guardrail, not a discovered truth; it
should be labeled and recalibrated.

**Verdict:** Reject inside-the-cube weighting. Reject `BETA = 0.5` for the simple outside discount as
the launch default; use `0.2` at most if the owner insists on that form.

**Confidence:** high on the algebra and behavioral bounds; medium on `0.2` as the least-bad launch
constant.

## 4. Preferred alternative: preserve the exhaustion endpoint

The brand story is strongest when total lockout means total lockout regardless of what someone paid.
Capacity should matter while there is remaining runway, then stop mattering at 100% depletion.

One small monotone adjustment does that:

```text
d              = clamp((usedPercent - 50) / 50, 0, 1)
capacityFactor = d + (1 - d) / weight^BETA
misery         = hoursUntilReset * d^3 * capacityFactor
```

Use `BETA = 0.5` here as a comprehensible starting policy:

- `weight = 1` exactly recovers RFC 003;
- at the floor (`d = 0`) the row remains exactly zero;
- at full exhaustion (`d = 1`) the factor is exactly one for every plan;
- between those endpoints, larger plans receive a bounded discount that fades as the user approaches
  lockout;
- a fully exhausted Max user never becomes less miserable solely because they bought more capacity.

This is not physics. It is a brand curve: “more headroom earns less sympathy until the headroom is
gone.” That is more faithful to the product than an unbounded capacity divisor.

Plan weight should be selected by `(tool, exact plan raw value, binding window class)`, not plan label
alone. For a weekly window whose ratio is unverified, use `weight = 1` and mark the score
`capacityAdjusted: false` internally. A future ratio registry should include source, scope, and
effective date, because vendor entitlements change.

The simplest alternative remains RFC 003 unchanged plus prominent plan badges and plan filters. That
is the only option with no invented constants and the cleanest interpretation of subjective misery.

**Verdict:** Prefer the endpoint-preserving curve if plan awareness is a hard product requirement;
otherwise keep plan display-only until the launch incident is correctly reconstructed.

**Confidence:** medium-high on the shape; medium on `BETA = 0.5` pending real-board sensitivity
analysis.

## 5. Spoofing, unknown plans, and plan changes

### Spoofing incentives

The signed payload proves continuity of a device key; it does not make locally sourced plan metadata
unforgeable. Once a higher-capacity plan lowers rank, the rational vanity cheat is to report `plus`,
remove the plan field, or alter a local snapshot. The proposed `unknown = 1` is therefore not neutral:
it gives an unknown 20x user the same favorable score as a known baseline user.

Mitigations, in order of simplicity:

1. Derive weight server-side from exact allowlisted raw values. Never accept a numeric weight from the
   CLI and never parse arbitrary strings containing `5x` or `20x`.
2. Show `unknown`/`unverified` plainly. Exclude those rows from plan-cohort aggregate claims; do not say
   they are capacity-normalized.
3. Treat a same-device transition from a higher tier to lower/unknown as suspicious until the current
   binding window resets. Legitimate downgrades and vendor entitlement bugs exist, so this should flag
   rather than reject.
4. If cross-plan rank integrity becomes important, use a separate unverified lane. Assigning unknown
   the maximum weight would reduce cheating but unfairly punish honest new plans; assigning 1 rewards
   missing metadata. There is no neutral scalar default.

Items 3–4 undermine the RFC's “pure read-time compute, no stored state needed” claim. A meaningful
anti-gaming response needs plan history or at least the previous accepted tier. That is acceptable
under tokenbroke's “individuals can be slightly fake; aggregate must not be” principle only if
plan-adjusted rank is explicitly entertainment and unknown rows do not contaminate capacity claims.

### Unknown and non-individual plans

Free, Go, Team, Business, Enterprise, Edu, usage-based accounts, promotions, and purchased credits do
not fit one Plus-relative fixed-weight ladder. Unknown must mean **no adjustment available**, not
“capacity equals Plus.” The UI may still rank such a row by relative misery; methodology must say the
row was not capacity-adjusted.

### Mid-window plan changes

An upgrade or downgrade can change the reported plan while the existing weekly window and reset time
persist. Applying today's plan weight to a window accrued under yesterday's entitlement rewrites its
meaning. The safest launch rule is to avoid weighting weekly windows until window-specific semantics
are known; later, pin a plan observation to the start/reset identity of the scored window.

**Verdict:** The proposal understates gaming and transition risk. Unknown weight 1 is a fallback, not
a neutral capacity estimate, and should never be described otherwise.

**Confidence:** high.

## 6. Does plan adjustment break the subjective-misery story?

The simple divisor does. It says an exhausted Max user is less miserable because they enjoyed more
tokens before becoming equally unable to work. That changes the board from “how rate-limited are you
now?” to “how much sympathy do you deserve after accounting for purchasing power?” The latter can be
funny, but it is a different and more contestable product.

The endpoint-preserving curve keeps the original story intact at its most important state: zero
remaining with hours or days to wait. It only discounts partial depletion, where “but you still have
more absolute runway” is intuitive. Copy should call this a **plan privilege adjustment**, not
absolute capacity or real tokens. Plan-tier cohort views should remain first-class because they state
the underlying observation without laundering it through a constant.

**Verdict:** Capacity can be a small secondary modifier without breaking the brand; it must not make
total lockout cheap. The proposed power divisor crosses that line, especially inside the cube.

**Confidence:** medium-high.

## 7. Display scale

Reject `raw * 100` as the canonical “misery index.” It solves rounding but creates a 0–16,800-ish
number with no anchor, advertises two decimal places of false precision, and changes meaning whenever
the scoring policy changes.

For launch, keep the raw monotone score and use adaptive formatting:

```text
score == 0       -> 0
0 < score < 0.1 -> <0.1
0.1 to <10      -> one decimal
>= 10           -> nearest integer
```

This preserves the score's useful unit-like interpretation—hours multiplied by a depletion
severity—while guaranteeing that only a true floor-zero row displays `0`. The interim one-decimal
fix is nearly sufficient; it only needs the `<0.1` case.

If an integer 0–100 screenshot scale is a hard requirement, use a declared monotone compression
rather than `x100`:

```text
index = misery == 0
  ? 0
  : max(1, round(100 * log1p(misery) / log1p(168)))
```

`168` is the maximum hours in the ranked weekly window. On the current raw scale this maps misery
`0.01, 0.1, 1, 5, 96, 168` to approximately `1, 2, 14, 35, 89, 100`. Sort by the unrounded raw score,
not the displayed bucket, and disclose the transform. This is more legible but less transparent than
adaptive raw values, so it is my second choice.

**Verdict:** Choose adaptive raw display for launch. Use the log 0–100 scale only if the design
requires integers. Reject `x100`.

**Confidence:** high on rejecting `x100`; medium-high on the preferred display because this is partly
an art-direction decision.

## Recommended Decision section

1. Reconstruct the live incident before attributing it to plan blindness; the quoted remaining
   percentages should both score zero under RFC 003.
2. Do not use Codex weight 10. Record official session ratios as Claude 1/5/20 and Codex 1/5/20, with
   Codex raw-tier mapping explicitly marked as observed where not normatively documented.
3. Do not apply advertised session ratios to weekly/model-specific windows as though verified.
4. If shipping plan-aware scoring now, use the endpoint-preserving factor with `BETA = 0.5`; otherwise
   keep RFC 003 and make plan a display/filter facet.
5. If retaining the RFC's simple divisor, place it outside the cube and cap launch `BETA` at 0.2.
6. Server-derive weights from an exact registry. Unknown plans get no adjustment and an explicit
   unverified state; they do not enter plan-normalized aggregate claims.
7. Keep raw scoring for ordering and use adaptive display precision. Do not publish `raw * 100` as a
   meaningful index.
