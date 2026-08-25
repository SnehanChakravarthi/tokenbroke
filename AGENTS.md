# tokenbroke — AGENTS.md

Single source of truth for every coding agent in this repo (Codex CLI, Claude Code, Cursor, humans).
`CLAUDE.md` is just `@AGENTS.md`; edit **this** file only. Read it fully before doing anything.

## 1. What this is

**One-liner:** A community leaderboard of the most rate-limited AI coding tool users alive, powered by a
zero-friction CLI that reads real local usage data for Codex CLI and Claude Code. A joke on the surface;
a public observability layer for AI coding tool rate limits underneath.

**Why it exists:** OpenAI's Codex (led publicly by Tibo, @thsottiaux) runs a recurring public loop: rate
limits degrade → community complains on X → team ships fixes and grants full usage resets. Anthropic's
Claude Code has similar rate-limit pain but no reset culture. tokenbroke instruments that loop: it
aggregates real usage telemetry from the community and turns it into legible, funny, screenshot-dense
public pressure, plus a genuinely useful "what is going on with Codex / Claude Code" dashboard.

**Endgame:** the labs themselves watch the dashboard.

## 2. Non-negotiables (read twice)

1. **Everything on the board is real.** The only way data enters the system is the CLI reading local
   files on the user's machine. No screenshot uploads, no manual entry, no "paste your numbers" form.
   Do not build one, even as a debug shortcut.
2. **Never gate submission behind auth.** First run is anonymous and instant. Claiming (GitHub OAuth,
   device-code style via a printed code) is optional vanity that attaches username + avatar.
3. **The name is a constant.** `tokenbroke`, `tokenbroke.lol`, `npx tokenbroke`, `~/.tokenbroke`, and
   `tokenbroke.lol/claim/<code>` come from `packages/shared/src/brand.ts`. Never hardcode them in copy,
   paths, or URLs.
4. **Individuals can be slightly fake; the aggregate must not be.** Anti-abuse protects aggregate
   stats, not individual rows. Cheating should be high-effort, low-payoff, statistically irrelevant.
5. **Privacy:** the CLI reads only usage/rate-limit state. It never reads or uploads prompts, code, or
   conversation content, and it submits only when the user runs the command. It never opens credential
   files (`~/.codex/auth.json`, `~/.claude/.credentials.json`), prompt history, memories, backups, or
   SQLite stores, and never calls a lab API with the user's tokens. Where a state file must be opened
   whole (`~/.claude.json` contains PII), the reader extracts only allowlisted fields and discards the
   rest. All filesystem access goes through one allowlist-enforcing layer that tests can instrument.
6. **Do not invent features** beyond this file. Ask.
7. **Ask before anything expensive to reverse:** package name, DB schema shape, auth provider, public
   API shape, hosting. There is no DB schema yet; do not add one without approval. Never publish to npm
   from a session. Never commit secrets.
8. **Tone:** deadpan infrastructure parody. Casual profanity fine. Funny in copy, dead serious in data
   integrity. **Never mean-spirited toward the lab teams**; the bit is affectionate pressure.

## 3. Naming

| Thing          | Value                                 |
| -------------- | ------------------------------------- |
| Product name   | `tokenbroke`                          |
| Domain         | `tokenbroke.lol`                      |
| CLI command    | `npx tokenbroke`                      |
| Config dir     | `~/.tokenbroke`                       |
| Claim URL      | `tokenbroke.lol/claim/<code>`         |
| npm package    | `tokenbroke` (available, unpublished) |

All of the above live in `packages/shared/src/brand.ts` (`BRAND`, `claimUrl()`) and are imported
everywhere: CLI output, site copy, OG cards. Cheap insurance against a rename.

## 4. The three layers (each feeds the next)

### Layer 1 — The Leaderboard (acquisition)
- Public ranked list of the most rate-limited developers.
- **Misery score** = f(remaining usage %, time until next reset). 0% remaining with 4 days to wait is #1.
- **Single trust lane:** every entry comes from the CLI reading real local data. "Everything on this
  board is real" is the brand.

### Layer 2 — The Sensor Network (the CLI; verification; data)
- `npx tokenbroke`: one command, ~5 seconds, zero signup.
- The votive-offering ritual: an individual submission is tiny but legible and public, and it visibly
  accumulates into collective pressure.

### Layer 3 — The Watch (retention)
- Reset radar with live countdowns in the viewer's local timezone.
- Days-since-last-reset counters per lab.
- Curated feed of rate-limit-relevant posts from Tibo and other team accounts.
- Aggregate telemetry dashboards: drain velocity, median remaining %, regression detection.
- North star: the single pane of glass for "what's happening with Codex and Claude Code."

## 5. CLI behavior (60% of the engineering, 100% of the product)

