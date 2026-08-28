import { BRAND } from "@tokenbroke/shared";
import Link from "next/link";
import type { PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import { FlapDigits } from "./flap";
import { compactNumber, lastSeen, resetsIn } from "./format";
import { ClaudeCodeMark, CodexMark } from "./icons";

const TOOL = {
  codex: {
    title: "Codex",
    by: "OpenAI",
    // OpenAI's identity is a clean neutral grotesk — paper-white, tight, no shouting.
    lockup: "display font-extrabold tracking-tight text-paper",
    wash: "from-codex/10",
    accent: "text-codex",
    chip: "bg-codex/15 text-codex",
    Mark: CodexMark,
  },
  "claude-code": {
    title: "Claude Code",
    by: "Anthropic",
    // Claude Code lives in a terminal — monospace, in its own orange.
    lockup: "font-bold tracking-tight text-claude",
    wash: "from-claude/10",
    accent: "text-claude",
    chip: "bg-claude/15 text-claude",
    Mark: ClaudeCodeMark,
  },
} as const;

/** Brand lockup: each tool's mark and name set in that tool's own voice, not ours. */
export function ToolLockup({ tool }: { tool: keyof typeof TOOL }) {
  const { title, by, lockup, Mark } = TOOL[tool];
  return (
    <span className="flex items-center gap-3">
      <Mark className="size-8 shrink-0" />
      <span className="flex flex-col">
        <span className={`text-lg leading-none ${lockup}`}>{title}</span>
        <span className="mt-1.5 text-[9px] uppercase leading-none tracking-[0.24em] text-faint">
          {by}
        </span>
      </span>
    </span>
  );
}

function remainingTone(remaining: number): string {
  if (remaining <= 3) return "text-broke";
  if (remaining <= 15) return "text-broke/75";
  return "text-dim";
}

function Monogram({
  name,
  claimed,
  tool,
}: {
  name: string;
  claimed: boolean;
  tool: keyof typeof TOOL;
}) {
  return (
    <span
      aria-hidden
      className={`grid size-6 shrink-0 place-items-center rounded-[6px] text-[11px] font-bold uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(16,24,40,0.18)] ${
        claimed ? TOOL[tool].chip : "bg-panel-2 text-faint"
      }`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** A battery reads instantly: full is good, empty is bad. Low charge = broke. */
function Battery({ percent }: { percent: number | null }) {
  const value = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const tone = value <= 10 ? "text-broke" : value <= 30 ? "text-warn" : "text-ok";
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`Collective battery at ${percent ?? "unknown"} percent`}
    >
      <div className={`well relative h-6 flex-1 overflow-hidden ${tone}`}>
        <div
          className="meter-cells absolute inset-y-[3px] left-[3px] rounded-[4px]"
          style={{ width: `calc(${Math.max(value, 3)}% - 3px)` }}
        />
      </div>
      <div className="h-3 w-1.5 rounded-r-[3px] bg-line" aria-hidden />
    </div>
  );
}

/** Every row gets its financial condition, stated flatly. */
function verdictFor(remaining: number): { word: string; tone: string } {
  if (remaining <= 1) return { word: "flatlined", tone: "text-broke" };
  if (remaining <= 5) return { word: "destitute", tone: "text-broke" };
  if (remaining <= 15) return { word: "rationed", tone: "text-warn" };
  if (remaining <= 30) return { word: "strained", tone: "text-warn" };
  return { word: "solvent", tone: "text-ok" };
}

/** Per-row charge bar tone: same thresholds as the collective battery. */
function meterTone(remaining: number): string {
  if (remaining <= 10) return "text-broke";
  if (remaining <= 30) return "text-warn";
  return "text-ok";
}

function statusEmoji(remaining: number): string {
  if (remaining <= 1) return "💀";
  if (remaining <= 5) return "🪫";
  if (remaining <= 15) return "😮‍💨";
  return "";
}

const MEDALS = ["🥇", "🥈", "🥉"] as const;

function Digits({ value }: { value: string }) {
  return (
    <FlapDigits
      value={value}
      gapClassName="gap-[2px]"
      charClassName="keycap display inline-block min-w-[1.2em] px-0.5 py-0.5 text-center text-2xl font-black tabular-nums text-paper"
    />
  );
}

/**
 * One lab, one card: its reset counter, its collective tank, its ranking.
 * The lab's color lives here and only here.
 */
export function LabUniverse({ board, now }: { board: PublicLeaderboardV1; now: Date }) {
  const { title, accent, wash, Mark } = TOOL[board.tool];
  const days = board.global.daysSinceReset;
  const median = board.global.medianRemainingPercent;
  const rows = board.rows.slice(0, 12);
  const staleRows = board.staleRows.slice(0, 8);

  return (
    <section
      aria-label={`${title}: state and leaderboard`}
      className="panel relative overflow-hidden rounded-2xl"
    >
      {/* A faint wash of the lab's own color across the header. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent ${wash}`}
      />
      {/* The lab's mark, big and off-kilter, clipped by its own universe. */}
      <Mark className="pointer-events-none absolute -right-7 -top-7 size-40 rotate-[-12deg] opacity-[0.08]" />

      <header className="relative flex items-center justify-between gap-4 px-5 pt-5">
        <h3>
          <ToolLockup tool={board.tool} />
        </h3>
        <p className="text-[11px] uppercase tracking-[0.18em] text-faint">
          {board.global.devs} on the board
        </p>
      </header>

      <div className="relative grid gap-5 px-5 pb-5 pt-5 sm:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">days since reset</p>
          <div className="mt-2">
            {days === null ? (
              <p className="display text-2xl font-black text-broke">NONE YET</p>
            ) : (
              <Digits value={String(days).padStart(3, "0")} />
            )}
          </div>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-faint">
            {days === 0 ? "landed today. it can be done." : "and counting."}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
            our collective battery
          </p>
          <p className="display mt-1 text-3xl font-black tabular-nums text-paper">
            {median === null ? "—" : `${Math.round(median * 10) / 10}%`}
            <span className="ml-2 align-middle text-lg" aria-hidden>
              {median !== null && median <= 15 ? "🪫" : "🔋"}
            </span>
          </p>
          <div className="mt-2">
            <Battery percent={median} />
          </div>
          <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-faint">
            what's left when you average all of us
          </p>
        </div>
      </div>

      <p className="relative border-t border-line-soft px-5 py-2 text-center text-[9px] uppercase tracking-[0.16em] text-faint">
        {rows.length > 0 && rows.every((row) => (row.misery ?? 0) === 0) ? (
          <>
            ranked by <span className="text-muted">misery</span>, which starts past 50% burned.
            nobody is there yet, so <span className="text-muted">least remaining leads</span>
          </>
        ) : (
          <>
            ranked by <span className="text-muted">misery</span>: the less you have left and the
            longer your wait, the higher you climb
          </>
        )}
      </p>
      {rows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-10 text-center text-sm text-muted">
          {staleRows.length > 0
            ? "everyone here has gone quiet. one command wakes the board."
            : "nobody has suffered here yet. be the first."}
        </p>
      ) : (
        <ol className="relative border-t border-line-soft">
          {rows.map((row) => {
            const remaining = Math.round(row.remainingPercent * 10) / 10;
            // Medals are for the genuinely miserable: a solvent board crowns nobody.
            const top3 = row.rank <= 3 && (row.misery ?? 0) > 0;
            const verdict = verdictFor(remaining);
            return (
              <li
                key={`${board.tool}-${row.rank}`}
                className="border-b border-line-soft last:border-b-0"
              >
                <Link
                  href={`/u/${encodeURIComponent(row.name)}`}
                  className={`grid grid-cols-[2.2rem_1fr_auto] items-center gap-x-3 px-5 ${
                    top3 ? "bg-panel-2/80 py-3.5" : "py-3"
                  } transition-colors duration-150 hover:bg-panel-2`}
                >
                  <span
                    className={`text-right tabular-nums ${top3 ? "text-lg" : "text-sm text-faint"}`}
                    role="img"
                    aria-label={`rank ${row.rank}`}
                  >
                    {top3 ? MEDALS[row.rank - 1] : row.rank}
                  </span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Monogram name={row.name} claimed={row.claimed} tool={board.tool} />
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm ${
                          row.claimed ? "font-semibold text-paper" : "text-dim"
                        }`}
                      >
                        {row.name}
                      </span>
                      <span className="block text-[10px] uppercase tracking-[0.14em] text-faint">
                        <span className={verdict.tone}>{verdict.word}</span>
                        {" · "}
                        {row.plan ?? "plan unknown"}
                        {row.claimed ? "" : " · anon"}
                        {row.modelScoped && (
                          <span className={`ml-1.5 ${accent}`}>
                            {row.modelScoped.label} {row.modelScoped.remainingPercent}%
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm tabular-nums">
                      <span className="mr-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">
                        misery
                      </span>
                      <span className="font-semibold text-paper">
                        {row.misery !== undefined ? compactNumber(row.misery) : "—"}
                      </span>
                    </span>
                    <span className="block text-[10px] tabular-nums text-faint">
                      <span className={remainingTone(remaining)}>{remaining}% left</span>
                      {statusEmoji(remaining) && (
                        <span className="ml-1" aria-hidden>
                          {statusEmoji(remaining)}
                        </span>
                      )}
                      {" · resets in "}
                      <span className="text-dim">{resetsIn(row.resetsAt, now)}</span>
                    </span>
                  </span>
                  {/* The "why" made visible: how much charge this dev has left. */}
                  <span
                    aria-hidden
                    className={`col-span-full mt-2 block h-[4px] overflow-hidden rounded-full bg-[var(--well-bg)] ${meterTone(remaining)}`}
                  >
                    <span
                      className="meter-cells block h-full rounded-full"
                      style={{ width: `${Math.max(remaining, 2)}%` }}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {/* The stale lane (RFC 003 §8.3): rows gone quiet stay visible, unranked, numbers frozen
          at their own last run. The board forgets nobody inside seven days. */}
      {staleRows.length > 0 && (
        <div className="relative border-t border-line-soft">
          <p className="px-5 pt-3 text-center text-[9px] uppercase tracking-[0.16em] text-faint">
            gone quiet · unranked · numbers as of each row&apos;s last run
          </p>
          <ul className="pb-1 pt-2">
            {staleRows.map((row) => (
              <li key={`${board.tool}-stale-${row.name}`}>
                <Link
                  href={`/u/${encodeURIComponent(row.name)}`}
                  className="grid grid-cols-[2.2rem_1fr_auto] items-center gap-x-3 px-5 py-2 opacity-60 transition-opacity duration-150 hover:opacity-100"
                >
                  <span aria-hidden className="text-right text-sm text-faint">
                    ·
                  </span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Monogram name={row.name} claimed={row.claimed} tool={board.tool} />
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm ${
                          row.claimed ? "font-semibold text-dim" : "text-muted"
                        }`}
                      >
                        {row.name}
                      </span>
                      <span className="block text-[10px] uppercase tracking-[0.14em] text-faint">
                        {row.servedSentence ? "sentence served" : "gone stale"}
                        {" · "}
                        {row.plan ?? "plan unknown"}
                        {row.claimed ? "" : " · anon"}
                      </span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm tabular-nums text-dim">
                      {row.remainingPercent}% left
                    </span>
                    <span className="block text-[10px] tabular-nums text-faint">
                      last seen {lastSeen(row.observedAt, now)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {board.staleRows.length > staleRows.length && (
            <p className="pb-3 text-center text-[9px] uppercase tracking-[0.16em] text-faint">
              and {board.staleRows.length - staleRows.length} more, quieter still
            </p>
          )}
        </div>
      )}
      {board.rows.length > rows.length && (
        <p className="border-t border-line-soft px-5 py-3 text-center text-[10px] uppercase tracking-[0.16em] text-faint">
          top {rows.length} of {board.rows.length} on the record · find yourself:{" "}
          <span className="text-dim">{BRAND.cliCommand}</span>
        </p>
      )}
    </section>
  );
}
