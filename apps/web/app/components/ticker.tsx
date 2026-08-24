import type { PublicLeaderboardV1 } from "@/src/lib/leaderboard";

/** Recent offerings, doubled for a seamless marquee loop. */
export function Ticker({ boards }: { boards: PublicLeaderboardV1[] }) {
  const entries = boards
    .flatMap((board) =>
      board.rows.map((row) => ({
        tool: board.tool === "codex" ? "codex" : "claude",
        name: row.name,
        remaining: Math.round(row.remainingPercent),
      })),
    )
    .slice(0, 18);
  if (entries.length === 0) return null;
  const loop = [...entries, ...entries];
  return (
    <div className="well overflow-hidden" aria-hidden>
      <div className="ticker-track flex w-max gap-10 whitespace-nowrap px-6 py-2">
        {loop.map((entry, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: presentational loop
            key={index}
            className="text-[11px] uppercase tracking-[0.16em] text-muted"
          >
            <span className={entry.tool === "codex" ? "text-codex/70" : "text-claude/70"}>▸</span>{" "}
            {entry.name} <span className="text-faint">filed at</span>{" "}
            <span className={entry.remaining <= 10 ? "text-broke" : "text-dim"}>
              {entry.remaining}% · {entry.tool}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
