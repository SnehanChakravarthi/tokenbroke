# Codex opinion on RFC 002: submission, identity, and updates

Research date: 2026-08-23. Codex source citations are pinned to commit
[`c9b19deb09c1841ce7acc33ddb96276030936a29`](https://github.com/openai/codex/tree/c9b19deb09c1841ce7acc33ddb96276030936a29).
Local configuration was inspected by key presence only: `~/.claude/settings.json` currently has no
`hooks` key; `~/.codex/config.toml` currently has both a top-level `notify` key and a `hooks` section.
No values were read.

## Q1 — Claude Code hook contract

**Verdict:** The RFC's nested event → matcher group → handler-array shape is current, but use Claude's
native `async: true` for `Stop`; do not assume `SessionEnd` is a crash-safe delivery mechanism.

**Evidence:** Claude's user-level configuration is `~/.claude/settings.json`. Relevant configuration
has this shape:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "...", "timeout": 10, "async": true }
        ]
      }
    ]
  }
}
```

An omitted/empty matcher matches every occurrence; matching handlers coexist rather than replacing
one another. `timeout` is in seconds. `async` is supported for command hooks and lets Claude continue
without waiting, but each event starts a separate background process and Claude does not deduplicate
them. In print mode, an async process can be killed when the session tears down, so work that must
outlive the process needs to detach itself. See Claude's [configuration schema](https://code.claude.com/docs/en/hooks#configuration),
[handler fields](https://code.claude.com/docs/en/hooks#hook-handler-fields), and
[async-hook semantics](https://code.claude.com/docs/en/hooks#run-hooks-in-the-background).

The documented event keys currently are `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
`PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`,
`SubagentStop`, `Stop`, `StopFailure`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`,
`WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `SessionEnd`, `Elicitation`, and
`ElicitationResult`. Only `Stop`, optional `StopFailure`, and `SessionEnd` are relevant here.

