# Codex opinion — RFC 004

Research-only review against RFC 002 §9–10, RFC 003 §8, the stub, the actual shared code, and current
primary documentation. Overall: keep Neon + Drizzle and the broad table split, but revise the write
transaction, history representation, ranking key, and OAuth details before adding the Decision.

## Q1 — Schema

**Verdict — REVISE. Keep the global nonce unique; change the signed archive and observation schema.**

**Evidence.**

- A separate nonce TTL table buys little. `nonce` is a random 128-bit value
  (`packages/cli/src/submit.ts:57-72`), accepted bodies must be within ±10 minutes, and submissions are
  already the archive. A global unique index is the simplest race-safe replay gate. The RFC's comment
  that archive rows are both “prunable” and kept in v1 should be removed.
- `payload jsonb` is not the “full signed submission.” RFC 002 binds the signature to exact request
  bytes (`docs/rfcs/002-submission-identity-updates.md:191-195`), while JSONB normalizes representation.
  Store `raw_body bytea` and the signature header (plus parsed/indexed metadata), or future forensic
  verification cannot reproduce the signed message. The actual verifier confirms this exact-byte
  behavior (`packages/shared/src/node/signing.ts:40-50`).
- `window_obs` needs `submission_id`, `source` (`snapshot` or `client-drain`), `tool` in its key, and the
  historical cohort fields needed by RFC 003: plan, CLI version, registry version, and structural
  window identity. Its proposed PK omits `tool`; without `submission_id`, normalized evidence cannot be
  traced back to the signed body. RFC 003 requires same-series, same-plan, established-device and
  client-version-transition controls (`docs/rfcs/003-windows-scoring-staleness.md:158-163`).
- Do not persist `misery` as an authoritative current value. It includes `hoursUntilReset`, so it
  changes continuously (`packages/shared/src/scoring/misery.ts:11-16`). A value computed on write is
  neither comparable across write times nor suitable for the proposed `(tool, misery desc)` index.
- `anonymous_name text unique` creates a hard capacity ceiling: the actual generator has only
  30 × 31 × 99 = 92,070 names (`packages/shared/src/names.ts:2-75`). Names need not be identity keys;
  either allow collisions and dedupe internally by device ID, or expand the generator in a separately
  approved contract change.
- Add `claim_codes(device_id, expires_at)` and explicit checks/FK actions. If codes remain stored in
  plaintext, treat DB read access as claim authority; storing a keyed digest is cheap defense in depth.
