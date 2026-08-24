# RFC 002 — Submission contract, device identity, claim code, and hook-driven updates

- Status: **Decided 2026-08-23** (see §9; Codex opinion in `002-submission-identity-updates.codex.md`)
- Author: Claude Code (Fable 5), 2026-08-23
- Depends on: RFC 001 (readers, `ToolReading`). Pairs with RFC 003 (scoring, staleness).
- Scope: everything between `readAll()` returning and the ASCII screen printing, plus how a row stays
  fresh after the first run. Not in scope: ranking math (003), site UI, DB tables (a later RFC once
  002/003 are decided; Drizzle schema follows from these contracts).

## 1. Decisions already made by the owner

- API is versioned from day one: `POST /api/v1/submissions`, payload carries `schemaVersion: 1`.
- Updates are **event-driven via the tools' own hook systems**, opt-in, never a daemon. `--watch` is
  dropped from the roadmap.
- Identity is deferred: anonymous first run; GitHub claim is optional vanity. Plan tier on every row.

## 2. Device identity and signing

What signing buys us, honestly: **row ownership and stream continuity**, not truth. The CLI is open
source; anyone can fabricate a payload. But only the holder of a device key can *update* that row, so
"one submission stream per identity" is enforceable, and claiming binds a GitHub account to a key.

- First run generates an **Ed25519 keypair** (`node:crypto`, zero deps) in `~/.tokenbroke/identity.json`
  (mode 0600). `deviceId` = base64url(SHA-256(publicKey)) truncated to 16 bytes.
- Every request body is canonical JSON (sorted keys, no whitespace); header
  `X-Tokenbroke-Signature: ed25519=<base64url sig>`; body includes `publicKey` every time (cheap,
  avoids a registration round-trip) and a `submittedAt` the server checks against ±10 min skew, plus a
  random `nonce` the server dedupes for 24 h.
- Server: verify signature over the exact bytes received, upsert device by `deviceId`, reject if the
  public key for an existing `deviceId` differs.
- `~/.tokenbroke/` also holds `config.json` (anonymous name as assigned, last claim code, hook state)
  and `bin/` (see §5). Nothing in the dir is ever uploaded except the public key.
- Respect `TOKENBROKE_HOME` env var (tests; mirrors `CODEX_HOME`). Honor `TOKENBROKE_API_URL` for
  dev against a local server; default from `BRAND.siteUrl`.

## 3. Submission payload (v1)

```ts
interface SubmissionV1 {
  schemaVersion: 1;
  cliVersion: string;            // from package.json at build time
  deviceId: string;
  publicKey: string;             // base64url raw Ed25519 public key (32 bytes)
  submittedAt: string;           // ISO UTC
  nonce: string;                 // 16 random bytes, base64url
  trigger: "manual" | "hook:claude-code" | "hook:codex";
  platform: { os: "darwin" | "linux" | "win32" | "other"; node: string }; // coarse, for debugging formats
  readings: LocalReadings;       // RFC 001 §5.3, unmodified
}
```
Nothing else. No hostname, no username, no paths, no tool config. `platform.node` is the major
version only (e.g. `"20"`).

## 4. Response and the one-request rule

The CLI makes **exactly one HTTP request** per run and prints from the response. No follow-up fetch
for the leaderboard.

```ts
interface SubmissionResponseV1 {
  schemaVersion: 1;
  accepted: boolean;
  rejectReason?: "signature" | "skew" | "replay" | "rate-limited" | "invalid" | "unsupported-version";
  identity: {
    deviceId: string;
    anonymousName: string;       // assigned server-side on first submission, stable thereafter
    claimed: null | { githubLogin: string };
  };
  claim: null | { code: string; url: string; expiresAt: string }; // null once claimed
  perTool: Array<{
    tool: ToolId;
    rankable: boolean;           // RFC 003 rule
    rank: number | null;         // 1-based among rankable rows for this tool
    total: number;               // rankable rows for this tool
    misery: number | null;
    bindingSeriesId: string | null;
    neighbors: LeaderboardRow[]; // up to 3 above + self + 3 below, for the ASCII board
    roast: string;               // server-side copy, brand voice; varies by rank band
  }>;
  global: {                      // RFC 003 aggregates, for the "Collectively: …" line
    devs: number;
    perTool: Array<{ tool: ToolId; medianRemainingPercent: number | null; daysSinceReset: number | null }>;
  };
  notices: string[];             // e.g. "Claude snapshot is 31h old", "new CLI version available"
}
interface LeaderboardRow {
  rank: number; name: string; claimed: boolean; avatarUrl: string | null;
  plan: string | null; remainingPercent: number; resetsAt: string | null; isYou: boolean;
}
```

Anonymous names are assigned **server-side** (uniqueness), using the generator that moves from
`packages/cli/src/names.ts` to `@tokenbroke/shared` (suffix range extended server-side if collisions
demand it). The CLI never chooses its own name.

