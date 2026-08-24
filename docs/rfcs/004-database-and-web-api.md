# RFC 004 — Neon schema, submissions API, and the claim flow

- Status: **Decided 2026-08-24** (see §9; Codex opinion in `004-database-and-web-api.codex.md`)
- Author: Claude Code (Fable 5), 2026-08-24
- Depends on: RFC 002 §9 (contract), RFC 003 §8 (scoring/freshness). The stub server
  (`packages/cli/scripts/stub-server.ts`) is the behavioral reference the real API must match,
  including its review fixes (skew, shape validation).
- Scope: Drizzle schema on Neon; `POST /api/v1/submissions`; leaderboard read path; claim flow
  (GitHub OAuth + optional X handle); manual reset radar storage + admin write. Not in scope: site
  UI/design (owner supplies references), OG cards, notify-me, anomaly hardening (Phase 2 — but the
  schema must not preclude it).

## 1. Principles

1. **Store raw, compute from raw.** The full signed `SubmissionV1` is kept as received (JSONB).
   Every derived row can be rebuilt; Phase 2 anomaly filters must be able to re-score history.
2. **The stub is the spec.** Same validation order, same rejection reasons, same response shape —
   one E2E suite should pass against both.
3. **Scoring stays in `@tokenbroke/shared`.** SQL orders and filters; misery/freshness/classification
   run in TypeScript on read or on write, never reimplemented in SQL.
4. **Zero-dep rule applies to `shared` only.** `apps/web` may take dependencies (drizzle-orm,
   @neondatabase/serverless); validation logic it shares with the stub lives dep-free in `shared`.

## 2. Schema (Drizzle, portable Postgres)

```
accounts           id uuid pk · github_id bigint unique · github_login text · avatar_url text
                   github_created_at timestamptz · x_handle text null · created_at timestamptz

devices            id text pk (deviceId) · public_key text unique · anonymous_name text unique
                   account_id uuid null fk accounts · created_at · last_submitted_at
                   last_cli_version text · last_platform_os text · shadow_banned bool default false

submissions        id bigserial pk · device_id fk · received_at timestamptz · submitted_at timestamptz
                   trigger text · schema_version int · nonce text unique · payload jsonb (full raw)
                   -- unique(nonce) is the replay guard; rows older than 24 h are prunable but kept
                   -- in v1 (they are the raw archive; nonce uniqueness over all time is acceptable)

tool_states        device_id fk · tool text · observed_at · source_fetched_at null · plan_raw text null
                   plan_label text null · windows jsonb · misery double null · binding_series_id text null
                   registry_version int · updated_at · pk (device_id, tool)
                   -- the leaderboard table: one current row per device per tool, rewritten per submission

window_obs         device_id · tool · series_id text · observed_at timestamptz · used_percent real
                   resets_at timestamptz null · pk (device_id, series_id, observed_at)
                   -- server-side time series: one row per submission snapshot window, plus ingested
                   -- client drain samples downsampled to one per 15-minute bucket per series (Q2)

resets             id serial pk · tool text · announced_at timestamptz null · landed_at timestamptz
                   source text ("admin") · note text null
                   -- seed row: Codex reset announced 2026-08-23, landed 2026-08-24 (reset #1)

claim_codes        code text pk · device_id fk · created_at · expires_at · claimed_at null
```

Indexes: `tool_states (tool, misery desc)` partial where misery is not null;
`window_obs (tool, series_id, observed_at)`; `devices (account_id)`; `submissions (device_id, received_at)`.

## 3. Write path — `POST /api/v1/submissions`

Raw-body route (no framework JSON parsing before signature verification). Order, as in the stub:
1. Read exact bytes; verify `X-Tokenbroke-Signature` with the payload's `publicKey`; check
   `deviceIdFor(publicKey) === payload.deviceId`. → `signature`.
2. Parse; `schemaVersion === 1` → else `unsupported-version` (fail closed, nothing stored).
3. Shape-validate via a dep-free `validateSubmissionV1()` moved into `shared` (stub uses it too). → `invalid`.
4. Skew ±10 min on `submittedAt` (Number.isFinite guard). → `skew`.
5. Insert submission; `unique(nonce)` violation → `replay`.
6. Rate limit: max 20 accepted submissions per device per hour, 60 per IP per hour → `rate-limited` (Q4).
7. Upsert device (existing `deviceId` with different `public_key` → `signature`); first submission
   assigns `anonymous_name` via the shared generator with retry-on-collision.
8. Recompute `tool_states` (classify + misery via shared, stamped `registry_version`); insert
   `window_obs` snapshot rows; ingest client drain downsampled per Q2.