- The proposed 7M `window_obs` rows/week would exceed Neon's current Free-plan 0.5 GB allowance even
  before realistic index/tuple overhead (at only 100 bytes/row it is ~700 MB/week). Neon currently
  lists [0.5 GB per Free project and $0.35/GB-month on Launch](https://neon.com/pricing).

**Confidence — High.**

## Q2 — Drain ingestion

**Verdict — DEFER normalized client-drain ingestion in v1. Keep it in the signed raw body; normalize
server snapshots only.**

**Evidence.**

- Fifteen-minute samples produce ~672 points/series/week, so the RFC's own 10k-device scenario creates
  ~7M rows/week before snapshot rows. That is not launch-free-tier shaped.
- The raw accepted body already carries `drain` (`packages/shared/src/readings.ts:36-59`). Therefore v1
  can retain the evidence without duplicating it into a hot indexed table; Phase 2 can backfill a
  partitioned/retained series table from raw bodies after measuring actual anomaly needs.
- Normalize one server snapshot per submitted window, linked to `submission_id`. This is sufficient for
  current-state reconstruction and starts the cross-device reset-discontinuity history.
- Enforce a total drain-sample maximum during full shape validation and reject, rather than silently
  truncate, an over-limit signed payload. The current shared contract has only TypeScript interfaces
  (`packages/shared/src/contract/v1.ts:6-19`); the stub only proves the two-tool tuple and `windows` array
  (`packages/cli/scripts/stub-server.ts:159-174`). The claimed ≤2,000 invariant is not currently enforced.
  Preserve the stub's separate 2 MiB body cap (`packages/cli/scripts/stub-server.ts:147-154`).

**Confidence — High.**

## Q3 — Rank query

**Verdict — ACCEPT in-memory ranking only as a measured launch bridge; REJECT “indexed misery” and the
claim that fetching 50k full `windows` JSON rows is automatically fine.**

**Evidence.**

- Ranking must run with one query-time `now`: misery decays with time, freshness uses `observedAt` plus
  the query-time binding window, and ties use newer source observation then stable device hash
  (`packages/shared/src/scoring/misery.ts:25-43`, `freshness.ts:19-31`, `rank.ts:22-31`). A stored
  write-time score violates all three rows being compared at the same instant.
- Launch path: SQL-filter `observed_at > now()-24h`, select only the minimal current ranked-window
  fields, compute with shared TypeScript, sort, and cache the complete per-tool snapshot for 30 seconds.
  Do not pre-limit by stale stored misery.
- SQL alternative: normalize current ranked windows; in a CTE compute
  `max(0, resets_at-now()) hours × depletion^3`, select the binding window per device, filter freshness,
  then `row_number()` by score, observation time, a stable hash stored on `devices`, and device ID.
  Constants must be parameters/config and parity-tested against shared fixtures. This intentionally
  duplicates the formula only after scale proves the need.
- Crossover: move ranking into SQL when either active per-tool rows exceed ~10k, the minimal cache-fill
  result exceeds ~5 MB, or cache-rebuild p95 exceeds ~250 ms. Those are operational budgets, not claims
  that 10,001 rows fail; record metrics and decide from production data.

**Confidence — Medium** (the correctness issue is high confidence; the crossover is workload-dependent).

## Q4 — Rate limiting

**Verdict — USE a hybrid: Vercel WAF for coarse IP abuse and an atomic Postgres bucket for trusted
device limits. Do not use process memory or an append-only `rate_events` table at launch.**

**Evidence.**

- Fluid Compute shares an instance but still scales to additional instances, so memory is not a global
  admission authority. Vercel describes this concurrent/shared-instance model in its
  [Fluid Compute documentation](https://vercel.com/docs/fundamentals/what-is-compute).
- Vercel WAF rate limiting is available on all plans and counts by IP/JA4, but Hobby/Pro windows top out
  at 10 minutes; arbitrary header keys and one-hour windows are Enterprise-only
  ([Vercel WAF limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)). It is good
  pre-function protection, not the exact per-device 20/hour rule.
- Use a small `rate_buckets(scope, key_hash, bucket_start, count)` table. An atomic conditional upsert
  can admit only while below the limit; put device and (if retained) HMACed-IP bucket increments in the
  same transaction so a failure rolls both back. This is constant-row growth per active key/window.
- Sixty/hour per IP is likely hostile to offices/NATs. Use WAF as a much coarser cost ceiling and make
  the signed device key the primary submission quota. Claim-code attempts still need separate per-IP
  and per-code limits as RFC 002 requires (`docs/rfcs/002-submission-identity-updates.md:191-197`).

**Confidence — High.**

## Q5 — OAuth

**Verdict — KEEP the hand-rolled single-action flow, but only with state + PKCE as mandatory checks and
an explicit post-callback authorization mechanism. As written, it is incomplete.**

**Evidence.**

- GitHub strongly recommends an unguessable `state`, S256 PKCE challenge, matching `code_verifier`, and
  the same `redirect_uri`; it says to abort when states differ
  ([GitHub web OAuth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)).
  The RFC names only a state cookie and omits PKCE.
- Generate independent high-entropy `state` and verifier. Bind state, verifier, claim code/device, exact
  redirect URI, issued-at, and expiry in an HttpOnly, Secure, SameSite=Lax authenticated cookie; compare
  state exactly, delete the cookie on every callback outcome, and make claim-code consumption plus
  account/device binding one DB transaction. Validate `code` once and never log code, verifier, token,
  cookie, or GitHub response headers.
- Request no OAuth scope: GitHub documents that no scope grants read-only public profile information,
  which is enough for ID/login/avatar/account age
  ([GitHub OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)).
  Fetch `/user` server-side, validate ID/login/avatar/`created_at`, then discard the token.
- “Optional X handle written after OAuth” still needs authority despite “no persistent session.” Either
  carry the proposed X handle in the pre-OAuth authenticated claim cookie, or mint a one-use,
  short-lived post-claim capability bound to account + device and protect its POST with Origin checking.
- Auth.js v5 still installs as `next-auth@beta` in its own
  [current installation docs](https://github.com/nextauthjs/next-auth/blob/main/docs/pages/getting-started/installation.mdx),
  and the [current package manifest](https://github.com/nextauthjs/next-auth/blob/main/packages/next-auth/package.json)
  is beta.32. It would add generalized
  session/provider callbacks while custom claim-code atomicity remains ours. Its checks are valuable,
  but not enough benefit for this one-use, no-session flow to outweigh the surface area.

**Confidence — High.**

## Q6 — Neon driver and transaction boundary

**Verdict — USE pooled `pg` on Vercel Fluid Compute for v1. Steps 5–8 require an interactive,
result-dependent transaction; Neon HTTP is the wrong shape unless the whole write becomes one SQL
statement/function.**

**Evidence.**

- Neon says HTTP is fastest for one-shot, non-interactive transactions. Its HTTP `transaction()` accepts
  an array or a **non-async** function returning an array; session/interactive transactions require
  WebSockets ([Neon serverless driver docs](https://neon.com/docs/serverless/serverless-driver)). The
  proposed flow must branch on device/name creation, replay/rate admission, and conditional current-state
  updates, so it is interactive unless encoded as a database function.
- Vercel now recommends a globally initialized `pg` Pool plus `attachDatabasePool` under Fluid Compute;
  the helper manages idle connections around suspension
  ([Vercel pooling guide](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute)).
  Use Neon's pooled connection string; Neon documents that its PgBouncer endpoint is designed for
  serverless/application pools ([Neon pooling docs](https://neon.com/docs/connect/connection-pooling)).
- Transaction boundary: after byte/signature/schema/shape/skew validation, begin; upsert+lock device,
  insert nonce/raw submission, claim rate buckets, insert observations, conditionally update current
  tool states, and issue/reuse a claim code; commit. Build rank/neighbors/aggregates after commit so a
  slow leaderboard read does not extend identity/rate locks.
- Put the Vercel function in the Neon region. HTTP may remain useful later for isolated read queries,
  but two drivers are not justified before measurement.

**Confidence — High.**

## Q7 — Write ordering and concurrency

**Verdict — REWRITE §3's order. It fails first-device FK insertion, can burn rejected nonces, and lets
commit order overwrite newer source truth.**

**Evidence.**

- `submissions.device_id` is an FK, yet step 5 inserts before step 7 creates the device. That cannot work
  for a first submission without an unspecified deferred constraint.
- If steps 5–8 are not one transaction, a rate-limited request is already archived and its nonce burned;
  a retry becomes `replay`. If they are one transaction, the RFC must say rejection rolls back the raw
  insert and both rate counters.
- Two valid nonces racing at count 19 can both observe 19 without a row lock/atomic counter and admit 21.
  A unique nonce correctly chooses one winner only for the *same* nonce; it does not serialize distinct
  hook submissions.
- “Last write wins” by commit order is incorrect for one key copied to two machines. A slower request
  with older `observedAt` can regress rank/freshness. Upsert each tool independently only when incoming
  source observation is newer; use a documented deterministic tie-break for equal source times. Keep
  both raw submissions. This follows RFC 003's source-time rule
  (`docs/rfcs/003-windows-scoring-staleness.md:150-156`).
- Serialize claim-code issuance on the device row. Two transactions can otherwise both see “none
  unexpired” and create different live codes. Make `last_submitted_at = greatest(existing, incoming)`.
- The RFC and stub disagree on validation order. The stub parses, checks version, then verifies signature
  (`packages/cli/scripts/stub-server.ts:197-220`); RFC §3 says signature before parse. Parsing is necessary
  to locate `publicKey`, but an unsigned caller should not receive a version oracle. Prefer: size cap →
  syntactic parse/minimal bounded key extraction → exact-byte signature/device derivation → version →
  full shape → skew, then update the stub and shared E2E expectation together in implementation.

**Confidence — High.**

## Critique

1. “The stub is the spec” is too broad. It is a behavioral fixture, but it has no rate limiting,
   transactions, durable replay semantics, OAuth, or concurrency. Require one shared validation module
   and response contract, plus separate database concurrency tests.
2. The proposed `validateSubmissionV1()` does not exist in actual shared code. The present stub's
   validator accepts hostile nested window/drain values as long as the tuple tools and `windows` arrays
   exist. Full runtime validation must bound strings/arrays, finite percentages, timestamps, enum values,
   `seriesId` consistency, and total body/sample sizes without adding dependencies to shared.
3. “Byte-for-byte response shape” should mean the discriminated-union structure, not serialized key
   order. The actual contract is structural (`packages/shared/src/contract/v1.ts:32-75`).
4. The stub computes a “global” median for the submitting user's binding `seriesId`
   (`packages/cli/scripts/stub-server.ts:253-263`), so the metric can vary by caller. Before real API E2E
   locks that in, choose a canonical registered series/cohort per tool or make the series explicit in the
   response contract.
5. Store classification inputs/history, not only classification outputs. A new registry must be able to
   reclassify raw windows and explain which version produced any aggregate.

## What I would build instead

- **Cold truth:** `submissions(raw_body, signature, nonce unique, device_id, received_at, submitted_at,
  trigger, schema_version, cli_version, platform)`; immutable accepted rows.
- **Current read model:** one `tool_states` row per device/tool with the full current reading and source
  time, plus a small normalized current-window table. No authoritative stored misery. Conditional
  source-time upserts prevent regressions.
- **History:** snapshot observations linked to submission and carrying structural window/cohort fields.
  Keep client drain only in raw bodies for v1; backfill a retained/partitioned drain table in Phase 2.
- **Admission:** coarse Vercel WAF, transactional Postgres device/IP-code buckets, and device-row
  serialization. No in-memory correctness state.
- **Atomic write:** validate signed bytes outside the DB; inside one pooled-`pg` transaction create/lock
  device → insert raw submission/replay gate → admit rate buckets → append snapshots → monotonic per-tool
  upserts → issue/reuse claim code; commit; then compute the response from committed state.
- **Read:** shared-TypeScript ranking over minimal fresh rows behind a 30-second cache at launch, with
  metrics and a parity-tested SQL rank path ready when the measured crossover is reached.
- **Claim:** narrow GitHub OAuth with no scopes, mandatory state+S256 PKCE, one authenticated pending
  cookie, atomic code consumption, discarded access token, and a one-use capability for the post-OAuth
  X-handle write.
