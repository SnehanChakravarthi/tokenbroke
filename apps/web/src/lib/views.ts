import { createHmac } from "node:crypto";
import type { Database } from "./db";

export interface ViewStats {
  totalViews: number;
  onlineNow: number;
}

const HOUR = 60 * 60 * 1_000;
const MINUTE = 60 * 1_000;

function bucket(now: Date, sizeMs: number): Date {
  return new Date(Math.floor(now.getTime() / sizeMs) * sizeMs);
}

/**
 * Honest page telemetry, zero new tables and zero raw IPs:
 * - total views: hour buckets, incremented per render.
 * - online now: DISTINCT visitors — one row per HMAC-hashed IP per 2-minute bucket,
 *   counted distinct over the last ~4 minutes. Refreshing doesn't inflate it, and the
 *   hash is one-way with a server secret.
 */
export async function recordPageView(
  database: Database,
  ip: string | null,
  now = new Date(),
): Promise<void> {
  await database.query(
    `insert into rate_buckets (scope, key_hash, bucket_start, count)
     values ('views-hour', 'home', $1, 1)
     on conflict (scope, key_hash, bucket_start) do update set count = rate_buckets.count + 1`,
    [bucket(now, HOUR)],
  );
  const visitor = createHmac("sha256", process.env.CLAIM_SECRET ?? "dev-visitor-salt")
    .update(ip ?? "unknown")
    .digest("base64url");
  await database.query(
    `insert into rate_buckets (scope, key_hash, bucket_start, count)
     values ('online', $1, $2, 1)
     on conflict (scope, key_hash, bucket_start) do nothing`,
    [visitor, bucket(now, 2 * MINUTE)],
  );
  await database.query("delete from rate_buckets where scope = 'online' and bucket_start < $1", [
    new Date(now.getTime() - 10 * MINUTE),
  ]);
}

export async function viewStats(database: Database, now = new Date()): Promise<ViewStats> {
  const [total, online] = await Promise.all([
    database.query<{ sum: string | null }>(
      "select sum(count) as sum from rate_buckets where scope = 'views-hour'",
    ),
    database.query<{ count: string }>(
      `select count(distinct key_hash) as count from rate_buckets
        where scope = 'online' and bucket_start >= $1`,
      [new Date(now.getTime() - 4 * MINUTE)],
    ),
  ]);
  return {
    totalViews: Number(total.rows[0]?.sum ?? 0),
    onlineNow: Math.max(1, Number(online.rows[0]?.count ?? 0)),
  };
}
