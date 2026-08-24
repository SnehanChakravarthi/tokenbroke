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

/** Honest page telemetry with zero new tables: hour buckets for totals, minute buckets for "online". */
export async function recordPageView(database: Database, now = new Date()): Promise<void> {
  for (const [scope, size] of [
    ["views-hour", HOUR],
    ["views-minute", MINUTE],
  ] as const) {
    await database.query(
      `insert into rate_buckets (scope, key_hash, bucket_start, count)
       values ($1, 'home', $2, 1)
       on conflict (scope, key_hash, bucket_start) do update set count = rate_buckets.count + 1`,
      [scope, bucket(now, size)],
    );
  }
  // Opportunistic prune: minute buckets are only needed for the last few minutes.
  await database.query(
    "delete from rate_buckets where scope = 'views-minute' and bucket_start < $1",
    [new Date(now.getTime() - 10 * MINUTE)],
  );
}

export async function viewStats(database: Database, now = new Date()): Promise<ViewStats> {
  const [total, online] = await Promise.all([
    database.query<{ sum: string | null }>(
      "select sum(count) as sum from rate_buckets where scope = 'views-hour'",
    ),
    database.query<{ sum: string | null }>(
      "select sum(count) as sum from rate_buckets where scope = 'views-minute' and bucket_start >= $1",
      [new Date(now.getTime() - 3 * MINUTE)],
    ),
  ]);
  return {
    totalViews: Number(total.rows[0]?.sum ?? 0),
    onlineNow: Math.max(1, Number(online.rows[0]?.sum ?? 0)),
  };
}
