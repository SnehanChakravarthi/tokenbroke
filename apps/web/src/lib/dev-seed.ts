import { generateAnonymousName, seriesId, stableDeviceHash } from "@tokenbroke/shared";
import type { Database } from "./db";

/** Deterministic rng so the dev board is stable across reloads. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FICTIONAL_LOGINS = [
  "mika-ships",
  "gradient-jockey",
  "yak-shaver-prime",
  "ninetofiver",
  "reindert",
  "sofia-builds",
  "tab-hoarder",
  "prod-on-friday",
  "kelp-farmer",
  "artisanal-json",
  "vibe-compiler",
  "greppetto",
];

interface SeedWindow {
  rawKind: string;
  windowMinutes: number;
  scope: string | null;
  usedPercent: number;
  resetsAt: Date;
  group: string | null;
}

function windowJson(tool: "claude-code" | "codex", w: SeedWindow): Record<string, unknown> {
  const key = {
    limitId: tool === "codex" ? "codex" : "claude",
    rawKind: w.rawKind,
    windowMinutes: w.windowMinutes,
    scope: w.scope,
  };
  return {
    ...key,
    seriesId: seriesId(key),
    usedPercent: w.usedPercent,
    resetsAt: w.resetsAt.toISOString(),
    group: w.group,
    severity: null,
    isActive: null,
  };
}

export async function seedFictionalBoard(database: Database, now = new Date()): Promise<void> {
  const random = mulberry32(0x70_6f_76_21);
  const hour = 60 * 60 * 1_000;

  // Reset #1 is seeded by the migration itself; the dev seed adds volume, not history.

  // Page-view volume so the live strip breathes in dev.
  for (let h = 0; h < 46; h++) {
    await database.query(
      `insert into rate_buckets (scope, key_hash, bucket_start, count) values ('views-hour', 'home', $1, $2)
       on conflict (scope, key_hash, bucket_start) do update set count = rate_buckets.count + excluded.count`,
      [
        new Date(Math.floor(now.getTime() / hour) * hour - h * hour),
        18 + Math.floor(random() * 70),
      ],
    );
  }
  await database.query(
    `insert into rate_buckets (scope, key_hash, bucket_start, count) values ('views-minute', 'home', $1, $2)
     on conflict (scope, key_hash, bucket_start) do update set count = rate_buckets.count + excluded.count`,
    [new Date(Math.floor(now.getTime() / 60_000) * 60_000), 2 + Math.floor(random() * 5)],
  );

  let claimedRemaining = FICTIONAL_LOGINS.length;
  for (let index = 0; index < 46; index++) {
    const deviceId = `dev-seed-${index.toString().padStart(3, "0")}`;
    const claimed = claimedRemaining > 0 && random() < 0.3;
    let accountId: string | null = null;
    if (claimed) {
      claimedRemaining -= 1;
      const login = FICTIONAL_LOGINS[claimedRemaining] ?? `fictional-${index}`;
      const inserted = await database.query<{ id: string }>(
        `insert into accounts (github_id, github_login, avatar_url, github_created_at)
         values ($1, $2, $3, $4) returning id`,
        [
          900_000_000 + index,
          login,
          `https://avatars.invalid/${login}.png`,
          new Date(now.getTime() - 3_000 * hour),
        ],
      );
      accountId = inserted.rows[0]?.id ?? null;
    }
    await database.query(
      `insert into devices
         (id, public_key, anonymous_name, stable_hash, account_id, last_submitted_at,
          last_cli_version, last_platform_os)
       values ($1, $2, $3, $4, $5, $6, '0.0.0-dev', 'darwin')`,
      [
        deviceId,
        `dev-seed-key-${index}`,
        generateAnonymousName(random),
        stableDeviceHash(deviceId),
        accountId,
        new Date(now.getTime() - random() * 20 * hour),
      ],
    );

    // Lightweight submission rows so the movement ledger has volume in dev.
    const submissionCount = 1 + Math.floor(random() * 6);
    for (let n = 0; n < submissionCount; n++) {
      await database.query(
        `insert into submissions
           (device_id, received_at, submitted_at, trigger, schema_version, cli_version,
            platform_os, nonce, raw_body, signature)
         values ($1, $2, $2, 'manual', 1, '0.0.0-dev', 'darwin', $3, $4, 'dev-seed')`,
        [
          deviceId,
          new Date(now.getTime() - random() * 60 * hour),
          `dev-seed-${index}-${n}`,
          Buffer.alloc(0),
        ],
      );
    }

    // Misery shape: a starving head of the board, a rationing middle, a comfortable tail.
    const bucket = random();
    const weeklyUsed =
      bucket < 0.3 ? 97 + random() * 3 : bucket < 0.7 ? 55 + random() * 40 : random() * 55;
    const observedAt = new Date(now.getTime() - random() * (random() < 0.9 ? 20 : 40) * hour);

    const hasCodex = random() < 0.85;
    const hasClaude = !hasCodex || random() < 0.55;
    if (hasCodex) {
      const resetsAt = new Date(now.getTime() + (8 + random() * 150) * hour);
      const windows = [
        windowJson("codex", {
          rawKind: "primary",
          windowMinutes: 10080,
          scope: null,
          usedPercent: Math.round(weeklyUsed * 10) / 10,
          resetsAt,
          group: null,
        }),
      ];
      await database.query(
        `insert into tool_states
           (device_id, tool, install, observation, tool_version, observed_at, source_fetched_at,
            plan_raw, plan_label, windows, registry_version, state_nonce, updated_at)
         values ($1, 'codex', 'found', 'ok', null, $2, null, $3, $4, $5::jsonb, 1, $6, $7)`,
        [
          deviceId,
          observedAt,
          random() < 0.7 ? "plus" : "pro",
          random() < 0.7 ? "Plus" : "Pro",
          JSON.stringify(windows),
          `seed-${index}-codex`,
          now,
        ],
      );
    }
    if (hasClaude) {
      const claudeWeekly = Math.min(100, Math.max(0, weeklyUsed + (random() - 0.5) * 30));
      const windows = [
        windowJson("claude-code", {
          rawKind: "session",
          windowMinutes: 300,
          scope: null,
          usedPercent: Math.round(random() * 100),
          resetsAt: new Date(now.getTime() + random() * 5 * hour),
          group: "session",
        }),
        windowJson("claude-code", {
          rawKind: "weekly_all",
          windowMinutes: 10080,
          scope: null,
          usedPercent: Math.round(claudeWeekly * 10) / 10,
          resetsAt: new Date(now.getTime() + (10 + random() * 150) * hour),
          group: "weekly",
        }),
      ];
      const max20 = random() < 0.35;
      await database.query(
        `insert into tool_states
           (device_id, tool, install, observation, tool_version, observed_at, source_fetched_at,
            plan_raw, plan_label, windows, registry_version, state_nonce, updated_at)
         values ($1, 'claude-code', 'found', 'ok', null, $2, $2, $3, $4, $5::jsonb, 1, $6, $7)`,
        [
          deviceId,
          observedAt,
          max20 ? "default_claude_max_20x" : "default_claude_max_5x",
          max20 ? "Max 20x" : "Max 5x",
          JSON.stringify(windows),
          `seed-${index}-claude`,
          now,
        ],
      );
    }
  }
}
