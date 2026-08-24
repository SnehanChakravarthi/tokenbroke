import type { DatabaseQuery } from "./db";
import { hmacDigest } from "./security";

function bucketStartMs(nowMs: number, durationMs: number): number {
  return Math.floor(nowMs / durationMs) * durationMs;
}

/**
 * Sliding-window admission (F8). A plain fixed window lets a caller spend the full limit at the end
 * of one window and again at the start of the next — a ~2x burst across the boundary. Instead we
 * estimate the rolling count as `current + previous * fractionOfPreviousWindowStillOverlapping` and
 * admit only when that estimate is below the limit.
 *
 * Race model: the estimate is read-then-checked, so two concurrent requests can both observe the
 * same estimate and both proceed — a small, bounded over-admission. The actual increment is a single
 * conditional write (`where count < limit`) that Postgres serializes on the current-bucket row, so
 * the current bucket can never exceed `limit`; that hard per-bucket cap is the backstop.
 */
export async function admitRateBucket(
  tx: DatabaseQuery,
  options: {
    scope: string;
    key: string;
    secret: string;
    now: Date;
    durationMs: number;
    limit: number;
  },
): Promise<boolean> {
  const keyHash = hmacDigest(options.secret, `${options.scope}\0${options.key}`);
  const nowMs = options.now.getTime();
  const currentStartMs = bucketStartMs(nowMs, options.durationMs);
  const previousStartMs = currentStartMs - options.durationMs;
  const currentStart = new Date(currentStartMs);
  const previousStart = new Date(previousStartMs);

  const existing = await tx.query<{ bucket_start: Date | string; count: number }>(
    `select bucket_start, count from rate_buckets
      where scope = $1 and key_hash = $2 and bucket_start in ($3, $4)`,
    [options.scope, keyHash, currentStart, previousStart],
  );
  let currentCount = 0;
  let previousCount = 0;
  for (const row of existing.rows) {
    if (new Date(row.bucket_start).getTime() === currentStartMs) currentCount = row.count;
    else previousCount = row.count;
  }
  // Fraction of the previous window still overlapping the trailing window ending at `now`.
  const previousWeight = 1 - (nowMs - currentStartMs) / options.durationMs;
  const weighted = currentCount + previousCount * previousWeight;
  if (weighted >= options.limit) return false;

  const result = await tx.query(
    `insert into rate_buckets (scope, key_hash, bucket_start, count)
     values ($1, $2, $3, 1)
     on conflict (scope, key_hash, bucket_start) do update
       set count = rate_buckets.count + 1
       where rate_buckets.count < $4
     returning count`,
    [options.scope, keyHash, currentStart, options.limit],
  );
  return result.rowCount === 1;
}
