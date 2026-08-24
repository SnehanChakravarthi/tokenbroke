import type {
  LeaderboardRow,
  LocalReadings,
  SubmissionSuccessV1,
  ToolId,
  ToolReading,
} from "@tokenbroke/shared";
import { classify, freshnessState, toolMisery } from "@tokenbroke/shared";
import { COPY, TOOL_LABELS } from "./copy";

const MAX_WIDTH = 80;

function visibleLength(value: string): number {
  return value.replaceAll("\u001b[1m", "").replaceAll("\u001b[0m", "").length;
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  return width <= 1 ? value.slice(0, width) : `${value.slice(0, width - 1)}…`;
}

function fit(value: string): string {
  return visibleLength(value) <= MAX_WIDTH ? value : truncate(value, MAX_WIDTH);
}

function wrap(value: string): string[] {
  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > MAX_WIDTH) {
    const boundary = remaining.lastIndexOf(" ", MAX_WIDTH);
    const splitAt = boundary > 0 ? boundary : MAX_WIDTH;
    lines.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  lines.push(remaining);
  return lines;
}

function emphasize(value: string): string {
  return process.stdout.isTTY ? `\u001b[1m${value}\u001b[0m` : value;
}

function timeRemaining(resetsAt: string | null, now = new Date()): string {
  if (resetsAt === null) return "—";
  const milliseconds = Date.parse(resetsAt) - now.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0m";
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return `${hours}h${remainder > 0 ? `${remainder}m` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days}d${hours % 24 > 0 ? `${hours % 24}h` : ""}`;
}

function renderRow(row: LeaderboardRow): string {
  const badge = row.claimed ? "" : ` [${COPY.anonymousBadge}]`;
  const name = truncate(`${row.name}${badge}`, 27).padEnd(27);
  const plan = truncate(row.plan ?? "—", 12).padEnd(12);
  const marker = row.isYou ? ` ${COPY.youMarker}` : "";
  const line = `${String(row.rank).padStart(3)}  ${name} ${plan} ${String(Math.round(row.remainingPercent)).padStart(3)}%  ${timeRemaining(row.resetsAt).padStart(7)}${marker}`;
  return row.isYou ? emphasize(fit(line)) : fit(line);
}

