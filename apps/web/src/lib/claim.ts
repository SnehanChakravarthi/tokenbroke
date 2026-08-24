import { createHash, randomBytes } from "node:crypto";
import {
  BRAND,
  type ToolId,
  type ToolReading,
  toolMisery,
  type UsageWindow,
} from "@tokenbroke/shared";
import { type Database, type DatabaseQuery, getDatabase } from "./db";
import { invalidateLeaderboardCache } from "./leaderboard";
import { admitRateBucket } from "./rate-limit";
import { claimCodeDigest, constantTimeEqual, hmacDigest } from "./security";

const COOKIE_NAME = `${BRAND.name}_claim`;
const COOKIE_LIFETIME_SECONDS = 10 * 60;
const CLAIM_ATTEMPT_WINDOW_MS = 60 * 60 * 1_000;

interface PendingClaim {
  state: string;
  verifier: string;
  codeDigest: string;
  deviceId: string;
  redirectUri: string;
  xHandle: string | null;
  iat: number;
  exp: number;
}

interface GitHubUser {
  id: number;
  login: string;
  avatarUrl: string;
  createdAt: Date;
}

interface ClaimCodeRow {
  device_id: string;
  anonymous_name: string;
  expires_at: Date | string;
}

export interface ClaimPreview {
  anonymousName: string;
  expiresAt: string;
  tools: Array<{ tool: ToolId; remainingPercent: number | null }>;
}

