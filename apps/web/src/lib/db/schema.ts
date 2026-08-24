import type { UsageWindow } from "@tokenbroke/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    githubLogin: text("github_login").notNull(),
    avatarUrl: text("avatar_url").notNull(),
    githubCreatedAt: timestamp("github_created_at", { withTimezone: true }).notNull(),
    xHandle: text("x_handle"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("accounts_github_id_unique").on(table.githubId)],
);

export const devices = pgTable(
  "devices",
  {
    id: text("id").primaryKey(),
    publicKey: text("public_key").notNull(),
    anonymousName: text("anonymous_name").notNull(),
    stableHash: bigint("stable_hash", { mode: "number" }).notNull(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    lastSubmittedAt: timestamp("last_submitted_at", { withTimezone: true }).notNull(),
    lastCliVersion: text("last_cli_version").notNull(),
    lastPlatformOs: text("last_platform_os").notNull(),
    shadowBanned: boolean("shadow_banned").notNull().default(false),
  },
  (table) => [
    uniqueIndex("devices_public_key_unique").on(table.publicKey),
    uniqueIndex("devices_anonymous_name_unique").on(table.anonymousName),
    index("devices_account_id_idx").on(table.accountId),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    trigger: text("trigger").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    cliVersion: text("cli_version").notNull(),
    platformOs: text("platform_os").notNull(),
    nonce: text("nonce").notNull(),
    rawBody: bytea("raw_body").notNull(),
    signature: text("signature").notNull(),
  },
  (table) => [
    uniqueIndex("submissions_nonce_unique").on(table.nonce),
    index("submissions_device_received_idx").on(table.deviceId, table.receivedAt),
    check(
      "submissions_trigger_check",
      sql`${table.trigger} in ('manual', 'hook:claude-code', 'hook:codex')`,
    ),
  ],
);

export const toolStates = pgTable(
  "tool_states",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id),
    tool: text("tool").notNull(),
    install: text("install").notNull(),
    observation: text("observation").notNull(),
    toolVersion: text("tool_version"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    sourceFetchedAt: timestamp("source_fetched_at", { withTimezone: true }),
    planRaw: text("plan_raw"),
    planLabel: text("plan_label"),
    windows: jsonb("windows").$type<UsageWindow[]>().notNull(),
    registryVersion: integer("registry_version").notNull(),
    stateNonce: text("state_nonce").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.tool] }),
    index("tool_states_tool_observed_idx").on(table.tool, table.observedAt),
    check("tool_states_tool_check", sql`${table.tool} in ('claude-code', 'codex')`),
  ],
);

export const snapshotObs = pgTable(
  "snapshot_obs",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id),
    tool: text("tool").notNull(),
    seriesId: text("series_id").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    submissionId: bigint("submission_id", { mode: "number" })
      .notNull()
      .references(() => submissions.id),
    source: text("source").notNull().default("snapshot"),
    usedPercent: real("used_percent").notNull(),
    resetsAt: timestamp("resets_at", { withTimezone: true }),
    windowMinutes: integer("window_minutes"),
    rawKind: text("raw_kind").notNull(),
    scope: text("scope"),
    planRaw: text("plan_raw"),
    cliVersion: text("cli_version").notNull(),
    registryVersion: integer("registry_version").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.tool, table.seriesId, table.observedAt] }),
    index("snapshot_obs_tool_series_observed_idx").on(table.tool, table.seriesId, table.observedAt),
    check("snapshot_obs_tool_check", sql`${table.tool} in ('claude-code', 'codex')`),
    check("snapshot_obs_source_check", sql`${table.source} = 'snapshot'`),
    check(
      "snapshot_obs_percentage_check",
      sql`${table.usedPercent} >= 0 and ${table.usedPercent} <= 100`,
    ),
  ],
);

export const resets = pgTable(
  "resets",
  {
    id: serial("id").primaryKey(),
    tool: text("tool").notNull(),
    announcedAt: timestamp("announced_at", { withTimezone: true }),
    landedAt: timestamp("landed_at", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("admin"),
    note: text("note"),
  },
  (table) => [
    index("resets_tool_landed_idx").on(table.tool, table.landedAt),
    check("resets_tool_check", sql`${table.tool} in ('claude-code', 'codex')`),
    check("resets_source_check", sql`${table.source} = 'admin'`),
  ],
);

export const claimCodes = pgTable(
  "claim_codes",
  {
    codeDigest: text("code_digest").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (table) => [index("claim_codes_device_expires_idx").on(table.deviceId, table.expiresAt)],
);

export const rateBuckets = pgTable(
  "rate_buckets",
  {
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.keyHash, table.bucketStart] }),
    check("rate_buckets_count_check", sql`${table.count} > 0`),
  ],
);