### First run, zero auth
1. **Detect + read local ground truth for BOTH tools when present.**
   - Claude Code: parse JSONL session logs under `~/.claude` (the ccusage approach) to reconstruct
     usage, remaining %, and drain history.
   - Codex CLI: read locally cached rate-limit/usage state from Codex's local files.
   - Degrade gracefully: one tool missing, logs missing, or partial data is normal, not an error.
2. **Submit immediately** under an auto-generated anonymous name. Register: `starving-crab-42`,
   `tokenless-wretch-7`. The generator must produce names in that voice.
3. **Print a screenshot-worthy ASCII leaderboard** in the terminal, all on one screen:
   - the user's row highlighted, with their rank;
   - a roast line in brand voice ("You are the 14th brokest developer alive. Charity declined.");
   - the global state ("Collectively: 4,218 devs, median 9% remaining, 2 days since last reset.").
   Individual joke + collective pressure in one screenshot.
4. **Print a claim URL** (`tokenbroke.lol/claim/WXYZ-1234`).

### Identity is deferred, not upfront
- Claiming is optional: GitHub OAuth on the site using the printed code (device-code pattern like
  `gh auth login`). Claiming attaches real username + avatar to the row.
- Vanity drives conversion. Never gate submission behind auth.
- A device token in `~/.tokenbroke` persists identity across runs. Re-running the command updates your
  row. **Re-running is the ritual.** Freshness between runs comes from **opt-in hooks in the tools
  themselves** (`npx tokenbroke hooks install`: Claude Code `hooks`, Codex `notify`) because local data
  only changes when the tool runs. Never a daemon, never polling, never installed silently. `--watch`
  is dropped. (RFC 002.)
- **Plan tier** (Claude Max 5x, Codex Plus, etc.) is read from local data at submission time. It is
  non-identifying, so it is captured for every submission and shown on every row; it also makes
  "misery by plan tier" a first-class aggregate.
- **Claimed rows** show GitHub name + avatar, plan tier per tool, and current stats. The claim page
  also takes an **optional X handle**: if the board goes viral, that link is the participant's reward.
  Auth must stay the most minimal possible flow; enrichment never adds steps to the CLI.

### Non-functional requirements
- Total runtime ~5s. Zero config. Runnable via `npx` with no global install.
- Minimal dependency footprint (npx install time counts against the 5s).
- Reads only the usage/rate-limit files it needs (see non-negotiable 5).

## 6. Anti-abuse model

Design principle: make cheating high-effort, low-payoff, statistically irrelevant. Perfect verification
is impossible (no server-side source of truth), so:

- Payloads are signed by the CLI and carry internal-consistency signals: does drain history plausibly
  sum to the claimed remaining %? Do timestamps look organic?
- Server-side anomaly rejection guards the **aggregate** stats: impossible drain curves, values pinned
  at exactly 0.0%, cohorts of fresh accounts submitting identical shapes, one submission stream per
  identity.
- Claimed entries add GitHub account age as a bot filter.
- Leaderboard visually favors claimed entries (avatars pop, anonymous rows grey) without gating.
- Credibility lives in the aggregate.

## 7. Site behavior

- **Dual-tab leaderboard:** Codex and Claude Code as side-by-side universes of one platform, one
  leaderboard culture. Per-tool misery meter (median remaining %, drain velocity, dev-hours idled),
  per-tool days-since-last-reset counter, plus a combined "state of the agents" view. The asymmetry
  between the two counters is itself content.
- **Klaxon state:** when aggregate misery crosses a threshold, the site flips to "RESET CONDITIONS MET"
  and auto-composes a share tweet with real aggregate stats tagging the relevant team.
- **Reset closure loop:** when a reset lands, explicitly close the ritual: "RESET ACHIEVED. 6,412
  offerings were made this cycle." Days-since counter resets to 0. Every reset retroactively rewards
  all participants. This is the retention engine.
- **Reset radar v0:** manually operated at launch. Admin marks "reset announced, countdown to 2pm PT";
  site renders a live countdown in the viewer's local timezone + email/push "notify me" subscriptions.
  Automated X polling of ~10 watched accounts with LLM relevance classification is post-launch.
- **OG card generator:** every leaderboard position, meter state, klaxon, and counter renders as a
  clean shareable OG image. This is the distribution engine, not decoration. Every state change must
  be a pretty picture.
- **Visual direction:** the owner will supply design references before site work starts. Do not pick
  a visual direction unilaterally.
- **Footer stance:** unaffiliated parody/community tool; no lab logos as endorsement; clear disclosure
  that the CLI reads local data on-machine and submits only when the user runs the command.

## 8. Tone

Deadpan infrastructure parody. Statuspage / Downdetector visual language applied to human suffering.