function dedupeRows(rows: LeaderboardRow[]): LeaderboardRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.rank}:${row.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowsForBlock(
  top: LeaderboardRow[],
  neighbors: LeaderboardRow[],
): Array<LeaderboardRow | null> {
  const rows = dedupeRows([...top, ...neighbors]).sort((left, right) => left.rank - right.rank);
  const result: Array<LeaderboardRow | null> = [];
  for (const row of rows) {
    const previous = result.at(-1);
    if (previous && row.rank > previous.rank + 1) result.push(null);
    result.push(row);
  }
  return result;
}

/** `2d 3h` past a day out, `4h 12m` inside one. Your own numbers deserve both units. */
function resetsIn(resetsAt: string | null, now: Date): string {
  if (resetsAt === null) return "—";
  const milliseconds = Date.parse(resetsAt) - now.getTime();
  if (!Number.isFinite(milliseconds)) return "—";
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
}

const ROLE_ORDER = { ranked: 0, secondary: 1, ignored: 2 } as const;

/**
 * The user's own numbers, one line per ranked or secondary window. Always rendered for a detected
 * tool with a snapshot — "not broke" is a verdict on the numbers, not a reason to hide them.
 */
function ownStatusLines(reading: ToolReading, now: Date): string[] {
  return reading.windows
    .map((window) => ({ window, classified: classify(window, reading.tool) }))
    .filter(({ classified }) => classified.role !== "ignored")
    .sort((left, right) => ROLE_ORDER[left.classified.role] - ROLE_ORDER[right.classified.role])
    .map(({ window, classified }) => {
      const remaining = Math.max(0, Math.round(100 - window.usedPercent));
      const parts = [
        `${classified.shortLabel} ${remaining}% remaining`,
        `resets in ${resetsIn(window.resetsAt, now)}`,
      ];
      if (reading.plan.label) parts.push(reading.plan.label);
      return fit(`  ${parts.join(" · ")}`);
    });
}

function stateLine(
  reading: ToolReading,
  rankable: boolean,
  misery: number | null,
  now: Date,
): string | null {
  if (freshnessState(reading, now) !== "fresh") {
    const binding = toolMisery(reading, now).bindingWindow;
    if (binding?.resetsAt && Date.parse(binding.resetsAt) <= now.getTime()) {
      return COPY.sentenceServed;
    }
    const observedAt = Date.parse(reading.observedAt ?? "");
    if (Number.isFinite(observedAt)) {
      return COPY.asOf(Math.max(0, (now.getTime() - observedAt) / 3_600_000));
    }
  }
  if (!rankable || misery === 0) return COPY.notBroke;
  return null;
}

/**
 * Human-sized rehearsal: what was read, what would be sent, and how big it is. The full redacted
 * payload is available behind --full; nobody should have to scroll past 2,000 drain samples.
 */
export function renderDryRun(
  readings: LocalReadings,
  payload: Record<string, unknown>,
  payloadBytes: number,
  now: Date = new Date(),
): string {
  const lines: string[] = [COPY.dryRun, ""];
  for (const reading of readings) {
    lines.push(COPY.boardTitle(TOOL_LABELS[reading.tool]));
    if (reading.install !== "found") {
      lines.push(`  ${COPY.oneToolMissing(TOOL_LABELS[reading.tool])}`);
    } else if (reading.windows.length === 0) {
      lines.push(`  ${COPY.noSnapshot(TOOL_LABELS[reading.tool])}`);
    } else {
      lines.push(...ownStatusLines(reading, now));
    }
    const meta = [
      `status ${reading.install}/${reading.observation}`,
      `plan ${reading.plan.raw ?? "unknown"}`,
      `drain samples ${reading.drain.length}`,
    ];
    if (reading.warnings.length > 0) meta.push(`warnings ${reading.warnings.join(",")}`);
    lines.push(fit(`  ${meta.join(" · ")}`), "");
  }
  lines.push(
    COPY.dryRunPayload(
      String(payload.schemaVersion),
      String(payload.cliVersion),
      String(payload.trigger),
      payloadBytes,
      Object.keys(payload).sort(),
    ),
  );
  return lines.join("\n");
}

function readingFor(readings: LocalReadings, tool: ToolId): ToolReading | null {
  return readings.find((reading) => reading.tool === tool) ?? null;
}

/* ---------- The offering receipt ---------- */

const W = 56;

const PIXEL_WORDMARK = [
  "▀█▀ █▀█ █▄▀ █▀▀ █▄░█ █▄▄ █▀█ █▀█ █▄▀ █▀▀",
  "░█░ █▄█ █░█ ██▄ █░▀█ █▄█ █▀▄ █▄█ █░█ ██▄",
];

type Tone = "red" | "green" | "yellow" | "blue" | "orange" | "dim" | "bold";
const CODES: Record<Tone, string> = {
  red: "\u001b[91m",
  green: "\u001b[92m",
  yellow: "\u001b[93m",
  blue: "\u001b[94m",
  orange: "\u001b[38;5;208m",
  dim: "\u001b[90m",
  bold: "\u001b[1m",
};
const RESET = "\u001b[0m";

function paint(value: string, tone: Tone): string {
  return process.stdout.isTTY ? `${CODES[tone]}${value}${RESET}` : value;
}

function stripAnsi(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping needs the escape byte
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function center(value: string): string {
  const pad = Math.max(0, Math.floor((W - stripAnsi(value).length) / 2));
  return " ".repeat(pad) + value;
}

function tear(): string {
  const side = "─ ".repeat(Math.floor((W - 4) / 4));
  return paint(`${side}8< ${side}`.slice(0, W), "dim");
}

function dots(): string {
  return paint("·".repeat(W), "dim");
}

function kv(label: string, value: string): string {
  return `  ${paint(label.padEnd(18), "dim")}${value}`;
}

function severityTone(remaining: number): Tone {
  if (remaining <= 10) return "red";
  if (remaining <= 30) return "yellow";
  return "green";
}

function chargeBar(remaining: number): string {
  const cells = Math.round(Math.max(0, Math.min(100, remaining)) / 10);
  return paint("▓".repeat(cells) + "░".repeat(10 - cells), severityTone(remaining));
}

function toolTone(tool: ToolId): Tone {
  return tool === "codex" ? "blue" : "orange";
}

function receiptRow(row: LeaderboardRow): string {
  const marker = row.isYou ? paint(" ◀ you", "red") : "";
  const badge = row.claimed ? "" : ` [${COPY.anonymousBadge}]`;
  const name = truncate(`${row.name}${badge}`, 26).padEnd(26);
  const remaining = `${String(Math.round(row.remainingPercent)).padStart(3)}%`;
  return `  ${paint(`#${row.rank}`.padStart(4), row.rank <= 3 ? "bold" : "dim")} ${name} ${paint(remaining, severityTone(row.remainingPercent))} ${paint(timeRemaining(row.resetsAt).padStart(6), "dim")}${marker}`;
}

function stamp(text: string, tone: Tone): string[] {
  const inner = ` ${text} `;
  return [
    center(paint(`┌${"─".repeat(inner.length)}┐`, tone)),
    center(paint(`│${inner}│`, tone)),
    center(paint(`└${"─".repeat(inner.length)}┘`, tone)),
  ];
}

export function renderBoard(response: SubmissionSuccessV1, readings: LocalReadings): string {
  const now = new Date();
  const lines: string[] = ["", tear()];
  for (const row of PIXEL_WORDMARK) lines.push(center(paint(row, "red")));
  lines.push(center(paint("t o k e n b r o k e . l o l", "dim")), dots());

  lines.push(kv("OFFERING RECEIPT", paint(`№ ${response.identity.deviceId.slice(0, 9)}`, "bold")));
  lines.push(
    kv(
      "FILED BY",
      response.identity.claimed
        ? paint(`@${response.identity.claimed.githubLogin}`, "bold")
        : response.identity.anonymousName,
    ),
  );
  lines.push(kv("DATE", now.toISOString().slice(0, 16).replace("T", " ")));

  for (const result of response.perTool) {
    lines.push(dots());
    const label = TOOL_LABELS[result.tool];
    const reading = readingFor(readings, result.tool);
    const plan = reading?.plan.label ?? "";
    lines.push(
      `  ${paint(label.toUpperCase(), toolTone(result.tool))}${plan ? paint(` · ${plan}`, "dim") : ""}`,
    );
    if (reading === null || reading.install !== "found") {
      lines.push(`  ${COPY.oneToolMissing(label)}`);
      continue;
    }
    if (reading.observation !== "ok" || reading.windows.length === 0) {
      lines.push(`  ${COPY.noSnapshot(label)}`);
      continue;
    }
    for (const { window, classified } of reading.windows
      .map((window) => ({ window, classified: classify(window, reading.tool) }))
      .filter(({ classified }) => classified.role !== "ignored")
      .sort(
        (left, right) => ROLE_ORDER[left.classified.role] - ROLE_ORDER[right.classified.role],
      )) {
      const remaining = Math.max(0, Math.round(100 - window.usedPercent));
      lines.push(
        `    ${classified.shortLabel.padEnd(9)} ${chargeBar(remaining)} ${paint(`${String(remaining).padStart(3)}% left`, severityTone(remaining))}  ${paint(`resets ${timeRemaining(window.resetsAt, now)}`, "dim")}`,
      );
    }
    const state = stateLine(reading, result.rankable, result.misery, now);
    if (state) {
      lines.push(`  ${paint(`VERDICT: ${state.toUpperCase()}`, "dim")}`);
    } else {
      lines.push("");
      for (const row of rowsForBlock(result.top, result.neighbors)) {
        lines.push(row === null ? paint("   ····", "dim") : receiptRow(row));
      }
      lines.push("");
      if (result.rank !== null) {
        const tone: Tone = result.rank <= 3 ? "red" : "yellow";
        lines.push(...stamp(`#${result.rank} BROKEST ON ${label.toUpperCase()}`, tone));
      }
      lines.push(center(paint(result.roast, "bold")));
    }
  }

  lines.push(dots(), `  ${paint("THE RECORD", "bold")}`);
  lines.push(
    `    ${response.global.devs} dev${response.global.devs === 1 ? "" : "s"} on the record`,
  );
  for (const item of response.global.perTool) {
    const median = item.medianRemainingPercent;
    lines.push(
      `    ${paint(TOOL_LABELS[item.tool].toLowerCase().padEnd(12), toolTone(item.tool))}${paint(
        `median ${median === null ? "—" : `${Math.round(median)}%`} · ${item.daysSinceReset ?? "—"} days since reset`,
        "dim",
      )}`,
    );
  }

  lines.push(dots());
  if (response.identity.claimed) {
    lines.push(`  ${COPY.claimed(response.identity.claimed.githubLogin)}`);
  } else if (response.claim) {
    lines.push(`  ${paint("CLAIM THIS ROW", "bold")} ${paint("(github, optional)", "dim")}`);
    lines.push(`  → ${paint(response.claim.url, "bold")}`);
    lines.push(`  ${paint("vanity is free. rank is earned.", "dim")}`);
  }
  lines.push(dots());
  lines.push(center(paint("one small command for a dev —", "dim")));
  lines.push(center(paint("one giant leap for devkind.", "bold")));
  lines.push(tear(), "");
  return lines.join("\n");
}