9. Build `SubmissionResponseV1` — rank via window function over fresh `tool_states` (freshness
   evaluated in TS after fetching candidates; see Q3), neighbors ±3, top 3, global aggregates,
   roast by rank band, claim code (issue if unclaimed and none unexpired).

Response and rejection reasons must match the stub byte-for-byte in shape.

## 4. Read path

- `GET /api/v1/leaderboard?tool=codex|claude-code&cursor=…`: ranked fresh rows (name, avatar if
  claimed, plan label, remaining %, resets_at, rank), plus per-tool aggregates and the days-since
  counter from `resets`. Public, cacheable ~30 s. The site's server components call the same query
  functions directly rather than fetching over HTTP.
- Aggregates computed per RFC 003 §8.4 in TS over fresh rows (small data at launch; revisit at scale).

## 5. Claim flow

- `/claim/<code>` page: shows the row it would claim (name, per-tool stats), a "claim with GitHub"
  button, and an optional X-handle field written **after** OAuth completes.
- **Hand-rolled GitHub OAuth** (authorize → callback with `state` cookie → exchange code → fetch
  `GET /user`) rather than next-auth: one provider, one action, no persistent session needed. The
  callback binds `accounts` row to the device, stamps `github_created_at` (bot filter), marks the
  code claimed. A short-lived signed cookie (HMAC, `CLAIM_SECRET`) carries the pending claim between
  authorize and callback. (Q5 challenges this.)
- Rules: expired/unknown code → clear error + "run the CLI again for a fresh code". Re-claiming a
  claimed device requires the same GitHub account. One account, many devices. Claim-code attempts
  rate-limited per IP (RFC 002 §9.2).

## 6. Admin (reset radar v0)

`POST /api/admin/resets` with `Authorization: Bearer $ADMIN_TOKEN` (constant-time compare): insert a
reset (tool, landed_at, announced_at?, note). No UI in v1; a curl is fine for launch.

## 7. Environment