- Core identity word: "tokenbroke" is a condition people self-diagnose ("I'm tokenbroke").
- Copy universe: "Are you tokenbroke? Prove it." / misery meter labeled **the Poverty Line** /
  "RESET ACHIEVED. 6,412 devs lifted out of token poverty." / factory-sign "days since last incident"
  energy.

## 9. Stack (default unless the owner overrides)

- **Web:** Next.js (App Router) on Vercel, TypeScript.
- **DB:** **Neon** Postgres with **Drizzle ORM** (decided 2026-08-23). Keep the schema portable.
  No schema exists yet.
- **CLI:** TypeScript, published as an npm package, runnable via `npx`.
- **Auth:** GitHub OAuth only.
- **OG images:** `@vercel/og` or satori.

## 10. Build order

- **Phase 1 (launch):** CLI (read both tools, anonymous submit, ASCII output, claim URL) + site
  (dual-tab leaderboard, misery meters, days-since counters, claim flow, OG cards) + manual reset radar.
- **Phase 2:** anomaly filter hardening, automatic reset detection, notify-me subscriptions.
- **Phase 3:** automated X watch feed, drain-velocity / regression dashboards, fake-points prediction
  game on next reset date (points earned only by contributing telemetry, never purchasable).

**Launch timing matters more than completeness.** This ships during a rate-limit flashpoint on X.
Phase 1 must be ruthlessly scoped.

## 11. Orchestration model (how we build)

Two frontier agents, one owner. Roles are fixed unless the owner says otherwise.

- **Claude Code (Fable 5) is the orchestrator.** It owns the plan, writes every handoff prompt,
  reconciles opinions, and reviews all implementation. Fable is expensive: any sub-agent Claude Code
  spawns runs on **Opus** (`model: "opus"`), never Fable.
- **Codex CLI (GPT-5.6) is the second brain and the default implementer for large tasks.** The owner
  relays prompts between the two by hand; Codex cannot see this conversation, so every handoff prompt
  must be self-contained.
- **Small, well-scoped tasks:** Claude Code implements directly.

### Decision loop (mandatory for architectural / core-design / core-logic work)
1. Claude Code writes `docs/rfcs/NNN-<slug>.md`: context, findings, proposed direction, alternatives,
   open questions. It also creates an **empty** `docs/rfcs/NNN-<slug>.codex.md`.
2. Claude Code gives the owner a handoff prompt naming both files. The owner pastes it into Codex.
   Codex does its own research and writes its opinion, corrections, and alternatives into the
   `.codex.md` file. It does not implement yet.
3. Claude Code reads the `.codex.md`, reconciles, and appends a **Decision** section to the RFC.
4. Implementation: Claude Code either builds it (small) or writes an implementation handoff prompt
   for Codex (large), then reviews the result against the RFC.

Handoff prompts always include: files to read first (`AGENTS.md`, the RFC), hard constraints, what
"done" looks like, and exactly where to write output. No implementation without a Decision section.

## 12. How to work here

- The owner thinks architecturally and reviews everything. Restate goals as success criteria before
  building; emit a lightweight plan for multi-step work; push back on clear problems.
- Simplest correct solution. Touch only what the task requires. No drive-by refactors. Comments
  explain why.