For synchronous hooks, exit 0 succeeds; exit 2 is a blocking error on events that permit blocking;
other nonzero exits and timeouts are non-blocking errors. `SessionEnd` cannot block shutdown and has a
small default execution budget. `Stop` runs when Claude finishes a response, not on user interruption;
API failures have a separate `StopFailure` event. `SessionEnd` documents normal reasons such as
`clear`, `logout`, and prompt-input exit, but makes no crash/SIGKILL guarantee. Therefore crash/kill
delivery is **unverified and must not be relied upon**. See [Stop](https://code.claude.com/docs/en/hooks#stop)
and [SessionEnd](https://code.claude.com/docs/en/hooks#sessionend).

The tokenbroke handler should always exit 0 and write nothing to stdout/stderr. It must ignore hook
input fields and never follow transcript/session paths.

**Confidence:** high on documented schema/failure behavior; medium on crash behavior because the
correct conclusion is absence of a guarantee, not proof that every abrupt exit misses the event.

## Q2 — Codex `notify` and current hooks

**Verdict:** Do not replace or chain `notify`. Codex now has a stable, default-enabled multi-hook
system. Add an independent `Stop` command hook and preserve the user's existing `notify` byte-for-byte.

**Evidence:** At the pinned commit, legacy `notify` is still one `array<string>` argv. Codex appends a
single JSON argument and spawns it after an agent turn. Its payload contains `type:
agent-turn-complete`, thread/turn IDs, cwd, client, input messages, and the last assistant message; it
does not wait for the child. See [`legacy_notify.rs`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/hooks/src/legacy_notify.rs).
An existing value therefore means “the user's one legacy command,” not a list tokenbroke may append to.
Chaining would inherit quoting, failure, privacy, and lifecycle obligations for a command we do not own.

The same commit defines arrays of matcher groups and handlers for `Stop`, `SessionEnd`, and other
events in [`hook_config.rs`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/config/src/hook_config.rs),
keeps legacy notify alongside the new registry in [`registry.rs`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/hooks/src/registry.rs),
and marks the `hooks` feature stable and enabled by default in [`features/src/lib.rs`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/features/src/lib.rs#L1047-L1052).
Codex merges matching hooks from user/project `hooks.json` and inline TOML, then runs matching command
hooks concurrently. User hooks require review/trust through `/hooks`; `async: true` is available.
See the current [Codex hook discovery and trust contract](https://developers.openai.com/codex/hooks/#where-codex-looks-for-hooks)
and [command-hook fields](https://developers.openai.com/codex/hooks/#command-hook-fields).

Install into the supported multi-hook surface (prefer `~/.codex/hooks.json` for lossless ownership),
then explicitly tell the user to approve it with `/hooks`. `tokenbroke hooks status` must distinguish
“installed” from “trusted/active.” The local key-only finding—both `notify` and hooks already exist—is a
real regression case for the installer.

**Confidence:** high.

## Q3 — Event choice

**Verdict:** Use `Stop` plus a five-minute, cross-process debounce for both tools. `SessionEnd` may be a
best-effort fallback, but it is not the primary freshness event.

**Evidence:** Usage changes after model responses, while a session can remain open for hours.
Claude documents `Stop` as once per completed response and `SessionEnd` as once at teardown
([hook event cadence](https://code.claude.com/docs/en/hooks#hook-events)). Codex likewise fires
[`Stop`](https://developers.openai.com/codex/hooks/#stop) after the main agent turn, whereas
[`SessionEnd`](https://developers.openai.com/codex/hooks/#sessionend) can be delayed until close,
archive/delete, or roughly 30 minutes idle. Session-end-only updates therefore create systematic stale
data and still do not cover hard kills.

Dozens of `Stop` events are acceptable only if the cheap path is actually cheap: acquire an atomic
lock and check the last-attempt time before loading readers or spawning another worker. Five minutes
caps one device at 12 submission attempts/hour and coalesces simultaneous Claude/Codex events. After
the time gate, hash the allowlisted reading and skip unchanged data. Native async prevents UI latency;
the hook must never block a turn.

**Confidence:** high.

## Q4 — Device identity

**Verdict:** Keep Ed25519. A server-issued bearer token is simpler but does not improve the stated
threat model; it merely moves device creation behind a successful first response.

**Evidence:** A signature proves continuity/control of one device identity without sending a reusable
secret. A stolen private key and a stolen bearer token both permit row hijacking. Neither prevents one
person from generating many identities, and neither makes readings truthful. Replay protection comes
from the timestamp plus a server-stored nonce, not from the choice between keys and tokens. Node 20
supports Ed25519 key generation and signing in its standard crypto API
([`generateKeyPairSync`](https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptogeneratekeypairsynctype-options)).

Tighten the wire contract before implementation:

- Specify encodings, for example PKCS#8 DER private key plus SPKI DER public key, rather than only
  saying “32-byte public key.”
- Sign the exact HTTP body bytes sent. The server should verify those bytes, not parse and independently
  re-canonicalize JSON. Deterministic serialization is still useful for tests.
- Define one mutable submission stream **per device key**. A claimed GitHub account may intentionally
  own several device streams, so “one identity, one stream” is otherwise false.
- A 16-byte SHA-256 truncation gives a 128-bit identifier, sufficient here; rate-limit claim-code
  attempts because the shorter human code is the easier online target.

**Confidence:** high.

## Q5 — Windows hook execution and permissions

**Verdict:** Do not invoke bare `node`, do not use `~` in installed commands, and do not describe mode
`0600` as a Windows security boundary.

**Evidence:** Persist absolute paths captured at install time: `process.execPath` is the absolute path
of the running Node executable ([Node process docs](https://nodejs.org/docs/latest-v20.x/api/process.html#processexecpath)).
Use the absolute hook-script path too. Claude's current command hook supports a direct-spawn `args`
array, avoiding shell quoting; Codex provides `commandWindows` for a platform-specific command
([Codex command fields](https://developers.openai.com/codex/hooks/#command-hook-fields)). Quote with a
tested Windows argv routine rather than POSIX escaping.

On Windows, Node only meaningfully manipulates the write bit; owner/group/other mode distinctions are
not implemented ([Node file-mode caveat](https://nodejs.org/docs/latest-v20.x/api/fs.html#file-modes)).
Create identity files atomically under the user's profile and rely on inherited per-user ACLs; treat
`chmod 0600` as best effort on POSIX. `hooks status` should detect a removed Node binary (common after
runtime-manager upgrades) and offer reinstall.

**Confidence:** high.

## Q6 — Request/response, debounce, consent, and dry run

**Verdict:** Keep one request and the five-minute debounce. Add top-three rows, make rejection a real
discriminated response, strengthen consent around hook activation, and change `--dry-run` so it never
prints a fabricated server result.

**Evidence:** Under [RFC 002's response contract](./002-submission-identity-updates.md#42-response),
neighbors provide local rank context but not the screenshot's global stakes. Return
top three per tool in the same response, deduplicated against neighbors/self; this is a small bounded
payload and no extra round trip. `accepted: false` cannot honestly satisfy today's required
`identity`, `perTool`, and `global` success fields, so define success and error variants. An unsupported
schema version should fail closed before persistence.

Consent should name the tools actually detected, state the maximum cadence, state that Codex will ask
for `/hooks` trust, and say the handler reads only RFC 001's allowlisted usage state. Install only after
a successful manual submission. Preserve other hook entries with an atomic, conflict-aware merge.

Under [RFC 002's CLI contract](./002-submission-identity-updates.md#6-cli-interface-and-output),
`--dry-run` should run readers and show the exact redacted outbound payload plus “network skipped.” A
fake leaderboard response conflicts with the product's “everything on the board is real” language and
is too easy to mistake for evidence. Keep canned responses in tests or an explicitly named internal
demo fixture, not the public dry-run contract.

**Confidence:** high.

## Critique

The core architecture—one signed snapshot request, deferred claiming, explicit hook consent, and
bounded local state—is sound. The largest defect is that its Codex hook research is already stale:
legacy `notify` chaining is both unnecessary and dangerous. The next largest risks are operational:
non-atomic concurrent hook runs, lossy edits to user configuration, treating installation as equivalent
to Codex trust, and a response type that cannot represent rejection without placeholder data.

The privacy boundary should be stated at the hook boundary too. Both hook systems can supply prompt,
assistant, cwd, and transcript metadata; tokenbroke must ignore the event payload and invoke only the
allowlist-enforced RFC 001 readers. Logs should be size-capped and avoid dumping hook input or response
bodies.

## What I would build instead

1. Install a native async `Stop` hook into Claude's existing event array and a separate native async
   Codex `Stop` hook in `~/.codex/hooks.json`; never touch Codex `notify`.
2. Make the hook entry a tiny coordinator: atomic five-minute lease, then invoke the copied CLI by
   absolute Node/script paths. The CLI re-reads through RFC 001, hashes, and submits only if changed.
3. Treat Codex trust as a separate installer state and guide the user through `/hooks`.
4. Return a discriminated success/error response with self + neighbors + deduplicated top three.
5. Make public `--dry-run` evidence-only: local readings, redacted request bytes, no network, no fake
   leaderboard.
