import type { Database } from "./db";

export interface ResetRecord {
  tool: "codex" | "claude-code";
  landedAt: string;
  note: string | null;
  offeringsThatCycle: number;
}

export interface MovementStats {
  devsOnRecord: number;
  offeringsTotal: number;
  offeringsThisCycle: number;
  resets: ResetRecord[];
}

/** The snowball, quantified: everything the movement narrative renders comes from here. */
export async function movementStats(database: Database): Promise<MovementStats> {
  const [devices, submissions, resets] = await Promise.all([
    database.query<{ count: string }>("select count(*) as count from devices"),
    database.query<{ count: string }>("select count(*) as count from submissions"),
    database.query<{
      tool: "codex" | "claude-code";
      landed_at: Date | string;
      note: string | null;
    }>("select tool, landed_at, note from resets order by landed_at desc limit 3"),
  ]);
  const resetRecords: ResetRecord[] = [];
  for (const row of resets.rows) {
    const landed = new Date(row.landed_at);
    const counted = await database.query<{ count: string }>(
      "select count(*) as count from submissions where received_at <= $1",
      [landed],
    );
    resetRecords.push({
      tool: row.tool,
      landedAt: landed.toISOString(),
      note: row.note,
      offeringsThatCycle: Number(counted.rows[0]?.count ?? 0),
    });
  }
  const newestReset = resetRecords[0] ? Date.parse(resetRecords[0].landedAt) : null;
  const thisCycle = newestReset
    ? await database.query<{ count: string }>(
        "select count(*) as count from submissions where received_at > $1",
        [new Date(newestReset)],
      )
    : submissions;
  return {
    devsOnRecord: Number(devices.rows[0]?.count ?? 0),
    offeringsTotal: Number(submissions.rows[0]?.count ?? 0),
    offeringsThisCycle: Number(thisCycle.rows[0]?.count ?? 0),
    resets: resetRecords,
  };
}
