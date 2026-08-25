# tokenbroke

**Are you tokenbroke? Prove it.**

```bash
npx tokenbroke
```

Five seconds. No signup. It reads the usage / rate-limit state your AI coding tools already keep on
your machine, files it — signed, under a name like `starving-crab-42` — and prints your rank among
the most rate-limited developers alive, plus the state of the nation.

The board: **[tokenbroke.lol](https://tokenbroke.lol)**

## Before you run a stranger's CLI (good instinct)

This package is MIT open source: [github.com/SnehanChakravarthi/tokenbroke](https://github.com/SnehanChakravarthi/tokenbroke)

- Every filesystem access goes through one allowlist-enforcing layer
  ([`src/readers/access.ts`](https://github.com/SnehanChakravarthi/tokenbroke/blob/main/packages/cli/src/readers/access.ts)).
  Paths not on the allowlist cannot be opened; symlinks and hardlinks are rejected before reading.
- It never reads your code, prompts, conversations, or credentials. Credential files
  (`~/.codex/auth.json`, `~/.claude/.credentials.json`) are never opened. Where a mixed file must be
  read (`~/.claude.json`), only allowlisted usage fields are extracted; the rest is discarded.
- **Zero runtime dependencies.** What you installed is one bundled file — read it right here in the
  tarball (`dist/index.js`), it's the exact code `npx` executes.
- It submits only when you run it. The keep-fresh hook is opt-in (the CLI asks first);
  uninstalling it is deleting two lines from your tool's config.

## What it does

1. Detects Claude Code and/or Codex CLI and reads their local usage / rate-limit state. One tool
   missing or partial data is normal, not an error.
2. Submits one signed snapshot. Re-running updates your row — re-running is the ritual.
3. Prints the receipt: your rank, your roast, the collective misery, and a claim URL. Claiming
   (GitHub OAuth, optional) puts your name and face on your row. You never have to.

## Stance

tokenbroke is an unaffiliated parody and community tool — not endorsed by, associated with, or
speaking for OpenAI or Anthropic. The bit is affectionate. The data is serious.