`DATABASE_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `CLAIM_SECRET`, `ADMIN_TOKEN` — Vercel
env + `.env.local`, never committed. Drizzle migrations in `apps/web/drizzle/` via drizzle-kit;
`bun run db:generate` / `db:migrate` scripts.

## 8. Open questions for Codex

- **Q1 (schema):** critique the tables/keys/indexes above, specifically: nonce as a global unique on
  `submissions` vs a separate TTL table; `window_obs` growth (10k devices × ~700 rows/week) on Neon's
  free/launch tier; anything Phase 2 anomaly work will wish we had stored.
- **Q2 (drain ingestion):** client submissions carry ≤ 2,000 drain samples. Proposal: downsample to
  one per 15-min bucket per series on ingest (~670/week/device), `on conflict do nothing`. Right
  resolution? Should ingest be capped per submission? Is dropping client drain entirely and relying
  on server-side accumulation (one point per submission) defensible for v1?
- **Q3 (rank query):** ranking needs freshness (TS logic) before `rank()`. Proposal: fetch fresh
  candidates' misery from `tool_states` (indexed, misery desc), evaluate freshness in TS, rank in
  memory (fine ≤ ~50k rows), cache 30 s. Attack this; propose the SQL-side alternative and the
  crossover point.
- **Q4 (rate limiting):** Postgres-counter rate limiting vs in-memory per-instance vs Vercel WAF
  rules. Serverless makes in-memory weak; is a `rate_events` table with a covering index fast enough
  at launch scale?
- **Q5 (OAuth):** hand-rolled GitHub OAuth vs next-auth v5 for a single claim action. Consider CSRF,
  `state`/PKCE, token handling (we never store the GitHub token — used once, discarded), and long-term
  maintenance. Verdict with reasons.
- **Q6 (Neon driver):** `@neondatabase/serverless` HTTP driver vs pooled `pg` on Vercel Fluid
  Compute — latency for the one-request submission path, transaction semantics for steps 5–8
  (which must be atomic; where exactly does the transaction boundary sit?).
- **Q7 (critique):** anything in §3's ordering that leaks information, double-counts, or breaks under
  concurrent submissions from the same device (two hooks racing across machines is legal — same key
  copied to a second machine is one identity, last write wins on `tool_states`).

## 9. Decision

Codex's review is accepted on every substantive point. §2–§6 are superseded as follows; where this
section is silent, the draft stands.

### 9.1 Schema (replaces §2's contested parts)
- `submissions` stores **`raw_body bytea` + `signature text`** (the exact signed bytes), plus parsed
  metadata columns (`device_id, received_at, submitted_at, trigger, schema_version, cli_version,
  platform_os, nonce unique`). Immutable once accepted; not prunable in v1. No `payload jsonb`.
- **No authoritative stored `misery`.** `tool_states` keeps the full current reading (windows JSONB,
  observed/source times, plan, registry_version) — score is computed at read time with one `now`.
  The `(tool, misery desc)` index is dropped.
- `window_obs` → **`snapshot_obs`**: one row per submitted window per submission, keyed
  `(device_id, tool, series_id, observed_at)`, carrying `submission_id fk`, `source = 'snapshot'`,
  `used_percent, resets_at, window_minutes, raw_kind, scope, plan_raw, cli_version, registry_version`.
  **Client drain is NOT normalized in v1** — it lives in the signed raw bodies; Phase 2 backfills a
  partitioned drain table from them if anomaly work needs it.
- `anonymous_name` stays unique; on collision the server retries, then widens the numeric suffix
  (server-side extension of the shared generator's range). Revisit the 92k ceiling at ~50k devices.
- `claim_codes` stores a **keyed digest** (HMAC with `CLAIM_SECRET`) of the code, not plaintext;
  index `(device_id, expires_at)`.
- `devices` gains `stable_hash` (for the rank tie-break) computed once at insert.

### 9.2 Validation & write path (replaces §3)
Order: body size cap (2 MiB) → syntactic parse with bounded key extraction → **exact-byte signature
verify + `deviceIdFor` check** → `schemaVersion` → full shape validation via a new dep-free
`validateSubmissionV1()` in `shared` (bounds every string/array/number: finite percentages 0–100,
timestamp parseability, ≤ 2,000 drain samples total, seriesId consistency; **reject, never truncate**)
→ skew (finite, ±10 min). The stub is refactored to this same order and module; rejection reasons
keep RFC 002 §9.3's enum.

Then **one pooled-`pg` transaction**: create-or-lock device row (`SELECT … FOR UPDATE`; key mismatch
→ `signature`) → insert raw submission (nonce unique → `replay`) → claim `rate_buckets` via atomic
conditional upsert (device-key quota 20/h primary; coarse IP abuse goes to Vercel WAF, no 60/h IP
rule) → insert `snapshot_obs` → **monotonic per-tool upsert** of `tool_states` (only if incoming
`observedAt` is strictly newer; equal → deterministic tie on submission nonce; never regress source
time) → issue-or-reuse claim code (serialized by the device row lock) →
`last_submitted_at = greatest(existing, incoming)` → commit. A rejection at any step rolls back
everything including the raw insert and rate increments. Rank/neighbors/aggregates are computed
**after commit**.

### 9.3 Read path (replaces Q3's contested part)
Launch: SQL filters `tool_states` to `observed_at > now() − 24 h`, selects minimal fields, shared
TypeScript computes freshness + misery + order at one query-time `now`, result cached 30 s per tool.
Operational budgets for moving rank into SQL: > ~10k active rows per tool, > ~5 MB cache fill, or
> 250 ms rebuild p95 — metrics recorded from day one. The "collectively" median is defined as the
tool's **weekly (7d) ranked band** series; documented in the response contract comment.

### 9.4 Claim flow (tightens §5)
Hand-rolled GitHub OAuth stays, with: mandatory high-entropy `state` **and S256 PKCE**; **no OAuth
scopes** (public profile is enough); one HttpOnly/Secure/SameSite=Lax authenticated cookie carrying
`{state, verifier, codeDigest, deviceId, redirectUri, iat, exp}`, HMAC-signed with `CLAIM_SECRET`,
deleted on every callback outcome; the **X handle is collected on the claim page before OAuth** and
travels in that cookie; code consumption + account/device binding is one transaction; the GitHub
token is used once for `GET /user` and discarded; never log code/verifier/token/cookie.

### 9.5 Infrastructure
Pooled **`pg`** with a global Pool + Vercel `attachDatabasePool`, Neon **pooled** connection string,
function pinned to Neon's region. The HTTP driver is not used in v1. Tests run against **PGlite**
(in-process Postgres; dev-dependency of `apps/web` only) with the same Drizzle schema and
migrations; SQL stays portable. Rate limiting: `rate_buckets(scope, key_hash, bucket_start, count)`
with atomic conditional upsert inside the write transaction; claim-code attempts get per-IP and
per-code buckets on the claim routes.

### 9.6 Scope notes
- "The stub is the spec" narrows to: **shared validation module, shared response contract
  (structural, not key order), shared E2E expectations.** Concurrency, transactions, rate limiting,
  and OAuth are tested against the real API with database-level concurrency tests (two racing
  submissions, same-device claim-code race, nonce race).
- Neon provisioning and Vercel env setup are owner actions at deploy time; the implementation must be
  fully runnable and testable locally (PGlite) without any cloud account.
