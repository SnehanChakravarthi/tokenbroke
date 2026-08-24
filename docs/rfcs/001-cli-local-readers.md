# RFC 001 — CLI local-data readers (Claude Code + Codex)

- Status: **Decided 2026-08-23** (see §5; Codex opinion in `001-cli-local-readers.codex.md`)
- Author: Claude Code (Fable 5), 2026-08-23
- Scope: how `npx tokenbroke` reads rate-limit ground truth from the user's machine for both tools.
  Nothing else (submission, signing, output) is decided here.

## 1. Why this is first

The readers are the riskiest unknown in the product. If they are wrong, slow, or leak content, nothing
above them matters. "Everything on this board is real" is only true if these two modules are.

## 2. Findings (investigated on a real macOS machine, 2026-08-23)

Both tools cache the **server's own rate-limit state** locally. We do not have to reconstruct limits
from token counts; we only need token counts for drain history and consistency signals.

### 2.1 Claude Code

**Current snapshot:** `~/.claude.json` (note: the JSON file at `$HOME`, not the `~/.claude/` dir),
key `cachedUsageUtilization`:

```jsonc
{
  "fetchedAtMs": 1787211359719,            // when Claude Code last pulled this from the API
  "accountUuid": "…",                       // DO NOT submit
  "utilization": {
    "five_hour": { "utilization": 0,  "resets_at": "2026-08-20T08:10:00.498186+00:00", … },
    "seven_day": { "utilization": 4,  "resets_at": "2026-08-26T07:00:00.498208+00:00", … },
    "seven_day_opus": null, "seven_day_sonnet": null, …   // model-scoped windows, often null
    "extra_usage": { "is_enabled": false, … },
    "limits": [
      { "kind": "session",       "group": "session", "percent": 0, "severity": "normal",
        "resets_at": "2026-08-20T08:10:00.498186+00:00", "scope": null, "is_active": false },
      { "kind": "weekly_all",    "group": "weekly",  "percent": 4, "severity": "normal", … },
      { "kind": "weekly_scoped", "group": "weekly",  "percent": 5, "severity": "normal",
        "scope": { "model": { "display_name": "Fable" } }, "is_active": true }
    ],
    "spend": { … }
  }
}
```

`utilization` is **percent used** (0–100). `limits[]` is the richer, newer shape (kind/group/severity/
scope/is_active); `five_hour`/`seven_day` are the legacy flat fields. Both present on Claude Code 2.1.x.

**Plan tier:** `~/.claude.json` → `oauthAccount`:
`organizationType: "claude_max"`, `organizationRateLimitTier: "default_claude_max_5x"`,
`billingType: "stripe_subscription"`, `subscriptionType: null` (null on this machine).
`oauthAccount` also holds email, names, org name, UUIDs: **read only the tier fields, never the rest.**