function cookieHeader(value: string, maxAge: number): string {
  return `${COOKIE_NAME}=${value}; Path=/api/claim/callback; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function responseWithDeletedCookie(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "set-cookie": cookieHeader("", 0),
    },
  });
}

function pendingCookie(pending: PendingClaim, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(pending)).toString("base64url");
  return `${encoded}.${hmacDigest(secret, `pending-claim\0${encoded}`)}`;
}

function parsePendingCookie(value: string | null, secret: string, now: Date): PendingClaim | null {
  if (!value || value.length > 4_096) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  if (!constantTimeEqual(signature, hmacDigest(secret, `pending-claim\0${encoded}`))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const valueAt = (key: keyof PendingClaim): unknown =>
    Object.getOwnPropertyDescriptor(parsed, key)?.value;
  const xHandle = valueAt("xHandle");
  const pending = parsed as PendingClaim;
  if (
    typeof valueAt("state") !== "string" ||
    pending.state.length < 32 ||
    pending.state.length > 128 ||
    typeof valueAt("verifier") !== "string" ||
    pending.verifier.length < 43 ||
    pending.verifier.length > 128 ||
    typeof valueAt("codeDigest") !== "string" ||
    pending.codeDigest.length > 128 ||
    typeof valueAt("deviceId") !== "string" ||
    pending.deviceId.length > 64 ||
    typeof valueAt("redirectUri") !== "string" ||
    pending.redirectUri.length > 2_048 ||
    !(xHandle === null || (typeof xHandle === "string" && xHandle.length <= 15)) ||
    typeof valueAt("iat") !== "number" ||
    !Number.isFinite(pending.iat) ||
    typeof valueAt("exp") !== "number" ||
    !Number.isFinite(pending.exp) ||
    pending.iat > now.getTime() + 60_000 ||
    pending.exp < now.getTime() ||
    pending.exp - pending.iat > COOKIE_LIFETIME_SECONDS * 1_000
  ) {
    return null;
  }
  return pending;
}

function requestCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return null;
}

/**
 * The origin used to build OAuth redirect URIs and to verify same-origin on claim start. Prefer
 * the configured APP_ORIGIN so an attacker-controlled Host header cannot steer the redirect_uri or
 * satisfy the same-origin check (F10). Falls back to the request origin only when APP_ORIGIN is
 * unset, which must never happen in production.
 */
function configuredOrigin(request: Request): string {
  const appOrigin = process.env.APP_ORIGIN?.replace(/\/+$/, "");
  if (appOrigin) return appOrigin;
  return new URL(request.url).origin;
}

/**
 * A cross-site auto-submitting form cannot set a matching Origin header, and browsers stamp
 * `sec-fetch-site: same-origin` only on genuinely same-origin requests; neither is forgeable
 * cross-site. Accept when either proves same-origin (F1).
 */
function sameOriginRequest(request: Request, origin: string): boolean {
  const originHeader = request.headers.get("origin");
  if (originHeader && originHeader === origin) return true;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

interface ClaimFormToken {
  codeDigest: string;
  iat: number;
  exp: number;
}

/**
 * Mint a signed, short-lived form token bound to a specific claim code, embedded as a hidden field
 * on the /claim/[code] page. Stateless (HMAC over CLAIM_SECRET + short exp) rather than truly
 * single-use — there is no server store — but combined with the same-origin check it defeats the
 * cross-site OAuth-binding attack (F1): an attacker cannot obtain a valid token for the victim's
 * code, and cannot forge one without the secret.
 */
export function mintClaimFormToken(code: string, secret: string, now: Date): string {
  const token: ClaimFormToken = {
    codeDigest: claimCodeDigest(code, secret),
    iat: now.getTime(),
    exp: now.getTime() + COOKIE_LIFETIME_SECONDS * 1_000,
  };
  const encoded = Buffer.from(JSON.stringify(token)).toString("base64url");
  return `${encoded}.${hmacDigest(secret, `claim-form\0${encoded}`)}`;
}

function verifyClaimFormToken(
  value: FormDataEntryValue | null,
  codeDigest: string,
  secret: string,
  now: Date,
): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return false;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra !== undefined) return false;
  if (!constantTimeEqual(signature, hmacDigest(secret, `claim-form\0${encoded}`))) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  const at = (key: keyof ClaimFormToken): unknown =>
    Object.getOwnPropertyDescriptor(parsed, key)?.value;
  const tokenDigest = at("codeDigest");
  const iat = at("iat");
  const exp = at("exp");
  return (
    typeof tokenDigest === "string" &&
    typeof iat === "number" &&
    Number.isFinite(iat) &&
    typeof exp === "number" &&
    Number.isFinite(exp) &&
    constantTimeEqual(tokenDigest, codeDigest) &&
    iat <= now.getTime() + 60_000 &&
    exp >= now.getTime() &&
    exp - iat <= COOKIE_LIFETIME_SECONDS * 1_000
  );
}

export function claimIp(headers: Pick<Headers, "get">): string {
  // x-vercel-forwarded-for is set by Vercel's edge to the real client IP and cannot be forged by
  // the client; its leftmost entry is the true client (F6).
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel && vercel.length <= 128) return vercel;
  // A raw x-forwarded-for is client-appendable on the LEFT: a spoofer prepends decoy IPs. The
  // trusted proxy appends the real peer as the LAST (rightmost) hop, so take that, never the
  // leftmost, otherwise every request could mint a fresh per-IP rate bucket.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    const last = hops[hops.length - 1];
    if (last && last.length <= 128) return last;
  }
  const fallback = headers.get("x-real-ip")?.trim();
  return fallback && fallback.length <= 128 ? fallback : "unknown";
}

function normalizeXHandle(value: FormDataEntryValue | null): string | null | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/^@/, "");
  if (normalized.length === 0) return null;
  return /^[A-Za-z0-9_]{1,15}$/.test(normalized) ? normalized : undefined;
}

async function claimAttempts(
  database: Database,
  ip: string,
  codeDigest: string | null,
  secret: string,
  now: Date,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const ipAllowed = await admitRateBucket(tx, {
      scope: "claim-ip",
      key: ip,
      secret,
      now,
      durationMs: CLAIM_ATTEMPT_WINDOW_MS,
      limit: 30,
    });
    const codeAllowed = codeDigest
      ? await admitRateBucket(tx, {
          scope: "claim-code",
          key: codeDigest,
          secret,
          now,
          durationMs: CLAIM_ATTEMPT_WINDOW_MS,
          limit: 10,
        })
      : true;
    return ipAllowed && codeAllowed;
  });
}

async function activeClaim(
  database: Database,
  digest: string,
  now: Date,
): Promise<ClaimCodeRow | null> {
  const result = await database.query<ClaimCodeRow>(
    `select cc.device_id, d.anonymous_name, cc.expires_at
       from claim_codes cc join devices d on d.id = cc.device_id
      where cc.code_digest = $1 and cc.claimed_at is null and cc.expires_at > $2`,
    [digest, now],
  );
  return result.rows[0] ?? null;
}

export async function getClaimPreview(
  code: string,
  options: { database?: Database; now?: Date; secret?: string; ip?: string } = {},
): Promise<ClaimPreview | null> {
  const secret = options.secret ?? process.env.CLAIM_SECRET;
  if (!secret || code.length > 32) return null;
  const database = options.database ?? getDatabase();
  const now = options.now ?? new Date();
  const digest = claimCodeDigest(code, secret);
  if (
    options.ip !== undefined &&
    !(await claimAttempts(database, options.ip, digest, secret, now))
  ) {
    return null;
  }
  const claim = await activeClaim(database, digest, now);
  if (!claim) return null;
  const states = await database.query<{
    tool: ToolId;
    observed_at: Date | string;
    source_fetched_at: Date | string | null;
    plan_raw: string | null;
    plan_label: string | null;
    windows: UsageWindow[];
  }>(
    `select tool, observed_at, source_fetched_at, plan_raw, plan_label, windows
       from tool_states where device_id = $1 order by tool`,
    [claim.device_id],
  );
  return {
    anonymousName: claim.anonymous_name,
    expiresAt: new Date(claim.expires_at).toISOString(),
    tools: states.rows.map((row) => {
      const reading: ToolReading = {
        tool: row.tool,
        install: "found",
        observation: "ok",
        toolVersion: null,
        plan: { raw: row.plan_raw, label: row.plan_label },
        observedAt: new Date(row.observed_at).toISOString(),
        sourceFetchedAt: row.source_fetched_at
          ? new Date(row.source_fetched_at).toISOString()
          : null,
        windows: row.windows,
        drain: [],
        evidence: null,
        warnings: [],
      };
      const binding = toolMisery(reading, now).bindingWindow;
      return { tool: row.tool, remainingPercent: binding ? 100 - binding.usedPercent : null };
    }),
  };
}

export async function handleClaimStart(
  request: Request,
  options: { database?: Database; now?: Date; secret?: string } = {},
): Promise<Response> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 16_384)
    return new Response("Invalid claim", { status: 400 });
  const secret = options.secret ?? process.env.CLAIM_SECRET;
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!secret || !clientId) return new Response("Claim service unavailable", { status: 503 });
  // Reject cross-site starts before touching the DB: a CSRF form that auto-submits into OAuth could
  // otherwise bind a logged-in victim's GitHub account to the attacker's device (F1).
  const origin = configuredOrigin(request);
  if (!sameOriginRequest(request, origin)) {
    return new Response("Cross-origin claim rejected", { status: 403 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Invalid claim", { status: 400 });
  }
  const code = form.get("code");
  const xHandle = normalizeXHandle(form.get("xHandle"));
  if (typeof code !== "string" || code.length === 0 || code.length > 32 || xHandle === undefined) {
    return new Response("Invalid claim", { status: 400 });
  }
  const database = options.database ?? getDatabase();
  const now = options.now ?? new Date();
  const codeDigest = claimCodeDigest(code, secret);
  // The page minted a signed token bound to this code; without it (or with a forged/expired one)
  // there is no proof the request originated from our own claim page (F1).
  if (!verifyClaimFormToken(form.get("formToken"), codeDigest, secret, now)) {
    return new Response("Invalid claim token", { status: 403 });
  }
  if (!(await claimAttempts(database, claimIp(request.headers), codeDigest, secret, now))) {
    return new Response("Too many claim attempts", { status: 429 });
  }
  const claim = await activeClaim(database, codeDigest, now);
  if (!claim) return new Response("Claim code unavailable", { status: 404 });
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const redirectUri = new URL("/api/claim/callback", origin).toString();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const pending: PendingClaim = {
    state,
    verifier,
    codeDigest,
    deviceId: claim.device_id,
    redirectUri,
    xHandle,
    iat: now.getTime(),
    exp: now.getTime() + COOKIE_LIFETIME_SECONDS * 1_000,
  };
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      "set-cookie": cookieHeader(pendingCookie(pending, secret), COOKIE_LIFETIME_SECONDS),
    },
  });
}

function githubUser(value: unknown): GitHubUser | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const field = (key: string): unknown => Object.getOwnPropertyDescriptor(value, key)?.value;
  const id = field("id");
  const login = field("login");
  const avatarUrl = field("avatar_url");
  const createdAt = field("created_at");
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof login !== "string" ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login) ||
    typeof avatarUrl !== "string" ||
    avatarUrl.length > 2_048 ||
    !avatarUrl.startsWith("https://") ||
    typeof createdAt !== "string" ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return null;
  }
  return { id, login, avatarUrl, createdAt: new Date(createdAt) };
}

async function exchangeGitHub(
  code: string,
  pending: PendingClaim,
  fetchImpl: typeof fetch,
): Promise<GitHubUser | null> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const exchange = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
    }),
  });
  if (!exchange.ok) return null;
  const exchanged = (await exchange.json()) as unknown;
  const token =
    typeof exchanged === "object" && exchanged !== null
      ? Object.getOwnPropertyDescriptor(exchanged, "access_token")?.value
      : undefined;
  if (typeof token !== "string" || token.length === 0 || token.length > 1_024) return null;
  const profile = await fetchImpl("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": BRAND.name,
      "x-github-api-version": "2022-11-28",
    },
  });
  return profile.ok ? githubUser((await profile.json()) as unknown) : null;
}

async function bindClaim(
  database: Database,
  pending: PendingClaim,
  user: GitHubUser,
  now: Date,
): Promise<boolean> {
  class ClaimBindRejection extends Error {}
  try {
    return await database.transaction(async (tx: DatabaseQuery) => {
      // Canonical lock order (F3): devices -> claim_codes -> rate_buckets. Lock the device row
      // FIRST, then claim_codes, matching acceptedTransaction (submissions.ts); locking claim_codes
      // before devices here would invert against that path and could deadlock under real Postgres.
      const device = await tx.query<{ account_id: string | null }>(
        "select account_id from devices where id = $1 for update",
        [pending.deviceId],
      );
      const existingAccountId = device.rows[0]?.account_id;
      if (existingAccountId === undefined) throw new ClaimBindRejection();
      const claim = await tx.query<{
        device_id: string;
        expires_at: Date | string;
        claimed_at: Date | string | null;
      }>(
        `select device_id, expires_at, claimed_at from claim_codes
        where code_digest = $1 and device_id = $2 for update`,
        [pending.codeDigest, pending.deviceId],
      );
      const claimRow = claim.rows[0];
      if (
        !claimRow ||
        claimRow.claimed_at !== null ||
        new Date(claimRow.expires_at).getTime() <= now.getTime()
      ) {
        throw new ClaimBindRejection();
      }
      const account = await tx.query<{ id: string }>(
        `insert into accounts
         (github_id, github_login, avatar_url, github_created_at, x_handle)
       values ($1, $2, $3, $4, $5)
       on conflict (github_id) do update set
         github_login = excluded.github_login,
         avatar_url = excluded.avatar_url,
         github_created_at = excluded.github_created_at,
         x_handle = coalesce(excluded.x_handle, accounts.x_handle)
       returning id`,
        [user.id, user.login, user.avatarUrl, user.createdAt, pending.xHandle],
      );
      const accountId = account.rows[0]?.id;
      if (!accountId) throw new ClaimBindRejection();
      if (existingAccountId !== null && existingAccountId !== accountId) {
        throw new ClaimBindRejection();
      }
      await tx.query("update devices set account_id = $2 where id = $1", [
        pending.deviceId,
        accountId,
      ]);
      const consumed = await tx.query(
        `update claim_codes set claimed_at = $2
          where code_digest = $1 and claimed_at is null returning code_digest`,
        [pending.codeDigest, now],
      );
      if (consumed.rowCount !== 1) throw new ClaimBindRejection();
      return true;
    });
  } catch (error) {
    if (error instanceof ClaimBindRejection) return false;
    throw error;
  }
}

async function runClaimCallback(
  request: Request,
  secret: string,
  options: { database?: Database; now?: Date; fetchImpl?: typeof fetch },
): Promise<Response> {
  const now = options.now ?? new Date();
  const pending = parsePendingCookie(requestCookie(request), secret, now);
  const database = options.database ?? getDatabase();
  if (
    !(await claimAttempts(
      database,
      claimIp(request.headers),
      pending?.codeDigest ?? null,
      secret,
      now,
    ))
  ) {
    return responseWithDeletedCookie("Too many claim attempts", 429);
  }
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const expectedRedirect = new URL("/api/claim/callback", configuredOrigin(request)).toString();
  if (
    !pending ||
    !state ||
    !constantTimeEqual(state, pending.state) ||
    pending.redirectUri !== expectedRedirect ||
    !code ||
    code.length > 1_024
  ) {
    return responseWithDeletedCookie("Claim rejected", 400);
  }
  const active = await activeClaim(database, pending.codeDigest, now);
  if (!active || active.device_id !== pending.deviceId) {
    return responseWithDeletedCookie("Claim rejected", 400);
  }
  let user: GitHubUser | null;
  try {
    user = await exchangeGitHub(code, pending, options.fetchImpl ?? fetch);
  } catch {
    user = null;
  }
  if (!user) return responseWithDeletedCookie("GitHub authorization failed", 400);
  const bound = await bindClaim(database, pending, user, now);
  if (bound) invalidateLeaderboardCache();
  return bound
    ? responseWithDeletedCookie(
        "<!doctype html><h1>Claim complete</h1><p>Your row is yours.</p>",
        200,
      )
    : responseWithDeletedCookie("Claim rejected", 400);
}

export async function handleClaimCallback(
  request: Request,
  options: { database?: Database; now?: Date; secret?: string; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const secret = options.secret ?? process.env.CLAIM_SECRET;
  if (!secret) return responseWithDeletedCookie("Claim service unavailable", 503);
  // The pending cookie is a one-time secret; it MUST be cleared on every outcome, including an
  // unexpected throw (e.g. a DB fault inside bindClaim), so a failed attempt never leaves a live
  // cookie a retry or an attacker could reuse (F7).
  try {
    return await runClaimCallback(request, secret, options);
  } catch {
    return responseWithDeletedCookie("Claim failed", 500);
  }
}