Versioning rule: `/api/v1/*` accepts `schemaVersion: 1` only. A future v2 ships a new route and keeps
v1 alive for ≥ 90 days; the server answers old CLIs with a `notices` line, never a hard rejection,
until sunset.

## 5. Hook-driven updates (`npx tokenbroke hooks install | remove | status`)

Principle: the data only changes when the tool runs, so update exactly then. No polling, no daemon.

- **Claude Code:** add a `SessionEnd` hook (and `Stop`? — Q3) to `~/.claude/settings.json`, merged
  into any existing `hooks` arrays, never overwriting. Command:
  `node ~/.tokenbroke/bin/tokenbroke.js hook claude-code`.
- **Codex:** `notify` in `~/.codex/config.toml`. Codex's `notify` is a single command; if the user
  already has one we must chain it (Q2) or refuse with a clear message.
- **`~/.tokenbroke/bin/tokenbroke.js`:** a copy of the bundled single-file CLI, written on `hooks
  install` and refreshed by any later manual run if the running version is newer. Hooks never pay
  `npx` resolution or hit the registry.
- **Hook mode behavior:** detach immediately (spawn self with `detached: true`, `stdio: "ignore"`,
  `unref()`), exit 0 within ~50 ms so the tool is never blocked. The detached child: read, hash the
  `windows` of both readings, compare to `~/.tokenbroke/last-submission.json`; skip if unchanged or if
  the last submission was < 5 min ago; otherwise submit with `trigger: "hook:<tool>"`. Hard 10 s
  timeout. Prints nothing. Errors go to `~/.tokenbroke/hook.log` (rotated at 256 KB, never contains
  payloads).
- **Consent:** after the first manual run's ASCII screen:
  `Keep your row fresh automatically? This adds one hook to ~/.claude/settings.json and
  ~/.codex/config.toml that runs tokenbroke after each session. Remove anytime: npx tokenbroke hooks
  remove. [y/N]`. Non-TTY → never prompt. `--no-hooks-prompt` suppresses. Default no.
- **Uninstall:** `hooks remove` removes exactly the entries it added (identified by the command
  string), restores a chained Codex `notify` to the original, deletes `bin/`. `hooks status` shows
  what is installed and when the last hook submission happened.

## 6. Claim code

- Server issues `claim.code` (format `XXXX-NNNN`, ~31 bits, unambiguous alphabet) on every response
  until the device is claimed; codes expire after 7 days and are regenerated on the next run.
- Site `/claim/<code>`: GitHub OAuth → bind `githubLogin`, avatar, account creation date to the
  device; optional X handle field on the same page. One GitHub account can own many devices; a
  device has at most one owner. Re-claiming a claimed device requires the same GitHub account.
- The CLI prints the URL from `claimUrl(code)` and nothing else changes. Subsequent responses carry
  `identity.claimed` so the ASCII board shows the real name.

## 7. CLI command surface (v1)

```
npx tokenbroke                      read → submit → ASCII board + claim URL (+ hooks offer on first run)
npx tokenbroke hooks install|remove|status
npx tokenbroke hook <tool>          internal; what the hooks call
npx tokenbroke --json               machine-readable: the SubmissionResponseV1 + local readings
npx tokenbroke --dry-run            read and print the board layout from a fake response; no network
```
No other flags in v1. Exit codes: 0 ok, 1 submission rejected, 2 no tool detected (prints a roast
about not even being able to be tokenbroke).

## 8. Open questions for Codex

- **Q1 (hooks, Claude Code):** exact current `settings.json` hook schema (events, matchers, `timeout`,
  `async`), behavior when a hook command fails or exceeds timeout, whether `SessionEnd` fires on
  crash/kill. Cite docs or source.
- **Q2 (hooks, Codex):** current `config.toml` `notify` semantics and payload; does Codex now have a
  multi-hook system (`hooks`?) that would let us coexist with a user's existing `notify`? If not, is
  chaining (our script exec's the user's original command with the same args) acceptable? Cite
  `openai/codex` source at a pinned commit.
- **Q3 (event choice):** `SessionEnd` only, or also `Stop` (after each assistant turn) with the 5-min
  debounce? Which better matches "usage changed"? Consider cost: a `Stop` hook fires dozens of times
  per session.
- **Q4 (identity):** any reason to prefer a server-issued opaque device token over a client keypair?
  Threats we care about: row hijacking, replay, one-identity-many-streams. Threats we do not: truthful
  readings (impossible).
- **Q5 (Windows):** `~/.tokenbroke/bin/tokenbroke.js` invoked via `node` from a hook on Windows —
  path quoting, `node` not on PATH inside the hook's environment, `0600` semantics.
- **Q6 (critique):** the one-request rule and response shape (is `neighbors` enough for a good ASCII
  board? should the CLI get top-3 too?), the 5-min debounce, the consent copy, the `--dry-run` design.