**Drain history:** `~/.claude/projects/<project>/<session>.jsonl`. Lines with `type: "assistant"` carry
`timestamp`, `requestId`, `message.id`, `message.model`, `message.usage` (`input_tokens`,
`output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, …). `message.content` is the
conversation and must never be read past the parser. ccusage dedupes on `message.id + requestId`.

**Not useful:** `~/.claude/stats-cache.json` (lifetime aggregates, no limits), `history.jsonl`
(prompt history: **forbidden**), `.credentials.json` (**forbidden**).

### 2.2 Codex CLI

**Current snapshot + history in one place:** `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`.
Every `{"type":"event_msg","payload":{"type":"token_count", …}}` line carries:

```jsonc
"rate_limits": {
  "limit_id": "codex", "limit_name": null,
  "primary":   { "used_percent": 80.0, "window_minutes": 10080, "resets_at": 1787858243 },
  "secondary": null,                       // on other plans: the other window, same shape
  "credits": { "has_credits": false, "unlimited": false, "balance": "0" },
  "individual_limit": null, "spend_control_reached": null,
  "plan_type": "plus",                     // plan tier, no auth file needed
  "rate_limit_reached_type": null
},
"info": { "last_token_usage": {…}, "model_context_window": …, "total_token_usage": {…} }
```

`resets_at` is unix seconds. Windows must be identified by `window_minutes` (300 = 5h, 10080 = 7d),
**not** by the `primary`/`secondary` slot: on this Plus account `primary` is the weekly window and
`secondary` is null. 1,292 rollout files exist on this machine; date-partitioned dirs make
"newest first" cheap. `~/.codex/archived_sessions/` also exists.

**Forbidden:** `auth.json` (tokens), `history.jsonl`, `memories*`, `logs_*.sqlite`,
`thread_history_*.sqlite`. Codex also keeps `state_5.sqlite`, which may be becoming canonical (see Q1).

## 3. Proposed direction

### 3.1 Principles
1. **Report, don't estimate.** If a tool is installed but has no rate-limit snapshot, emit
   `detected: true, windows: []` and say so. No reconstructed "probably ~60%". Integrity > coverage.
2. **Path allowlist, not denylist.** Each reader declares the exact files it may open. Anything else is
   a bug. A unit "leak test" feeds fixtures containing sentinel strings in content fields and asserts
   the sentinel never appears in reader output.
3. **Parse the minimum.** JSONL is streamed line-by-line; non-matching line types are skipped by a cheap
   prefix check before `JSON.parse`; only allowlisted keys are copied out.
4. **Budget: ≤1.5 s total for both readers** on a machine with 1,000+ rollouts and a large
   `~/.claude/projects`. Only open files whose mtime falls in the drain-history window (7 days).
5. **Freshness is data.** Every snapshot carries its source timestamp; the server decides how stale is
   too stale for ranking vs. aggregate.

### 3.2 Normalized shape (proposal; final type lands in `@tokenbroke/shared` after Decision)

```ts
type ToolId = "claude-code" | "codex";

interface UsageWindow {
  kind: "session" | "weekly" | "weekly-model" | "other";
  windowMinutes: number | null;    // 300, 10080, …
  usedPercent: number;             // 0–100, as reported by the tool
  resetsAt: string | null;         // ISO 8601 UTC
  scope?: string;                  // e.g. model display name for scoped windows
  severity?: string;               // Claude-only passthrough
}

interface DrainSample { at: string; windowKind: UsageWindow["kind"]; usedPercent: number }
interface TokenSample { at: string; input: number; output: number; cacheRead: number; cacheWrite: number; model?: string }

interface ToolReading {
  tool: ToolId;
  detected: true;
  toolVersion: string | null;
  plan: string | null;             // "claude_max_5x" | "plus" | … (raw, normalised server-side)
  snapshotAt: string | null;       // when the tool last fetched from its API
  windows: UsageWindow[];
  drain: DrainSample[];            // Codex: real server samples; Claude: empty in v1 (see Q2)
  tokens: TokenSample[];           // hourly buckets, last 7 days, for consistency checks
  warnings: string[];              // "snapshot is 31h old", "no rollouts in last 7 days", …
}

interface ToolAbsent { tool: ToolId; detected: false; reason: "not-installed" | "no-data" | "unreadable" }

type LocalReadings = Array<ToolReading | ToolAbsent>;
```

### 3.3 Claude Code reader
- Resolve config: `$CLAUDE_CONFIG_DIR` if set, else `~/.claude`; the JSON file is `~/.claude.json`
  (verify where it lives when `CLAUDE_CONFIG_DIR` is set — Q3).
- Detect: `~/.claude.json` exists **or** `~/.claude/` exists.
- Snapshot: `cachedUsageUtilization.utilization.limits[]` → windows (prefer this; fall back to
  `five_hour`/`seven_day` when `limits` is absent on older versions). `fetchedAtMs` → `snapshotAt`.
- Plan: `oauthAccount.organizationRateLimitTier ?? organizationType ?? subscriptionType`.
- Tokens: stream `projects/**/*.jsonl` with mtime ≥ now−7d; `assistant` lines only; dedupe on
  `message.id+requestId`; bucket hourly.
- Drain: none in v1. Claude only caches the latest snapshot; we can build history server-side from
  successive submissions.

### 3.4 Codex reader
- Resolve home: `$CODEX_HOME` if set, else `~/.codex`.
- Detect: dir exists.
- Walk `sessions/` newest date dir first; open rollouts with mtime ≥ now−7d; collect every
  `token_count` line's `rate_limits` with its line `timestamp`.
- Snapshot = newest sample; windows from `primary`/`secondary` keyed by `window_minutes`;
  `resets_at` unix s → ISO. Plan = `plan_type`.
- Drain = all samples (deduped by `(at, windowMinutes)`), oldest→newest.
- Tokens: `info.last_token_usage` per `token_count` line, bucketed hourly.

### 3.5 Module layout (`packages/cli/src/readers/`)
```
types.ts          ToolReading / ToolAbsent / UsageWindow …
paths.ts          home-dir + env-var resolution, the allowlist
jsonl.ts          streaming line reader with prefix-filter + allowlisted-key extraction
claude-code.ts    readClaudeCode(): Promise<ToolReading | ToolAbsent>
codex.ts          readCodex(): Promise<ToolReading | ToolAbsent>
index.ts          readAll(): Promise<LocalReadings>   (Promise.all, each reader isolated by try/catch)
```
Fixtures in `packages/cli/test/fixtures/{claude-code,codex}/` built from the real shapes above with
identifiers replaced and sentinel strings planted in content fields.

## 4. Open questions for Codex (please research, don't guess)

- **Q1 (durability):** Codex has `state_5.sqlite`, `session_index.jsonl`, `thread_history_1.sqlite`.
  Are rollout JSONLs still written by current Codex CLI *and* the Codex desktop app, and will they
  remain the canonical session record, or is SQLite becoming canonical? Cite the code path in
  `openai/codex` (`codex-rs/…`) that writes `token_count` + `rate_limits`.
- **Q2 (Claude drain):** is there any local history of `cachedUsageUtilization` (or a debug log) that
  would let us build drain history for Claude without server-side accumulation?
- **Q3 (paths):** exact `CLAUDE_CONFIG_DIR` semantics for `.claude.json`; `CODEX_HOME`; Windows and
  Linux paths for both; anything different under WSL.
- **Q4 (semantics):** Codex `rate_limits`: meaning of `primary`/`secondary`, the full set of
  `plan_type` values, when `secondary` is null, `limit_id` values, and whether `resets_at` is always
  present. Claude `limits[]`: the full `kind` enum and what `severity` values exist.
- **Q5 (tier mapping):** canonical human labels. Claude: `organizationRateLimitTier` values
  (`default_claude_max_5x`, `…_20x`, pro, team?). Codex: `plus` / `pro` / `team` / `enterprise` /
  `free` / `edu`?
- **Q6 (anti-abuse at read time):** which read-time signals are cheap and hard to fake? Candidates:
  tool version, number of distinct sessions in window, monotonicity of `used_percent` between resets,
  `resets_at` aligning with `window_minutes` boundaries, token bucket totals vs. used-percent delta.
- **Q7 (critique):** anything wrong or missing in §3? Specifically: the "no estimates" stance, the
  normalized shape, the 1.5 s budget, and the allowlist approach.

## 5. Decision

Reconciled by Claude Code from §3 and Codex's review. Where they differ, this section wins.

### 5.1 Accepted from Codex (all verified in `openai/codex@c9b19de` or locally)
- Rollout JSONL is canonical for Codex; SQLite is a rebuildable projection. **Never open any `.sqlite`.**
- No local Claude drain history exists. Claude `drain` is empty in v1; the server accumulates it
  across submissions. **Never open `~/.claude/backups/`, debug logs, or `history.jsonl`.**
- Paths: `.claude.json` = `join(CLAUDE_CONFIG_DIR || homedir(), ".claude.json")`. `CODEX_HOME` must
  exist and be a directory, else `~/.codex`. One path per env var; no XDG; Windows = `%USERPROFILE%`.
- Codex `primary`/`secondary` carry no semantics; `window_minutes` and `resets_at` are optional;
  `limit_id` is open-ended and must be preserved. Claude `kind`/`severity` are opaque strings.
- Plan tier is `{ raw, label }`. Labels only for verified values (Claude: `default_claude_max_5x` →
  "Max 5x", `default_claude_max_20x` → "Max 20x"; Codex: upstream `KnownPlan::display_name`).
  `raw` falls back to `organizationRateLimitTier ?? organizationType ?? subscriptionType`. Null = unknown.
- No read-time signal is trustworthy for local rejection; signals feed server-side scoring only.
- Do not sum Codex `last_token_usage` (rate-limit-only updates re-emit it).
- Privacy wording: the reader **opens** `~/.claude.json` (which contains PII) and **extracts only
  allowlisted fields**; the raw object is discarded immediately and never logged.

### 5.2 Architecture: two-phase, budgeted, independently degrading
1. **Resolve roots.** Canonicalize one Claude state file and one Codex home. A set-but-invalid env
   override → `install: "invalid-override"`. Nothing else is opened.
2. **Snapshot phase (target ≤ 500 ms p95).** Claude: parse state file → DTO. Codex: reverse-scan the
   newest rollouts (tail read, bounded file count) for the last `token_count` line with non-null
   `rate_limits`; fall back to `archived_sessions/` if `sessions/` has none.
3. **Evidence phase (separate 1000 ms deadline).** Codex only in v1: every `rate_limits` sample from
   rollouts with mtime within 7 days → `drain` series. On deadline, return partial drain +
   `evidence-timed-out`. **Token-usage evidence (transcript scanning, ccusage-style dedupe) is deferred
   to Phase 2** — it serves anomaly hardening, not ranking.
4. **Degradation.** Good snapshot + timed-out evidence = rankable. Found tool + no snapshot = visible,
   not rankable. One tool failing never affects the other (`Promise.allSettled`-style isolation).

### 5.3 Types (land in `packages/shared/src/readings.ts`; these are the core of the submit payload)
```ts
export type ToolId = "claude-code" | "codex";
export type InstallStatus = "found" | "not-found" | "invalid-override";
export type ObservationStatus = "ok" | "no-snapshot" | "unreadable" | "unsupported-format" | "timed-out";
export type ReaderWarning =
  | "snapshot-stale"            // Claude fetchedAtMs > 24h old
  | "evidence-timed-out"
  | "compressed-rollouts-skipped"
  | "malformed-lines-skipped"
  | "archived-fallback-used"
  | "plan-unknown";

export interface UsageSeriesKey {
  limitId: string;              // codex: rate_limits.limit_id ?? "codex"; claude: "claude"
  rawKind: string;              // claude: limits[].kind | "five_hour" | "seven_day"; codex: "primary" | "secondary"
  windowMinutes: number | null; // codex: as reported; claude: session→300, weekly→10080, else null
  scope: string | null;         // claude weekly_scoped model display name
}
export function seriesId(k: UsageSeriesKey): string; // `${limitId}:${rawKind}:${windowMinutes ?? "?"}:${scope ?? ""}`

export interface UsageWindow extends UsageSeriesKey {
  seriesId: string;
  usedPercent: number;          // 0–100 as reported; never synthesized
  resetsAt: string | null;      // ISO 8601 UTC
  group: string | null;         // claude limits[].group
  severity: string | null;      // claude, opaque
  isActive: boolean | null;     // claude
}
export interface DrainSample { at: string; seriesId: string; usedPercent: number; resetsAt: string | null }
export interface PlanInfo { raw: string | null; label: string | null }

export interface ToolReading {
  tool: ToolId;
  install: InstallStatus;
  observation: ObservationStatus;
  toolVersion: string | null;
  plan: PlanInfo;
  observedAt: string | null;      // when the tool recorded the snapshot locally (codex line timestamp)
  sourceFetchedAt: string | null; // when the tool fetched it from its API (claude fetchedAtMs)
  windows: UsageWindow[];
  drain: DrainSample[];           // codex only in v1, ascending by `at`
  evidence: null;                 // reserved for Phase 2 token evidence
  warnings: ReaderWarning[];
}
export type LocalReadings = [claudeCode: ToolReading, codex: ToolReading]; // fixed order, always both
```
Rankable (server rule, documented here for symmetry): `install === "found" && observation === "ok"
&& windows.length > 0`.

### 5.4 Reader rules
- **Claude:** `install: found` iff the state file exists. Prefer `limits[]`; keep every valid row
  (do not filter on `is_active`); fall back to `five_hour`/`seven_day` when `limits` is absent.
  `snapshot-stale` warning when `fetchedAtMs` is older than 24 h. `toolVersion` from a verifiable
  non-identifying field or null.
- **Codex:** `install: found` iff home dir exists. `.jsonl.zst` files are counted, never opened:
  `compressed-rollouts-skipped`, or `observation: "unsupported-format"` when only compressed rollouts
  exist. `resets_at` unix seconds → ISO. Drain deduped on `(seriesId, at)`, capped at the most recent
  2,000 samples.
- **Allowlist enforced in code, not by convention.** All filesystem access goes through one injected
  access layer that `realpath`s and matches against: the Claude state file; `<codexHome>/sessions/**`
  and `<codexHome>/archived_sessions/**` directory listings and `rollout-*.jsonl` files. Tests assert
  every attempted open against the allowlist, including a symlink-escape case.
- **Zero runtime dependencies.** Node 20 built-ins only. Bounded concurrency (4) inside readers.
- Fixtures are versioned (old Claude flat shape, new `limits[]` shape, Codex legacy + paginated
  rollouts, multiple `limit_id`s, null `window_minutes`/`resets_at`, partial final line, reordered
  keys, compressed file present). A bench script reports p50/p95 on a real machine before the
  budgets are frozen.

### 5.5 Rejected / deferred
- Codex's suggestion to keep token evidence in v1 under a guarded cumulative-delta model: **deferred
  to Phase 2** (RFC 00x), along with the ccusage-grade dedupe. The `evidence` slot is reserved.
- Reading `~/.claude/backups/` for incidental history: rejected (Codex agrees).

## 6. Review (2026-08-23, Claude Code + Opus adversarial audit)

Codex's implementation matched §5 with no deviations. Review changed the following before acceptance:

- **Allowlist hardening** (`access.ts`): resolved paths are now checked against the *canonical*
  `sessions/` and `archived_sessions/` roots, not the home (a symlink named like a rollout could reach
  `auth.json`); hardlinks are rejected (`nlink > 1`, since `realpath` cannot see through them); files
  are opened `O_NOFOLLOW` and stat'd with `lstat`; a symlinked `sessions/` tree on another volume now
  works instead of failing silently.
- **Output clamping** (`sanitize.ts`): every file-controlled string that reaches the payload
  (`limit_id`, `plan_type`, Claude `kind`/`group`/`severity`, scoped model name, plan raw fields) is
  restricted to `[A-Za-z0-9_.:-]` and ≤ 64 chars (labels ≤ 40 with single spaces). This closes the only
  exfiltration channel out of the allowlist: the payload is public.
- **Per-file failures are non-fatal** (`codex.ts`): a rejected rollout (hardlinked backup, vanished
  mid-walk) is skipped, not promoted to `observation: "unreadable"` for the whole tool.
- Claude `observedAt` is set to `sourceFetchedAt` so `observation: "ok"` always has a timestamp.
- Tests: 25 (was 19). New: in-home symlink escape, hardlink rejection, hardlink-beside-legit rollout,
  symlinked sessions tree, hostile-string fixtures for both tools, stat-attempt allowlist assertion.
- Bench after review (10 runs): Codex snapshot p95 7.9 ms, evidence p95 385 ms; Claude p95 2 ms.

Known follow-ups (not blocking): prune date-named rollout dirs older than the 7-day window by name
before stat-ing (would cut most of the 330 ms); `toolVersion` could come from `session_meta.cli_version`
on line 1 of the snapshot rollout (left null; version strings are user-controlled anyway).