- Non-trivial logic: write the failing test first.
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`). Atomic commits.
- Keep section 14 ("Current status") updated at the end of every working session.

## 13. Repo conventions

### Layout
```
apps/web/          Next.js App Router site (leaderboard, claim flow, OG cards, API routes)
packages/cli/      `tokenbroke` npm package (npx entrypoint, local readers, submit, ASCII output)
packages/shared/   `@tokenbroke/shared`: brand constants + types shared by CLI payloads and web API
docs/rfcs/         design RFCs + Codex opinions (see section 11)
```
`apps/web/AGENTS.md` is a Next.js-generated note about Next 16 API changes (re-injected by `next dev`);
it is narrower in scope than this file and does not replace it.

### Tooling
- Package manager: **bun** (workspaces in root `package.json`). Node 20+ is the CLI runtime target.
- TypeScript strict everywhere; root `tsconfig.base.json` is extended by `packages/*`. `apps/web`
  keeps the Next-managed tsconfig.
- Lint/format: **Biome** at the root. Tests: **vitest** in `packages/*` (runs on Node, the CLI's real
  runtime). CLI bundles with **tsup** to a single file so `npx` startup stays fast.
- `@tokenbroke/shared` is consumed as TypeScript source (`transpilePackages` in Next, `noExternal` in
  tsup). No build step.

### Commands (root)
```
bun install            install all workspaces
bun run dev            next dev for apps/web
bun run build          build all workspaces
bun run lint           biome check
bun run format         biome format --write
bun run test           vitest across packages
bun run typecheck      tsc --noEmit across workspaces (web runs `next typegen` first)
bun run demo           build the CLI, run it once against the in-process stub server (unelided)
bun run readers        this machine's local readings as JSON (drain summarized; --full for all)
```

### Code style
- Named exports by default. Default exports only for Next.js page/layout/route files.
- Explicit return types on exported functions.

## 14. Current status / next steps

**Status (2026-08-24, PRODUCTION LIVE):** https://tokenbroke.vercel.app serves the real site
against Neon (project `tokenbroke`, personal Vercel scope, functions pinned iad1, GitHub
SnehanChakravarthi/tokenbroke private, push-to-deploy). Migrations applied; reset history seeded.
**First real offering filed** by the owner's CLI from their machine — the full pipeline
(readers → signing → API → transaction → rank → board) verified in production. Deployment gotchas
solved: project `framework` must be set explicitly (was null → global NOT_FOUND despite Ready
builds); Vercel env vars from the Neon integration are Sensitive (not pullable — local ops use
owner-pasted .env.local); protection is preview-only.

**Decided:** Neon + Drizzle. npm package `tokenbroke`. Biome + vitest + bun workspaces. Versioned API
(`/api/v1/submissions`, `schemaVersion: 1`). Ed25519 device identity, one stream per key. Hook-driven
updates via native `Stop` hooks in both tools (Codex `hooks.json`, never `notify`); no daemon, no
`--watch`. Structural window registry; misery = `hoursUntilReset × depletion³` with a 50 % floor;
three-state freshness (fresh/stale/hidden); plan tier is a facet. Names assigned server-side.

**Landing polish round (2026-08-25):** official tool marks (owner-supplied SVGs; accents
harmonized to #7a9dff / #d97757), hands as inline badge pills, well+keycap command box (concentric radii), brand lockups atop each board (Codex grotesk/white, Claude Code mono/orange, faint brand wash), continuous-rail
4-step pipeline (vertical timeline on mobile), milestone caption removed; hero paragraph v2 (what-it-is + the two hands inline as badges,
"only two hands can grant a reset"); Armstrong line sandwiches the command box; trust line replaced
by a "what does this command actually do?" popover (fade-up fills `backwards`, not `both` — a
still-applied transform animation keeps its element a stacking context forever and painted later
sections over the popover; the popover also flips above/below the trigger by available space). New `/u/<name>` profile
pages (claimed or anonymous, freshness-aware, graceful not-found); claim success now 303s to
`/u/<login>?claimed=1` (homepage `?claimed` pill and LabUniverse `highlight` removed as dead).

**Open source (2026-08-25, owner-decided):** whole monorepo MIT (LICENSE, SECURITY.md,
CONTRIBUTING.md, README "Audit it" section, license fields in all package.jsons). History scanned
clean. Owner flips repo visibility to public on GitHub; npm provenance publishing via GitHub Actions
is the follow-up once publishes move to CI. Rationale: the monetizable assets (data, community,
domain, npm name) are not in the repo; sole-author copyright keeps relicensing open.

**Standing authority (2026-08-24):** Claude Code commits at milestones without asking. Pushing,
remotes, and publishing still require an explicit owner ask.

**Next (launch sequence, owner-confirmed direction):**
1. Owner provisions: Neon project (pooled string), GitHub OAuth app, Vercel project + env
   (DATABASE_URL, GITHUB_CLIENT_ID/SECRET, CLAIM_SECRET, ADMIN_TOKEN, APP_ORIGIN), region pinning.
2. Preview deploy → run migrations → CLI E2E against the preview URL (TOKENBROKE_API_URL).
3. Claim page styling in the site's design language (flow already works: GitHub OAuth + optional X
   handle, tested against PGlite).
4. OG cards (@vercel/og) + klaxon state.
5. npm publish of `tokenbroke` (owner-triggered), domain to production, launch.
Geo (future, foundation confirmed): coarse country/city from Vercel's x-vercel-ip-* headers at the
API edge, stored as a nullable column at submission time; never from the CLI, never raw IPs. Not
retroactive — history before the column stays geo-less. Requires a footer-disclosure update when it
ships.

**Owner to-dos (noted 2026-08-25):**
- Artwork: owner will design a tokenbroke logo/icon, then it gets applied everywhere: site favicon,
  GitHub social preview, npm page, OG cards, maybe the wordmark.
- Sponsors: revisit and define what sponsorship means here — GitHub Sponsors on the owner's account
  vs. a single on-brand sponsor slot on the site. Decide post-launch; nothing ships before then.
- npm provenance: move `npm publish` to a GitHub Actions workflow with `--provenance` so the npm
  tarball is provably built from this repo (Actions are free now that the repo is public). Owner
  sets up the npm token in repo secrets when ready. The CLI README lands on npmjs.com only with the
  next publish.

**Open decisions (need owner sign-off):**
- Misery constants (floor 50, exponent 3) are launch defaults to be calibrated on real data.
