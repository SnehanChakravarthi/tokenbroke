# Codex opinion on RFC 001 — CLI local-data readers

Research date: 2026-08-23. Codex claims are pinned to `c9b19deb09c1841ce7acc33ddb96276030936a29`;
ccusage claims to `a8e32cf88db64f2fe6855942036f51a3a867890d`. Local inspection was limited to
versions, counts, and allowlisted key/value shapes; no credential or conversation content was opened.

## Q1 — Codex durability: rollout JSONL or SQLite?

**Verdict: Current non-ephemeral Codex sessions still write `token_count` events to rollout JSONL;
SQLite is currently a rebuildable projection/metadata store, not the canonical event record. This is
true of the shared core/app-server path used by rich clients, but there is no promise that it will
remain true in future releases.**

Evidence:

- `Session::update_rate_limits` stores the snapshot and immediately calls
  `send_token_count_event`; that function reads `(info, rate_limits)`, constructs
  `EventMsg::TokenCount`, and sends it through the normal event path
  ([`core/src/session/mod.rs`, `update_rate_limits` and `send_token_count_event`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/session/mod.rs#L4033-L4073)).
  `EventMsg` is tagged with `rename_all = "snake_case"`, so the serialized variant is
  `"type":"token_count"`
  ([`protocol/src/protocol.rs`, `EventMsg`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/protocol/src/protocol.rs#L1290-L1354)).
- `TokenCountEvent` contains optional `info` and optional `rate_limits`; the latter carries
  `limit_id`, `primary`, `secondary`, credits, and `plan_type`
  ([`protocol/src/protocol.rs`, `TokenCountEvent` and `RateLimitSnapshot`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/protocol/src/protocol.rs#L2168-L2223)).
- The rollout persistence policy explicitly returns `true` for `EventMsg::TokenCount` in both
  legacy and paginated history modes
  ([`rollout/src/policy.rs`, `should_persist_event_msg`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/rollout/src/policy.rs#L86-L105)).
- New rollouts are placed under `$CODEX_HOME/sessions/YYYY/MM/DD`; each `RolloutItem` is serialized as
  one JSON line and flushed
  ([path construction](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/rollout/src/recorder.rs#L1607-L1628),
  [JSONL writer](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/rollout/src/recorder.rs#L1948-L1973)).
- The current local store writes and flushes JSONL first, then materializes paginated history to
  SQLite. Its own comment is unambiguous: “SQLite is a rebuildable view” and may lag JSONL but may
  never get ahead of canonical history
  ([`thread-store/src/local/live_writer.rs`, `write_and_project`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/thread-store/src/local/live_writer.rs#L309-L365)).
  `state_5.sqlite` extracts only the cumulative token total from `TokenCount`; it does not store the
  rate-limit snapshot
  ([`state/src/extract.rs`, `apply_event_msg`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/state/src/extract.rs#L96-L109)).
- `codex app-server` is the common rich-client interface and `thread/start` returns a path unless
  `ephemeral: true` ([lifecycle](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/app-server/README.md#L66-L83)).
  Desktop therefore uses this shared path by inference; its proprietary frontend is not in the repo.

**Confidence: high for current core persistence; medium for the Desktop-specific inference; low for
any claim about future canonical storage.**

## Q2 — Claude drain history

**Verdict: No supported, reliable Claude usage-snapshot history was verified. Rotating full-config
backups can incidentally contain older snapshots, but they are unsuitable as a product data source.**

Evidence:

- Anthropic documents transcripts under `<config-dir>/projects/.../*.jsonl`, but those are session
  messages/token usage, not historical `cachedUsageUtilization` snapshots
  ([Claude Code session storage](https://code.claude.com/docs/en/sessions#export-and-locate-session-data)).
- On Claude Code `2.1.218`, key-only inspection found five config backups containing only two
  distinct usage-fetch times. They are undocumented full-state backups containing unrelated data;
  expanding the allowlist for this weak coverage is unjustified.
- No debug files or daemon log existed locally; Anthropic documents the latter as agent-view state, not usage history
  ([agent-view state](https://code.claude.com/docs/en/agent-view#how-background-sessions-work)).
- I found no official documentation or ccusage code that reads historical utilization snapshots.
  ccusage reconstructs token usage from transcripts instead.

Therefore Claude `drain` should be empty on first submission and accumulated server-side across
submissions. Any debug-log alternative is **unverified**.

**Confidence: medium.** Absence cannot be proven for every Claude build, but no stable source was
verified and the only local history found is explicitly a poor source.

## Q3 — paths and environment semantics

**Verdict: `CODEX_HOME` is exact and documented in source. Claude transcript relocation is documented;
the relocated `.claude.json` path is verified from the installed binary but not clearly stated in
public docs. WSL uses its Linux home unless explicitly redirected.**

Evidence:

- Codex: a non-empty `CODEX_HOME` must already exist and be a directory; Codex canonicalizes it.
  Without it, Codex uses the platform home plus `.codex`; it does not consult XDG
  ([`find_codex_home`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/utils/home-dir/src/lib.rs#L5-L55)).
  Thus defaults are `~/.codex` on macOS/Linux, `%USERPROFILE%\.codex` on native Windows, and the
  WSL distribution's `$HOME/.codex` inside WSL. Windows and WSL stores are separate unless the user
  points `CODEX_HOME` across the boundary.
- Claude: official docs define `CLAUDE_CONFIG_DIR` as a single override for the default
  `~/.claude`, containing settings, credentials, sessions, and plugins
  ([environment variable reference](https://code.claude.com/docs/en/env-vars#environment-variables)).
  Transcript paths become `<CLAUDE_CONFIG_DIR>/projects/...`
  ([sessions docs](https://code.claude.com/docs/en/sessions#export-and-locate-session-data)).
- Binary inspection of Claude Code `2.1.218` resolved global state as
  `join(CLAUDE_CONFIG_DIR || homedir(), ".claude.json")`: default `~/.claude.json`, override
  `<CLAUDE_CONFIG_DIR>/.claude.json`. No second profile or credential access was used.
- Anthropic maps `~/.claude` to `%USERPROFILE%\.claude` on native Windows
  ([directory reference](https://code.claude.com/docs/en/claude-directory)); global state therefore
  defaults to `%USERPROFILE%\.claude.json`. WSL follows Linux paths and does not merge that profile.
- ccusage accepts comma-separated `CLAUDE_CONFIG_DIR` values, but that is a ccusage extension
  ([`claude_paths`](https://github.com/ccusage/ccusage/blob/a8e32cf88db64f2fe6855942036f51a3a867890d/rust/adapters/claude/src/paths.rs#L10-L43)),
  not verified Claude Code behavior. tokenbroke should treat the environment variable as one path.

**Confidence: high for Codex and default OS paths; high for Claude `2.1.218`; medium for future Claude
builds because the `.claude.json` relocation detail is not a public compatibility guarantee.**

## Q4 — field semantics and enums

**Verdict: The RFC is right to key Codex windows by duration, but it must also preserve `limit_id`.
Codex enums/options are source-verifiable; the full Claude `kind` and `severity` enums are unverified.**

Evidence:

- Codex parses `primary` and `secondary` independently from correspondingly named response headers.
  The protocol assigns no stronger semantic meaning to the slots
  ([header parser](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/codex-api/src/rate_limits.rs#L22-L98)).
  `window_minutes` and `resets_at` are both optional, while `used_percent` is required when a window
  exists
  ([`RateLimitWindow`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/protocol/src/protocol.rs#L2214-L2223)).
  `secondary: null` therefore means that no secondary window was returned/retained; it is not a
  plan-tier invariant. `resets_at` is explicitly not guaranteed.
- `limit_id` is open-ended. The parser defaults the legacy family to `codex`, discovers additional
  `x-<limit>-primary-used-percent` families, normalizes hyphens to underscores, and tests
  `codex_other` only as an example
  ([`parse_all_rate_limits`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/codex-api/src/rate_limits.rs#L22-L98)).
  There is no closed list to hardcode.
- Serialized Codex `plan_type` values are `free`, `go`, `plus`, `pro`, `prolite`, `team`,
  `self_serve_business_prolite`, `self_serve_business_usage_based`, `business`, `ent26`,
  `enterprise_cbp_automation`, `enterprise_cbp_usage_based`, `enterprise`, `edu`, `edu_plus`,
  `edu_pro`, and `unknown` ([wire enum](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/protocol/src/account.rs#L12-L41)).
  Auth parsing accepts `hc`/`education`, but unknown raw strings collapse to wire value `unknown`.
- Claude local key-only inspection observed `session`, `weekly_all`, and `weekly_scoped`; observed
  severities were `normal` and `warning`. Public issue evidence also shows the same kinds, but I found
  no authoritative schema declaring either enum closed. The full Claude `kind` enum is
  **unverified**. The full Claude `severity` enum is **unverified**. Treat both as opaque strings.

**Confidence: high for Codex; low for a complete Claude enumeration.**

## Q5 — tier mapping and human labels

**Verdict: Preserve raw tier values and derive labels separately. Codex labels can follow upstream;
only Claude Max 5x/20x raw mappings are verified here. Do not invent a complete Claude tier enum.**

Evidence:

- Codex upstream provides display names for every known plan. Use those labels, including “Pro Lite”,
  “Self Serve Business Usage Based”, “Enterprise (Automation)”, “Edu Plus”, and “Edu Pro”, while
  displaying unknown raw values conservatively
  ([`KnownPlan::display_name`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/protocol/src/auth.rs#L120-L160)).
- Local Claude state verified `organizationType = claude_max` and
  `organizationRateLimitTier = default_claude_max_5x`; the installed binary also contains explicit
  handling for `default_claude_max_5x` and `default_claude_max_20x`. Map those to “Max 5x” and
  “Max 20x”. Anthropic publicly names exactly those two tiers
  ([Max plan](https://support.claude.com/en/articles/11049741-what-is-the-max-plan#how-much-does-the-max-plan-cost)).
- Official human product categories are Pro, Max, Team (Standard/Premium seats), and Enterprise
  (multiple seat/billing forms)
  ([Team/Enterprise Claude Code access](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)).
  Exact `organizationRateLimitTier` strings for Pro, Team, and Enterprise are **unverified**.

I would store `{ raw, label }`, normalize only verified exact values, and use raw as the fallback.
`organizationRateLimitTier` wins over broader `organizationType`; null means “unknown”, not “Free”.

**Confidence: high for Codex and Claude Max; low for a complete Claude raw-tier mapping.**

## Q6 — anti-abuse signals available at read time

**Verdict: None of the local signals is hard to fake by a motivated user. Several are cheap
consistency features, but they must feed server-side anomaly scoring, never local acceptance or a
claim of attestation.**

Useful, privacy-safe summaries:

- Snapshot age, schema completeness, number of windows, and whether percent/reset fields are finite
  and in plausible ranges.
- Counts of distinct session files and distinct request/message pairs in the evidence interval; send
  counts, never paths or IDs.
- Per-series sample count, observed time span, reset-time changes, and min/max/last percent. Preserve
  decreases rather than rejecting them: rolling windows, credits, server corrections, and global
  resets can all break monotonicity.
- Token totals aggregated by hour/tool/model family, plus the number of malformed, duplicate, and
  discarded records. Model should be omitted if not required for a specific check.

Signals I would not trust for rejection:

- File mtimes, tool version strings, session counts, timestamps, and CLI signatures are all
  user-controlled. A signing key shipped inside an npm package authenticates the package format, not
  the truth of local files.
- `resets_at` need not align to simple wall-clock boundaries; weekly reset times can be account
  assigned.
- Local tokens do not necessarily explain account-level percent changes: usage can come from another
  machine/surface, and model/plan weighting is not public.
- Codex rate-limit-only updates re-emit `TokenCount` with the current `info`
  ([source path](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/session/mod.rs#L4033-L4073)).
  Summing `last_token_usage` therefore overcounts. `total_token_usage` deltas need per-session
  reset/compaction guards and remain only supporting evidence.

**Confidence: high.** This follows from the local-files trust boundary, not from undocumented server
behavior.

## Q7 — overall critique verdict

**Verdict: Keep the snapshot-first, fail-closed, allowlisted direction. Change the data model,
Claude dedupe/parser, Codex file coverage, privacy claim, and performance contract before
implementation.**

**Confidence: high.**

## Critique of §3

### Principles

1. **“Report, don't estimate” is correct for rate limits, not for token evidence.** Keep server-reported
   percentages authoritative. Label token-derived fields as evidence; Codex itself can emit estimated
   token totals during recomputation. Never turn missing windows into `0%` or reconstructed limits.
2. **The allowlist principle is necessary but the proposed leak test is insufficient.** A sentinel
   output test proves only that content was not returned; it does not prove that forbidden files were
   not opened. Add an instrumented-filesystem test asserting every attempted open is in the exact
   allowlist. Also test symlinks and canonicalized roots so an allowlisted-looking path cannot escape.
3. **Be precise about `.claude.json`.** It contains PII, project paths, and unrelated state. A normal
   JSON parse reads the whole file even if only selected keys are retained. The defensible promise is
   “opens this state file and extracts/transmits only allowlisted fields,” not “reads only those
   bytes.” Validate into a narrow DTO and discard the raw object immediately.
4. **Prefix filtering is only an optimization.** Key order and whitespace are not JSON semantics.
   Test reordered keys, spacing changes, partial final lines, and unknown variants.
5. **Freshness needs two meanings.** Claude's `fetchedAtMs` is an API-fetch time. A Codex rollout line
   timestamp is a local emission/observation time. Calling both `snapshotAt` hides that distinction.

### Normalized shape

- `UsageWindow.kind` is too lossy. A series key needs tool, raw kind, `limitId`, scope, and duration;
  preserve `group`/`isActive` too and derive UI kinds separately.
- `DrainSample` must reference that stable series key, not only `windowKind`. The proposed Codex
  dedupe `(at, windowMinutes)` also collides across `limit_id`s.
- Replace the ambiguous `detected: true, windows: []` versus `ToolAbsent { reason: "no-data" }` split
  with separate `installation/data-root status` and `observation status` (`ok`, `no-snapshot`,
  `unreadable`, `timed-out`, `unsupported-format`). Empty windows then have one meaning.
- Use warning codes, keep raw plan and label separately, and add `observedAt` plus optional
  `sourceFetchedAt`.
- Do not put hourly `TokenSample[]` on the primary reading. Put bounded aggregate evidence in a
  separate optional block so snapshot correctness and latency do not depend on transcript scanning.

### Claude reader

- Prefer `limits[]`, but do not assume its enums are closed or that `is_active` means “only row to
  keep.” Preserve all valid rows and let ranking select the relevant series explicitly.
- “Assistant lines only; dedupe `message.id + requestId`” is incomplete. Current ccusage parses
  direct/nested progress and subagent records ([reader](https://github.com/ccusage/ccusage/blob/a8e32cf88db64f2fe6855942036f51a3a867890d/rust/adapters/claude/src/daily.rs#L214-L341));
  its dedupe retains the more complete record and handles sidechain replays
  ([dedupe](https://github.com/ccusage/ccusage/blob/a8e32cf88db64f2fe6855942036f51a3a867890d/rust/adapters/claude/src/daily.rs#L367-L441)).
- ccusage currently reads whole files and parallelizes them; it does not establish that tokenbroke's
  1.5-second target is met. Benchmark tokenbroke's own bounded implementation.
- Do not read rotating config backups or debug logs. They violate the narrow allowlist for unreliable
  benefit.

### Codex reader

- Keep rollout JSONL as the primary source and do not open `state_5.sqlite`, `thread_history_1.sqlite`,
  or logs databases. Current source explicitly makes JSONL canonical.
- Search `sessions/` for the fast current snapshot, but also consider `archived_sessions/` when no
  newer active rollout has a sample. An archived recent thread can contain the newest available
  snapshot.
- Recognize `.jsonl.zst`: Codex's off-by-default compressor already writes it
  ([compression source](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/rollout/src/compression.rs#L18-L50)).
  An `unsupported-format` warning is acceptable at launch; silent “no data” is not.
- Find the newest snapshot with reverse/tail scanning before doing a seven-day history walk. Snapshot
  availability should not wait on token aggregation.
- Preserve `limit_id`; do not key only by duration. `window_minutes = null` is legal, so retain the
  source slot as a last-resort discriminator without assigning it business semantics.
- Do not sum `last_token_usage`. If token evidence remains in v1, use guarded cumulative deltas per
  rollout and report discarded/reset cases.

### Module layout and 1.5-second budget

- The module split is reasonable, but provider-specific extractors should own their narrow schemas;
  a generic `jsonl.ts` must never return raw event objects to callers.
- `Promise.all` at reader level is fine. Inside each reader, use bounded file concurrency; unbounded
  parallel reads can make both readers slower on a busy disk.
- Treat 1.5 seconds as a measured p95 target and a soft evidence deadline, not an all-or-nothing
  correctness rule. Phase 1 returns snapshots; Phase 2 spends the remaining budget on history. On
  timeout, return the snapshot plus a typed `evidence-timed-out` warning.
- Benchmark cold cache, 1,000+ rollouts, hundreds of Claude files, a large transcript, malformed
  tails, and concurrent appends; publish p50/p95 before freezing the number.

## What I would build instead

I would keep two provider readers but make each a two-phase, budgeted pipeline:

1. **Resolve and validate roots.** Canonicalize one Claude root and one Codex home; reject bad
   overrides and construct exact candidate patterns without opening anything else.
2. **Snapshot phase.** Read Claude state and reverse-scan recent Codex rollouts; return raw windows
   with stable series identity, plan, observation/source times, and typed status.
3. **Evidence phase.** Under a separate deadline, scan eligible transcript/rollout files with bounded
   concurrency and provider-correct dedupe. Produce only aggregate counts/totals and per-series drain
   summaries. No paths, IDs, prompts, content, account identifiers, or raw records leave the reader.
4. **Independent degradation.** A good snapshot with timed-out evidence is rankable. A detected tool
   with no snapshot is visible but not rankable. One provider failing never suppresses the other.
5. **Versioned fixtures and access tests.** Cover old/new Claude shapes, nested progress/subagents,
   Codex legacy/paginated rollouts, multiple `limit_id`s, optional reset/duration, compressed-file
   detection, partial lines, symlink escape, and an assertion over every attempted filesystem open.

That differs materially from §3 mainly by separating authoritative snapshots from weak evidence,
preserving source identities instead of prematurely normalizing them, and making the latency target a
degradation policy rather than a single stopwatch around both readers.

## Implementation notes

Implemented against §5 on 2026-08-23. The real-machine dump returned `install: "found"` and
`observation: "ok"` for both tools, with plan labels `Max 5x` and `Plus`; Codex drain reached the
intentional 2,000-sample cap. Twenty warm-cache runs produced:

```text
claude-code evidence        p50     0.0 ms  p95     0.0 ms
claude-code snapshot        p50     0.5 ms  p95     0.8 ms
claude-code total           p50     0.5 ms  p95     0.8 ms
codex evidence              p50   333.6 ms  p95   364.7 ms
codex snapshot              p50     5.8 ms  p95     6.5 ms
codex total                 p50   339.5 ms  p95   373.6 ms
```

Deviations from §5: none. The access layer rejects a symlinked Claude state file unless its real path
is exactly `.claude.json` under the canonical Claude config root; this is the allowlist/symlink-escape
rule applied to the exact-file allowlist, not a broader data-source change.
