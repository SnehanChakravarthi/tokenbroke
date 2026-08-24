import type { PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import { FlapDigits } from "./flap";
import { resetsIn } from "./format";
import { ClaudeCodeMark, CodexMark } from "./icons";

const TOOL = {
  codex: { title: "CODEX", accent: "text-codex", chip: "bg-codex/15 text-codex", Mark: CodexMark },
  "claude-code": {
    title: "CLAUDE CODE",
    accent: "text-claude",
    chip: "bg-claude/15 text-claude",
    Mark: ClaudeCodeMark,
  },
} as const;

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
  const { title, accent, Mark } = TOOL[board.tool];
  const days = board.global.daysSinceReset;
  const median = board.global.medianRemainingPercent;
  const rows = board.rows.slice(0, 12);

  return (
    <section
      aria-label={`${title} — state and leaderboard`}
      className="panel relative overflow-hidden rounded-2xl"
    >
      {/* The lab's mark, big and off-kilter, clipped by its own universe. */}
      <Mark
        className={`pointer-events-none absolute -right-7 -top-7 size-40 rotate-[-12deg] ${accent} opacity-[0.08]`}
      />

      <header className="relative flex items-baseline justify-between gap-4 px-5 pt-5">
        <h3
          className={`display flex items-center gap-2.5 text-base font-black tracking-[0.18em] ${accent}`}
        >
          <Mark className="size-5" />
          {title}
        </h3>
        <p className="text-[11px] uppercase tracking-[0.18em] text-faint">
          {board.global.devs} on the board
        </p>
      </header>

      <div className="relative grid grid-cols-2 gap-5 px-5 pb-5 pt-5">
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
            tokens left, all of us
          </p>
          <p className="display mt-1 text-3xl font-black tabular-nums text-paper">
            {median === null ? "—" : `${Math.round(median * 10) / 10}%`}
          </p>
          <div
            className="well relative mt-2 h-3 overflow-hidden"
            role="img"
            aria-label={`Tokens left across everyone: ${median ?? "unknown"} percent; below 10 percent is broke`}
          >
            {median !== null && (
              <div
                className="meter-cells absolute inset-y-[2px] left-[2px] rounded-[4px] text-ok"
                style={{ width: `${Math.max(2, Math.min(100, median))}%` }}
              />
            )}
            <div className="absolute inset-y-[-3px] left-[10%] w-px bg-broke" />
          </div>
          <p className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.14em] text-faint">
            <span>0%</span>
            <span className="text-broke">broke line</span>
            <span>100%</span>
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-10 text-center text-sm text-muted">
          nobody has suffered here yet. be the first.
        </p>
      ) : (
        <ol className="relative border-t border-line-soft">
          {rows.map((row) => {
            const remaining = Math.round(row.remainingPercent * 10) / 10;
            const top3 = row.rank <= 3;
            return (
              <li
                key={`${board.tool}-${row.rank}`}
                className={`grid grid-cols-[2.2rem_1fr_auto] items-center gap-x-3 px-5 ${
                  top3 ? "bg-panel-2/80 py-3" : "py-2.5"
                } border-b border-line-soft last:border-b-0`}
              >
                <span
                  className={`text-right tabular-nums ${
                    top3 ? `text-base font-bold ${accent}` : "text-sm text-faint"
                  }`}
                >
                  {row.rank}
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
                      {row.plan ?? "plan unknown"}
                      {row.claimed ? "" : " · anon"}
                    </span>
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={`block text-sm font-semibold tabular-nums ${remainingTone(remaining)}`}
                  >
                    {remaining}%
                  </span>
                  <span className="block text-[10px] tabular-nums text-faint">
                    resets {resetsIn(row.resetsAt, now)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