## 9. Decision

Reconciled by Claude Code. Where this differs from §2–§7, this section wins.

### 9.1 Hooks (supersedes §5)
- **Codex:** install into the native multi-hook system (`~/.codex/hooks.json`, event `Stop`,
  `async: true`), never touch `notify`. Codex requires the user to trust hooks via `/hooks`; the
  installer prints that step and `hooks status` reports `installed` vs `trusted/active` separately.
- **Claude Code:** `Stop` hook in `~/.claude/settings.json`, `async: true`, `timeout: 10`, merged
  into existing arrays with an atomic, conflict-aware write. `SessionEnd` is not used (no crash
  guarantee, systematically stale).
- **Handler contract:** exit 0 always; no stdout/stderr; **ignore hook stdin entirely** (both tools
  pass prompts, assistant text, cwd, transcript paths — none of it may be read). The hook entry is a
  tiny coordinator: take an atomic 5-minute lease (`~/.tokenbroke/hook.lock`, O_EXCL + mtime) *before*
  loading readers; on lease → detach a worker that runs RFC 001 readers, hashes `windows` of both
  readings, skips if unchanged, else submits with `trigger: "hook:<tool>"`. Hard 10 s timeout.
- **Paths:** persist `process.execPath` and the absolute script path at install time; Claude hook uses
  the `args` array form; Codex uses `commandWindows` on Windows. `0600` is best-effort on POSIX only.
  `hooks status` detects a missing Node binary and offers reinstall.
- **Consent (after a successful manual submission only, TTY only):** names the detected tools, states
  "at most once per 5 minutes, only after a response, only usage/rate-limit state", states the Codex
  `/hooks` trust step, default N.

### 9.2 Identity (tightens §2)
- Ed25519 stays. Private key PKCS#8 DER, public key SPKI DER, both base64url in `identity.json`.
- The signature covers the **exact request body bytes**; the server verifies those bytes and only then
  parses. Canonical JSON is a client-side convenience, not a server requirement.
- One mutable stream **per device key**. A claimed GitHub account may own several devices.
- Claim-code attempts are rate-limited per IP and per code (the 31-bit code is the weak point, not
  the 128-bit `deviceId`).

### 9.3 Response (tightens §4)
- Discriminated union: `{ ok: true, … }` with `identity/claim/perTool/global/notices`, or
  `{ ok: false, reason, notice }`. Unsupported `schemaVersion` fails closed before persistence.
- `perTool[].top: LeaderboardRow[]` (top 3, deduplicated against `neighbors`/self) added.

### 9.4 CLI surface (tightens §7)
- `--dry-run` is **evidence-only**: run readers, print the readings and the exact redacted outbound
  payload, "network skipped". No fabricated board. Board rendering is unit-tested from fixtures.
- Copy strings live in one file (`packages/cli/src/copy.ts`) authored by the owner/Claude Code.

### 9.5 Unchanged
One-request rule; server-assigned names via the shared generator; `TOKENBROKE_HOME` /
`TOKENBROKE_API_URL`; v1 sunset policy; claim flow (§6).

## 10. Review (2026-08-23, Claude Code + Opus adversarial audit)

Codex's implementation (workstreams A + B) matched §9 with no deviations. E2E against the stub runs
at p50 82 ms. Review + audit changed, before acceptance:

- **Identity race** (high): concurrent first runs minted N identities (the `EEXIST` branch was dead
  behind a `rename`). Now `open(…, "wx")`; losers re-read the winner. Six concurrent creators → one id.
- **Hook installer hygiene:** per-tool isolation (one malformed settings file no longer blocks removal
  of the other tool's hook or the bin copy); user formatting (indent, trailing newline) preserved;
  file mode preserved on remove; the undo record is structural (`markerId`) — the user's settings
  file is **never** copied into `~/.tokenbroke` (it can contain API keys).
- **Honest failures:** `COPY.offline` only for the network call; corrupt identity and malformed hook
  files get their own copy; unknown errors print a generic line (Node fs errors embed absolute paths).
- **Scoring:** `compareRows` guards `NaN` timestamps; a reading whose only ranked window has no
  `resetsAt` is fresh, not stale; `validateRegistry` runs at module load.
- **Stub:** non-finite `submittedAt` rejected; `readings` shape validated; `ordinal()` helper in
  shared for roasts. These must carry into the real API (RFC 004).
- **Board:** the user's own per-window status lines always render, even when "not broke".
- `--dry-run` uses an ephemeral key; hooks prompt flag persists only after an answer.
- Tests 43 → 68. Audit verified clean: signature over exact bytes, O_EXCL lease (8 concurrent → 1
  submission), hook never reads stdin, no path/key leaks, install→remove byte-identical.

Open (not blocking): board layout polish (own-status lines vs. rows; plan label repetition) is a
voice/design pass for the owner + Claude Code.
