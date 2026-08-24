import type { PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import { resetsIn } from "./format";
import { ClaudeCodeMark, CodexMark } from "./icons";

const TOOL_TITLE = { codex: "CODEX", "claude-code": "CLAUDE CODE" } as const;
const TOOL_ACCENT = { codex: "text-codex", "claude-code": "text-claude" } as const;
const TOOL_MONOGRAM = {
  codex: "bg-codex/15 text-codex",
  "claude-code": "bg-claude/15 text-claude",
} as const;

function remainingTone(remaining: number): string {
  if (remaining <= 3) return "text-broke";
  if (remaining <= 15) return "text-broke/80";
  if (remaining <= 40) return "text-warn";
  return "text-dim";
}

function Monogram({
  name,
  claimed,
  tool,
}: {
  name: string;
  claimed: boolean;
  tool: "codex" | "claude-code";
}) {
  return (
    <span
      aria-hidden
      className={`grid size-6 shrink-0 place-items-center rounded-[6px] text-[11px] font-bold uppercase shadow-[inset_0_1px_0_rgba(236,228,208,0.08),0_1px_2px_rgba(0,0,0,0.6)] ${
        claimed ? TOOL_MONOGRAM[tool] : "bg-panel-2 text-faint"
      }`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function Board({ board, now }: { board: PublicLeaderboardV1; now: Date }) {
  const rows = board.rows.slice(0, 15);
  return (
    <section
      aria-label={`${TOOL_TITLE[board.tool]} leaderboard`}
      className="border border-line bg-panel/60"
    >
      <header className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3">
        <h3 className="display flex items-center gap-2.5 text-sm font-extrabold tracking-[0.22em] text-paper">
          {board.tool === "codex" ? (
            <CodexMark className="size-4 text-codex" />
          ) : (
            <ClaudeCodeMark className="size-4 text-claude" />
          )}
          {TOOL_TITLE[board.tool]}
        </h3>
        <p className="text-[11px] uppercase tracking-[0.18em] text-faint">
          {board.global.devs} ranked
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">
          nobody has suffered here yet. be the first.
        </p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {rows.map((row) => {
            const remaining = Math.round(row.remainingPercent * 10) / 10;
            const top3 = row.rank <= 3;
            return (
              <li
                key={`${board.tool}-${row.rank}`}
                className={`grid grid-cols-[2.2rem_1fr_auto] items-center gap-x-3 px-4 ${
                  top3 ? "bg-panel-2/70 py-3" : "py-2.5"
                }`}
              >
                <span
                  className={`text-right tabular-nums ${
                    top3 ? `text-base font-bold ${TOOL_ACCENT[board.tool]}` : "text-sm text-faint"
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
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-faint">
                      {row.plan ?? "plan unknown"}
                      {row.claimed ? "" : " · anon"}
                    </span>
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={`block tabular-nums text-sm font-semibold ${remainingTone(remaining)}`}
                  >
                    {remaining}%
                  </span>
                  <span className="block text-[11px] tabular-nums text-faint">
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
